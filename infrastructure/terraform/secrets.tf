# ─────────────────────────────────────────────────────────────────────────────
# Secret Manager — Application Secrets
# ─────────────────────────────────────────────────────────────────────────────
# All sensitive values are stored in Secret Manager and injected into
# Cloud Run as environment variables at runtime.

# ─── DATABASE_URL ────────────────────────────────────────────────────────────
# Prisma connection string using Cloud SQL Unix socket path.
# Format: postgresql://USER:PASSWORD@localhost/DB?host=/cloudsql/PROJECT:REGION:INSTANCE

resource "google_secret_manager_secret" "database_url" {
  secret_id = "DATABASE_URL"
  project   = var.project_id

  replication {
    auto {}
  }

  depends_on = [google_project_service.required_apis]
}

resource "google_secret_manager_secret_version" "database_url" {
  secret = google_secret_manager_secret.database_url.id
  secret_data = "postgresql://${var.db_user}:${var.db_password}@localhost/${var.db_name}?host=/cloudsql/${var.project_id}:${var.region}:${var.db_instance_name}"
}

# ─── FIREBASE_SERVICE_ACCOUNT ───────────────────────────────────────────────
# Firebase Admin SDK service account JSON key.
# Used by the backend to verify Firebase Auth JWT tokens.

resource "google_secret_manager_secret" "firebase_service_account" {
  secret_id = "FIREBASE_SERVICE_ACCOUNT"
  project   = var.project_id

  replication {
    auto {}
  }

  depends_on = [google_project_service.required_apis]
}

# NOTE: The Firebase service account JSON must be provided separately.
# Create the secret version manually or via:
#   gcloud secrets versions add FIREBASE_SERVICE_ACCOUNT --data-file=service-account.json
# Alternatively, set var.firebase_service_account_json and uncomment below:

# resource "google_secret_manager_secret_version" "firebase_service_account" {
#   secret      = google_secret_manager_secret.firebase_service_account.id
#   secret_data = var.firebase_service_account_json
# }

# ─── WEBHOOK_SIGNING_SECRET ─────────────────────────────────────────────────
# 32-byte hex secret for signing outbound webhook payloads (HMAC-SHA256).

resource "google_secret_manager_secret" "webhook_signing_secret" {
  secret_id = "WEBHOOK_SIGNING_SECRET"
  project   = var.project_id

  replication {
    auto {}
  }

  depends_on = [google_project_service.required_apis]
}

resource "google_secret_manager_secret_version" "webhook_signing_secret" {
  secret      = google_secret_manager_secret.webhook_signing_secret.id
  secret_data = random_id.webhook_signing_secret.hex
}

# ─── SLACK_WEBHOOK_URL (optional) ───────────────────────────────────────────

resource "google_secret_manager_secret" "slack_webhook_url" {
  count     = var.slack_webhook_url != "" ? 1 : 0
  secret_id = "SLACK_WEBHOOK_URL"
  project   = var.project_id

  replication {
    auto {}
  }

  depends_on = [google_project_service.required_apis]
}

resource "google_secret_manager_secret_version" "slack_webhook_url" {
  count       = var.slack_webhook_url != "" ? 1 : 0
  secret      = google_secret_manager_secret.slack_webhook_url[0].id
  secret_data = var.slack_webhook_url
}

# ─── SENTRY_DSN ──────────────────────────────────────────────────────────────
# Sentry Data Source Name for error monitoring in the backend.

resource "google_secret_manager_secret" "sentry_dsn" {
  count     = var.sentry_dsn != "" ? 1 : 0
  secret_id = "SENTRY_DSN"
  project   = var.project_id

  replication {
    auto {}
  }

  depends_on = [google_project_service.required_apis]
}

resource "google_secret_manager_secret_version" "sentry_dsn" {
  count       = var.sentry_dsn != "" ? 1 : 0
  secret      = google_secret_manager_secret.sentry_dsn[0].id
  secret_data = var.sentry_dsn
}

# ─── POSTHOG_API_KEY ─────────────────────────────────────────────────────────
# PostHog API key for product analytics in the backend.

resource "google_secret_manager_secret" "posthog_api_key" {
  count     = var.posthog_api_key != "" ? 1 : 0
  secret_id = "POSTHOG_API_KEY"
  project   = var.project_id

  replication {
    auto {}
  }

  depends_on = [google_project_service.required_apis]
}

resource "google_secret_manager_secret_version" "posthog_api_key" {
  count       = var.posthog_api_key != "" ? 1 : 0
  secret      = google_secret_manager_secret.posthog_api_key[0].id
  secret_data = var.posthog_api_key
}

# ─── SPLITIO_API_KEY ─────────────────────────────────────────────────────────
# Split.io API key for feature flags in the backend.

resource "google_secret_manager_secret" "splitio_api_key" {
  count     = var.splitio_api_key != "" ? 1 : 0
  secret_id = "SPLITIO_API_KEY"
  project   = var.project_id

  replication {
    auto {}
  }

  depends_on = [google_project_service.required_apis]
}

resource "google_secret_manager_secret_version" "splitio_api_key" {
  count       = var.splitio_api_key != "" ? 1 : 0
  secret      = google_secret_manager_secret.splitio_api_key[0].id
  secret_data = var.splitio_api_key
}

# ─── IAM: Grant Cloud Run access to secrets ──────────────────────────────────

resource "google_secret_manager_secret_iam_member" "cloudrun_database_url" {
  secret_id = google_secret_manager_secret.database_url.secret_id
  project   = var.project_id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.cloudrun_sa.email}"
}

resource "google_secret_manager_secret_iam_member" "cloudrun_firebase_sa" {
  secret_id = google_secret_manager_secret.firebase_service_account.secret_id
  project   = var.project_id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.cloudrun_sa.email}"
}

resource "google_secret_manager_secret_iam_member" "cloudrun_webhook_secret" {
  secret_id = google_secret_manager_secret.webhook_signing_secret.secret_id
  project   = var.project_id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.cloudrun_sa.email}"
}

resource "google_secret_manager_secret_iam_member" "cloudrun_slack_webhook" {
  count     = var.slack_webhook_url != "" ? 1 : 0
  secret_id = google_secret_manager_secret.slack_webhook_url[0].secret_id
  project   = var.project_id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.cloudrun_sa.email}"
}

resource "google_secret_manager_secret_iam_member" "cloudrun_sentry_dsn" {
  count     = var.sentry_dsn != "" ? 1 : 0
  secret_id = google_secret_manager_secret.sentry_dsn[0].secret_id
  project   = var.project_id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.cloudrun_sa.email}"
}

resource "google_secret_manager_secret_iam_member" "cloudrun_posthog_api_key" {
  count     = var.posthog_api_key != "" ? 1 : 0
  secret_id = google_secret_manager_secret.posthog_api_key[0].secret_id
  project   = var.project_id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.cloudrun_sa.email}"
}

resource "google_secret_manager_secret_iam_member" "cloudrun_splitio_api_key" {
  count     = var.splitio_api_key != "" ? 1 : 0
  secret_id = google_secret_manager_secret.splitio_api_key[0].secret_id
  project   = var.project_id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.cloudrun_sa.email}"
}
