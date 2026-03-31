#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# deploy-backend.sh — Build and deploy the MBG backend to Cloud Run
# ─────────────────────────────────────────────────────────────────────────────
#
# Usage:
#   ./infrastructure/deploy-backend.sh [PROJECT_ID]
#
# Prerequisites:
#   - gcloud CLI authenticated: gcloud auth login
#   - Docker authenticated to Artifact Registry:
#       gcloud auth configure-docker us-central1-docker.pkg.dev
#   - Terraform has been applied (infrastructure exists)
#
# This script:
#   1. Builds the Docker image from the repo root
#   2. Tags it for Artifact Registry
#   3. Pushes to Artifact Registry
#   4. Updates the Cloud Run service to use the new image
#   5. Runs database migrations via Cloud SQL Proxy
#   6. Verifies the health check
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

# ─── Configuration ───────────────────────────────────────────────────────────

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

PROJECT_ID="${1:-${GOOGLE_CLOUD_PROJECT:-}}"
REGION="${MBG_REGION:-us-central1}"
SERVICE_NAME="${MBG_BACKEND_SERVICE:-mbg-backend}"
INSTANCE_NAME="${MBG_DB_INSTANCE:-mbg-postgres}"
REGISTRY="${REGION}-docker.pkg.dev/${PROJECT_ID}/mbg-images"
IMAGE_NAME="mbg-backend"
TAG="${MBG_IMAGE_TAG:-$(date +%Y%m%d-%H%M%S)}"

# ─── Validation ──────────────────────────────────────────────────────────────

if [[ -z "${PROJECT_ID}" ]]; then
  echo "ERROR: PROJECT_ID is required."
  echo "Usage: $0 <PROJECT_ID>"
  echo "   or: export GOOGLE_CLOUD_PROJECT=your-project-id"
  exit 1
fi

# ─── Pre-flight checks ─────────────────────────────────────────────────────

echo "[Pre-flight] Running validation checks..."

# Verify Dockerfile exists
if [[ ! -f "${REPO_ROOT}/packages/backend/Dockerfile" ]]; then
  echo "ERROR: Dockerfile not found at packages/backend/Dockerfile"
  exit 1
fi

# Verify gcloud is authenticated
if ! gcloud auth print-access-token &> /dev/null; then
  echo "ERROR: gcloud is not authenticated. Run: gcloud auth login"
  exit 1
fi

# Verify the GCP project exists and is accessible
if ! gcloud projects describe "${PROJECT_ID}" &> /dev/null; then
  echo "ERROR: Cannot access GCP project '${PROJECT_ID}'."
  echo "Verify the project ID and your IAM permissions."
  exit 1
fi

# Verify Docker daemon is running
if ! docker info &> /dev/null; then
  echo "ERROR: Docker daemon is not running. Start Docker and try again."
  exit 1
fi

# Verify the Cloud Run service exists (Terraform must have been applied)
if ! gcloud run services describe "${SERVICE_NAME}" --project="${PROJECT_ID}" --region="${REGION}" &> /dev/null; then
  echo "ERROR: Cloud Run service '${SERVICE_NAME}' not found in ${REGION}."
  echo "Have you run 'terraform apply'? The infrastructure must exist first."
  exit 1
fi

# Verify Firebase service account secret exists
if ! gcloud secrets describe FIREBASE_SERVICE_ACCOUNT --project="${PROJECT_ID}" &> /dev/null; then
  echo "WARNING: FIREBASE_SERVICE_ACCOUNT secret not found in Secret Manager."
  echo "The backend will fail to verify JWT tokens without it."
  echo "Add it with: gcloud secrets versions add FIREBASE_SERVICE_ACCOUNT --data-file=service-account.json"
fi

echo "[Pre-flight] All checks passed."
echo ""

echo "============================================================"
echo "  MBG Backend Deployment"
echo "============================================================"
echo ""
echo "  Project:    ${PROJECT_ID}"
echo "  Region:     ${REGION}"
echo "  Service:    ${SERVICE_NAME}"
echo "  Registry:   ${REGISTRY}"
echo "  Image Tag:  ${TAG}"
echo ""

# ─── Step 1: Authenticate Docker ────────────────────────────────────────────

echo "[1/6] Configuring Docker authentication..."
gcloud auth configure-docker "${REGION}-docker.pkg.dev" --quiet

# ─── Step 2: Build Docker image ─────────────────────────────────────────────

echo "[2/6] Building Docker image..."
cd "${REPO_ROOT}"
docker build \
  -f packages/backend/Dockerfile \
  -t "${REGISTRY}/${IMAGE_NAME}:${TAG}" \
  -t "${REGISTRY}/${IMAGE_NAME}:latest" \
  .

# ─── Step 3: Push to Artifact Registry ──────────────────────────────────────

echo "[3/6] Pushing to Artifact Registry..."
docker push "${REGISTRY}/${IMAGE_NAME}:${TAG}"
docker push "${REGISTRY}/${IMAGE_NAME}:latest"

echo "  Pushed: ${REGISTRY}/${IMAGE_NAME}:${TAG}"

# ─── Step 4: Deploy to Cloud Run ────────────────────────────────────────────

echo "[4/6] Deploying to Cloud Run..."
gcloud run services update "${SERVICE_NAME}" \
  --project="${PROJECT_ID}" \
  --region="${REGION}" \
  --image="${REGISTRY}/${IMAGE_NAME}:${TAG}" \
  --quiet

echo "  Deployed: ${SERVICE_NAME} with image tag ${TAG}"

# ─── Step 5: Run database migration ─────────────────────────────────────────

echo "[5/6] Running database migrations..."
echo "  Starting Cloud SQL Proxy..."

# Check if cloud-sql-proxy is available
if ! command -v cloud-sql-proxy &> /dev/null; then
  echo "  WARNING: cloud-sql-proxy not found. Skipping migration."
  echo "  Install it from: https://cloud.google.com/sql/docs/postgres/sql-proxy"
  echo "  Then run manually:"
  echo "    cloud-sql-proxy ${PROJECT_ID}:${REGION}:${INSTANCE_NAME} &"
  echo "    cd ${REPO_ROOT}/packages/backend"
  echo "    DATABASE_URL=\"postgresql://mbg_app:PASSWORD@localhost:5432/media_buying_governance\" pnpm prisma migrate deploy"
else
  # Start proxy in background
  cloud-sql-proxy "${PROJECT_ID}:${REGION}:${INSTANCE_NAME}" --port=5433 &
  PROXY_PID=$!
  sleep 3

  # Read the database password from Secret Manager
  DB_PASSWORD=$(gcloud secrets versions access latest --secret=DATABASE_URL --project="${PROJECT_ID}" | \
    sed -n 's|.*://[^:]*:\([^@]*\)@.*|\1|p')

  cd "${REPO_ROOT}/packages/backend"
  DATABASE_URL="postgresql://mbg_app:${DB_PASSWORD}@localhost:5433/media_buying_governance" \
    npx prisma migrate deploy

  echo "  Migrations complete."

  # Stop proxy
  kill "${PROXY_PID}" 2>/dev/null || true
fi

# ─── Step 6: Verify health check ────────────────────────────────────────────

echo "[6/6] Verifying deployment..."

BACKEND_URL=$(gcloud run services describe "${SERVICE_NAME}" \
  --project="${PROJECT_ID}" \
  --region="${REGION}" \
  --format="value(status.url)")

echo "  Backend URL: ${BACKEND_URL}"

# Wait for Cloud Run to become ready
sleep 5

HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "${BACKEND_URL}/healthz" || echo "000")

if [[ "${HTTP_STATUS}" == "200" ]]; then
  echo "  Health check PASSED (HTTP ${HTTP_STATUS})"
  HEALTH_RESPONSE=$(curl -s "${BACKEND_URL}/healthz")
  echo "  Response: ${HEALTH_RESPONSE}"
else
  echo "  WARNING: Health check returned HTTP ${HTTP_STATUS}"
  echo "  The service may still be starting up. Check logs:"
  echo "    gcloud run services logs read ${SERVICE_NAME} --project=${PROJECT_ID} --region=${REGION} --limit=50"
fi

# ─── Done ────────────────────────────────────────────────────────────────────

echo ""
echo "============================================================"
echo "  Deployment Complete"
echo "============================================================"
echo ""
echo "  Backend URL:  ${BACKEND_URL}"
echo "  Health Check: ${BACKEND_URL}/healthz"
echo "  Image:        ${REGISTRY}/${IMAGE_NAME}:${TAG}"
echo ""
echo "  View logs:"
echo "    gcloud run services logs read ${SERVICE_NAME} --project=${PROJECT_ID} --region=${REGION} --limit=50"
echo ""
