# ─────────────────────────────────────────────────────────────────────────────
# Cloud Run — Backend API Service
# ─────────────────────────────────────────────────────────────────────────────
# Deploys the NestJS backend as a serverless container on Cloud Run.
# Connects to Cloud SQL via the built-in Cloud SQL Auth Proxy sidecar.

# ─── Service Account ─────────────────────────────────────────────────────────
# Dedicated service account for the Cloud Run service with least-privilege IAM.

resource "google_service_account" "cloudrun_sa" {
  account_id   = "mbg-backend-sa"
  display_name = "MBG Backend Cloud Run Service Account"
  project      = var.project_id

  depends_on = [google_project_service.required_apis]
}

# Grant Cloud SQL Client role (for Cloud SQL Auth Proxy sidecar)
resource "google_project_iam_member" "cloudrun_cloudsql" {
  project = var.project_id
  role    = "roles/cloudsql.client"
  member  = "serviceAccount:${google_service_account.cloudrun_sa.email}"
}

# Grant Logging write access
resource "google_project_iam_member" "cloudrun_logging" {
  project = var.project_id
  role    = "roles/logging.logWriter"
  member  = "serviceAccount:${google_service_account.cloudrun_sa.email}"
}

# Grant Monitoring metric write access
resource "google_project_iam_member" "cloudrun_monitoring" {
  project = var.project_id
  role    = "roles/monitoring.metricWriter"
  member  = "serviceAccount:${google_service_account.cloudrun_sa.email}"
}

# ─── Artifact Registry Repository ────────────────────────────────────────────
# Container registry for Docker images.

resource "google_artifact_registry_repository" "mbg_repo" {
  location      = var.region
  repository_id = "mbg-images"
  format        = "DOCKER"
  project       = var.project_id

  depends_on = [google_project_service.required_apis]
}

# ─── Cloud Run Service ────────────────────────────────────────────────────────

resource "google_cloud_run_v2_service" "backend" {
  name     = var.backend_service_name
  location = var.region
  project  = var.project_id

  # Allow traffic from all sources (API is protected by Firebase Auth)
  ingress = "INGRESS_TRAFFIC_ALL"

  template {
    service_account = google_service_account.cloudrun_sa.email

    scaling {
      min_instance_count = var.backend_min_instances
      max_instance_count = var.backend_max_instances
    }

    # VPC connector for Cloud SQL private IP access
    vpc_access {
      connector = google_vpc_access_connector.connector.id
      egress    = "PRIVATE_RANGES_ONLY"
    }

    # Cloud SQL connection (mounts Unix socket at /cloudsql/<instance>)
    volumes {
      name = "cloudsql"
      cloud_sql_instance {
        instances = ["${var.project_id}:${var.region}:${var.db_instance_name}"]
      }
    }

    containers {
      # Use the image from Artifact Registry (or GCR).
      # If var.backend_image is empty, use a placeholder that must be updated
      # after the first `docker push`.
      image = var.backend_image != "" ? var.backend_image : "${var.region}-docker.pkg.dev/${var.project_id}/mbg-images/mbg-backend:latest"

      ports {
        container_port = 3000
      }

      resources {
        limits = {
          cpu    = var.backend_cpu
          memory = var.backend_memory
        }
      }

      # ─── Environment Variables ──────────────────────────────────────
      env {
        name  = "NODE_ENV"
        value = "production"
      }

      env {
        name  = "PORT"
        value = "3000"
      }

      env {
        name  = "ALLOW_LOCAL_AUTH"
        value = "false"
      }

      env {
        name  = "GOOGLE_CLOUD_PROJECT"
        value = var.project_id
      }

      # ─── Secrets from Secret Manager ────────────────────────────────
      env {
        name = "DATABASE_URL"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.database_url.secret_id
            version = "latest"
          }
        }
      }

      env {
        name = "FIREBASE_SERVICE_ACCOUNT"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.firebase_service_account.secret_id
            version = "latest"
          }
        }
      }

      env {
        name = "WEBHOOK_SIGNING_SECRET"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.webhook_signing_secret.secret_id
            version = "latest"
          }
        }
      }

      # ─── Production Instrumentation Secrets ──────────────────────
      dynamic "env" {
        for_each = var.sentry_dsn != "" ? [1] : []
        content {
          name = "SENTRY_DSN"
          value_source {
            secret_key_ref {
              secret  = google_secret_manager_secret.sentry_dsn[0].secret_id
              version = "latest"
            }
          }
        }
      }

      dynamic "env" {
        for_each = var.posthog_api_key != "" ? [1] : []
        content {
          name = "POSTHOG_API_KEY"
          value_source {
            secret_key_ref {
              secret  = google_secret_manager_secret.posthog_api_key[0].secret_id
              version = "latest"
            }
          }
        }
      }

      dynamic "env" {
        for_each = var.splitio_api_key != "" ? [1] : []
        content {
          name = "SPLITIO_API_KEY"
          value_source {
            secret_key_ref {
              secret  = google_secret_manager_secret.splitio_api_key[0].secret_id
              version = "latest"
            }
          }
        }
      }

      # Mount the Cloud SQL Unix socket volume
      volume_mounts {
        name       = "cloudsql"
        mount_path = "/cloudsql"
      }

      # ─── Health Check (Startup Probe) ──────────────────────────────
      startup_probe {
        http_get {
          path = "/healthz"
          port = 3000
        }
        initial_delay_seconds = 5
        period_seconds        = 10
        failure_threshold     = 3
        timeout_seconds       = 5
      }

      # ─── Liveness Probe ────────────────────────────────────────────
      liveness_probe {
        http_get {
          path = "/healthz"
          port = 3000
        }
        period_seconds    = 30
        failure_threshold = 3
        timeout_seconds   = 5
      }
    }

    # Request timeout
    timeout = "300s"
  }

  depends_on = [
    google_project_service.required_apis,
    google_secret_manager_secret_version.database_url,
    google_secret_manager_secret_version.webhook_signing_secret,
    google_vpc_access_connector.connector,
    google_sql_database_instance.postgres,
  ]
}

# ─── IAM: Allow unauthenticated access ──────────────────────────────────────
# The API uses Firebase Auth for user-facing endpoints.
# Cloud Run itself must be publicly accessible (no IAM gate).

resource "google_cloud_run_v2_service_iam_member" "public_access" {
  project  = var.project_id
  location = var.region
  name     = google_cloud_run_v2_service.backend.name
  role     = "roles/run.invoker"
  member   = "allUsers"
}
