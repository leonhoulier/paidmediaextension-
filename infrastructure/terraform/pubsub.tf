# ─────────────────────────────────────────────────────────────────────────────
# Cloud Pub/Sub — Event Bus
# ─────────────────────────────────────────────────────────────────────────────
# Two topics for the platform event bus:
#   1. rules-updated   — Published when rules are created/updated/deleted.
#                         Extensions receive this via SSE to invalidate caches.
#   2. compliance-events — Published when compliance events are logged.
#                          Can trigger webhooks, analytics pipelines, etc.

# ─── Topic: rules-updated ────────────────────────────────────────────────────

resource "google_pubsub_topic" "rules_updated" {
  name    = "rules-updated"
  project = var.project_id

  message_retention_duration = "86400s" # 24 hours

  depends_on = [google_project_service.required_apis]
}

# Pull subscription for the backend SSE broadcaster.
# The backend pulls messages and fans them out to connected SSE clients.
resource "google_pubsub_subscription" "rules_updated_sse" {
  name    = "rules-updated-sse"
  topic   = google_pubsub_topic.rules_updated.id
  project = var.project_id

  ack_deadline_seconds       = 60
  message_retention_duration = "604800s" # 7 days
  retain_acked_messages      = false

  expiration_policy {
    ttl = "" # Never expires
  }

  retry_policy {
    minimum_backoff = "10s"
    maximum_backoff = "600s"
  }
}

# Push subscription — pushes to Cloud Run endpoint for webhook dispatch.
# This triggers the backend to dispatch webhooks to registered endpoints.
resource "google_pubsub_subscription" "rules_updated_push" {
  name    = "rules-updated-push"
  topic   = google_pubsub_topic.rules_updated.id
  project = var.project_id

  ack_deadline_seconds = 60

  push_config {
    push_endpoint = "${google_cloud_run_v2_service.backend.uri}/api/v1/internal/pubsub/rules-updated"

    oidc_token {
      service_account_email = google_service_account.cloudrun_sa.email
    }
  }

  retry_policy {
    minimum_backoff = "10s"
    maximum_backoff = "600s"
  }

  depends_on = [google_cloud_run_v2_service.backend]
}

# ─── Topic: compliance-events ────────────────────────────────────────────────

resource "google_pubsub_topic" "compliance_events" {
  name    = "compliance-events"
  project = var.project_id

  message_retention_duration = "86400s" # 24 hours

  depends_on = [google_project_service.required_apis]
}

# Push subscription for compliance event processing.
resource "google_pubsub_subscription" "compliance_events_push" {
  name    = "compliance-events-push"
  topic   = google_pubsub_topic.compliance_events.id
  project = var.project_id

  ack_deadline_seconds = 60

  push_config {
    push_endpoint = "${google_cloud_run_v2_service.backend.uri}/api/v1/internal/pubsub/compliance-events"

    oidc_token {
      service_account_email = google_service_account.cloudrun_sa.email
    }
  }

  retry_policy {
    minimum_backoff = "10s"
    maximum_backoff = "600s"
  }

  depends_on = [google_cloud_run_v2_service.backend]
}

# ─── IAM: Grant Cloud Run service account Pub/Sub publish rights ─────────────

resource "google_pubsub_topic_iam_member" "cloudrun_publish_rules" {
  topic   = google_pubsub_topic.rules_updated.id
  project = var.project_id
  role    = "roles/pubsub.publisher"
  member  = "serviceAccount:${google_service_account.cloudrun_sa.email}"
}

resource "google_pubsub_topic_iam_member" "cloudrun_publish_compliance" {
  topic   = google_pubsub_topic.compliance_events.id
  project = var.project_id
  role    = "roles/pubsub.publisher"
  member  = "serviceAccount:${google_service_account.cloudrun_sa.email}"
}

# Grant the Cloud Run SA subscriber access (for pull subscriptions)
resource "google_pubsub_subscription_iam_member" "cloudrun_subscribe_rules_sse" {
  subscription = google_pubsub_subscription.rules_updated_sse.id
  project      = var.project_id
  role         = "roles/pubsub.subscriber"
  member       = "serviceAccount:${google_service_account.cloudrun_sa.email}"
}
