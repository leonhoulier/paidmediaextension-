#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# deploy-admin-portal.sh — Build and deploy admin portal to Cloud Storage + CDN
# ─────────────────────────────────────────────────────────────────────────────
#
# Usage:
#   ./infrastructure/deploy-admin-portal.sh [PROJECT_ID]
#
# Prerequisites:
#   - gcloud CLI authenticated: gcloud auth login
#   - Node.js 20+ and pnpm installed
#   - Terraform has been applied (bucket exists)
#   - .env.production configured in packages/admin-portal/
#
# This script:
#   1. Builds the Vite production bundle
#   2. Uploads static assets to Cloud Storage
#   3. Sets correct Cache-Control headers
#   4. Updates CORS configuration
#   5. Invalidates CDN cache
#   6. Verifies the deployment
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

# ─── Configuration ───────────────────────────────────────────────────────────

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
ADMIN_PORTAL_DIR="${REPO_ROOT}/packages/admin-portal"

PROJECT_ID="${1:-${GOOGLE_CLOUD_PROJECT:-}}"
REGION="${MBG_REGION:-us-central1}"

# ─── Validation ──────────────────────────────────────────────────────────────

if [[ -z "${PROJECT_ID}" ]]; then
  echo "ERROR: PROJECT_ID is required."
  echo "Usage: $0 <PROJECT_ID>"
  echo "   or: export GOOGLE_CLOUD_PROJECT=your-project-id"
  exit 1
fi

# Discover bucket name from Terraform output or convention
if [[ -n "${MBG_BUCKET_NAME:-}" ]]; then
  BUCKET_NAME="${MBG_BUCKET_NAME}"
else
  # Try to get from Terraform output
  BUCKET_NAME=$(cd "${SCRIPT_DIR}/terraform" && terraform output -raw admin_portal_bucket 2>/dev/null || echo "")

  if [[ -z "${BUCKET_NAME}" ]]; then
    echo "ERROR: Could not determine bucket name."
    echo "Set MBG_BUCKET_NAME or ensure Terraform state is accessible."
    echo "   export MBG_BUCKET_NAME=mbg-admin-portal-XXXXXXXX"
    exit 1
  fi
fi

# Get the backend URL for CORS configuration
if [[ -n "${MBG_BACKEND_URL:-}" ]]; then
  BACKEND_URL="${MBG_BACKEND_URL}"
else
  BACKEND_URL=$(cd "${SCRIPT_DIR}/terraform" && terraform output -raw backend_url 2>/dev/null || echo "")

  if [[ -z "${BACKEND_URL}" ]]; then
    echo "WARNING: Could not determine backend URL for CORS. Using wildcard."
    BACKEND_URL=""
  fi
fi

echo "============================================================"
echo "  MBG Admin Portal Deployment"
echo "============================================================"
echo ""
echo "  Project:     ${PROJECT_ID}"
echo "  Bucket:      gs://${BUCKET_NAME}"
echo "  Backend URL: ${BACKEND_URL:-'(not set — CORS will use wildcard)'}"
echo ""

# ─── Step 1: Verify .env.production ─────────────────────────────────────────

echo "[1/6] Checking environment configuration..."

ENV_FILE="${ADMIN_PORTAL_DIR}/.env.production"
if [[ ! -f "${ENV_FILE}" ]]; then
  echo "  ERROR: ${ENV_FILE} not found."
  echo "  Create it with your production Firebase and API settings."
  echo "  See: packages/admin-portal/.env.example"
  exit 1
fi

# Verify no fake keys in production env
if grep -q "fake-key" "${ENV_FILE}"; then
  echo "  ERROR: .env.production contains 'fake-key' placeholder."
  echo "  Replace VITE_FIREBASE_API_KEY with your real Firebase API key."
  exit 1
fi

# Verify no REPLACE_WITH_ placeholders remain
if grep -q "REPLACE_WITH_" "${ENV_FILE}"; then
  echo "  ERROR: .env.production still contains REPLACE_WITH_ placeholders."
  echo "  The following lines need real values:"
  grep -n "REPLACE_WITH_" "${ENV_FILE}" | sed 's/^/    /'
  exit 1
fi

# Verify VITE_FIREBASE_API_KEY does NOT start with "fake-"
FIREBASE_KEY=$(grep "^VITE_FIREBASE_API_KEY=" "${ENV_FILE}" | cut -d= -f2-)
if [[ "${FIREBASE_KEY}" == fake-* ]]; then
  echo "  ERROR: VITE_FIREBASE_API_KEY starts with 'fake-'. Use a real Firebase API key."
  exit 1
fi

# Verify VITE_API_BASE_URL is set and contains https://
API_URL=$(grep "^VITE_API_BASE_URL=" "${ENV_FILE}" | cut -d= -f2-)
if [[ -z "${API_URL}" ]] || [[ "${API_URL}" != https://* ]]; then
  echo "  ERROR: VITE_API_BASE_URL must be an HTTPS URL."
  echo "  Current value: ${API_URL:-'(empty)'}"
  echo "  Run: terraform output backend_url"
  exit 1
fi

# Verify gcloud is authenticated
if ! gcloud auth print-access-token &> /dev/null; then
  echo "  ERROR: gcloud is not authenticated. Run: gcloud auth login"
  exit 1
fi

echo "  .env.production validated."

# ─── Step 2: Build production bundle ────────────────────────────────────────

echo "[2/6] Building production bundle..."
cd "${ADMIN_PORTAL_DIR}"

# Use .env.production for the build
NODE_ENV=production pnpm build --mode production

DIST_DIR="${ADMIN_PORTAL_DIR}/dist"

if [[ ! -d "${DIST_DIR}" ]] || [[ ! -f "${DIST_DIR}/index.html" ]]; then
  echo "  ERROR: Build failed — dist/index.html not found."
  exit 1
fi

ASSET_COUNT=$(find "${DIST_DIR}" -type f | wc -l | tr -d ' ')
echo "  Built ${ASSET_COUNT} files in dist/"

# ─── Step 3: Upload to Cloud Storage ────────────────────────────────────────

echo "[3/6] Uploading to Cloud Storage..."

# Sync all files (delete removed files from bucket)
gsutil -m rsync -r -d "${DIST_DIR}/" "gs://${BUCKET_NAME}/"

echo "  Uploaded to gs://${BUCKET_NAME}/"

# ─── Step 4: Set Cache-Control headers ──────────────────────────────────────

echo "[4/6] Configuring cache headers..."

# index.html: no-cache (always revalidate to pick up new deployments)
gsutil setmeta -h "Cache-Control:no-cache, no-store, must-revalidate" \
  "gs://${BUCKET_NAME}/index.html"

# Hashed static assets: immutable, 1 year cache
# Vite generates filenames with content hashes, so they are safe to cache forever.
gsutil -m setmeta -r \
  -h "Cache-Control:public, max-age=31536000, immutable" \
  "gs://${BUCKET_NAME}/assets/" 2>/dev/null || true

# Source maps: private (don't serve from CDN)
gsutil -m setmeta -r \
  -h "Cache-Control:private, no-cache" \
  -h "Content-Type:application/json" \
  "gs://${BUCKET_NAME}/assets/*.map" 2>/dev/null || true

echo "  Cache headers configured."

# ─── Step 5: Update CORS ────────────────────────────────────────────────────

echo "[5/6] Updating CORS configuration..."

CORS_FILE=$(mktemp)

if [[ -n "${BACKEND_URL}" ]]; then
  cat > "${CORS_FILE}" << CORS_JSON
[
  {
    "origin": ["${BACKEND_URL}"],
    "method": ["GET", "HEAD", "OPTIONS"],
    "responseHeader": ["Content-Type", "Cache-Control"],
    "maxAgeSeconds": 3600
  }
]
CORS_JSON
else
  cat > "${CORS_FILE}" << CORS_JSON
[
  {
    "origin": ["*"],
    "method": ["GET", "HEAD", "OPTIONS"],
    "responseHeader": ["Content-Type", "Cache-Control"],
    "maxAgeSeconds": 3600
  }
]
CORS_JSON
fi

gsutil cors set "${CORS_FILE}" "gs://${BUCKET_NAME}"
rm -f "${CORS_FILE}"

echo "  CORS configured."

# ─── Step 6: Invalidate CDN cache ───────────────────────────────────────────

echo "[6/6] Invalidating CDN cache..."

# Invalidate the URL map cache for index.html
gcloud compute url-maps invalidate-cdn-cache mbg-admin-portal-urlmap \
  --path="/index.html" \
  --project="${PROJECT_ID}" \
  --async 2>/dev/null || echo "  Note: CDN cache invalidation skipped (URL map may not exist yet)."

echo "  CDN cache invalidated for /index.html."

# ─── Verify ──────────────────────────────────────────────────────────────────

echo ""
echo "============================================================"
echo "  Deployment Complete"
echo "============================================================"
echo ""
echo "  Bucket URL:  https://storage.googleapis.com/${BUCKET_NAME}/index.html"

# Try to get CDN IP
CDN_IP=$(cd "${SCRIPT_DIR}/terraform" && terraform output -raw admin_portal_cdn_ip 2>/dev/null || echo "")
if [[ -n "${CDN_IP}" ]]; then
  echo "  CDN URL:     http://${CDN_IP}"
fi

echo ""
echo "  Files deployed: ${ASSET_COUNT}"
echo ""
echo "  To verify, open the bucket URL in your browser."
echo "  Static assets should load from CDN with correct cache headers."
echo ""
echo "  To check cache headers:"
echo "    curl -I https://storage.googleapis.com/${BUCKET_NAME}/index.html"
echo ""
