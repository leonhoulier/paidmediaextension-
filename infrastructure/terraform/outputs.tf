# ─────────────────────────────────────────────────────────────────────────────
# Outputs — URLs and resource identifiers for downstream use
# ─────────────────────────────────────────────────────────────────────────────

# ─── Backend ─────────────────────────────────────────────────────────────────

output "backend_url" {
  description = "Cloud Run backend API URL"
  value       = google_cloud_run_v2_service.backend.uri
}

output "backend_service_name" {
  description = "Cloud Run service name"
  value       = google_cloud_run_v2_service.backend.name
}

# ─── Admin Portal ────────────────────────────────────────────────────────────

output "admin_portal_bucket" {
  description = "Cloud Storage bucket name for admin portal"
  value       = google_storage_bucket.admin_portal.name
}

output "admin_portal_bucket_url" {
  description = "Direct Cloud Storage URL for admin portal"
  value       = "https://storage.googleapis.com/${google_storage_bucket.admin_portal.name}/index.html"
}

output "admin_portal_cdn_ip" {
  description = "CDN load balancer IP address"
  value       = google_compute_global_forwarding_rule.admin_portal_http.ip_address
}

output "admin_portal_cdn_url" {
  description = "CDN URL for admin portal (HTTP — use HTTPS after configuring SSL)"
  value       = "http://${google_compute_global_forwarding_rule.admin_portal_http.ip_address}"
}

# ─── Database ────────────────────────────────────────────────────────────────

output "cloudsql_instance_connection_name" {
  description = "Cloud SQL instance connection name (for Cloud SQL Proxy)"
  value       = google_sql_database_instance.postgres.connection_name
}

output "cloudsql_private_ip" {
  description = "Cloud SQL private IP address"
  value       = google_sql_database_instance.postgres.private_ip_address
}

# ─── Pub/Sub ─────────────────────────────────────────────────────────────────

output "pubsub_topic_rules_updated" {
  description = "Pub/Sub topic name for rules-updated events"
  value       = google_pubsub_topic.rules_updated.name
}

output "pubsub_topic_compliance_events" {
  description = "Pub/Sub topic name for compliance events"
  value       = google_pubsub_topic.compliance_events.name
}

# ─── Service Account ─────────────────────────────────────────────────────────

output "cloudrun_service_account" {
  description = "Cloud Run service account email"
  value       = google_service_account.cloudrun_sa.email
}

# ─── Artifact Registry ──────────────────────────────────────────────────────

output "artifact_registry_url" {
  description = "Artifact Registry Docker repository URL"
  value       = "${var.region}-docker.pkg.dev/${var.project_id}/${google_artifact_registry_repository.mbg_repo.repository_id}"
}

# ─── Useful Commands ─────────────────────────────────────────────────────────

output "next_steps" {
  description = "Commands to complete deployment"
  value       = <<-EOT

    ╔══════════════════════════════════════════════════════════════════╗
    ║                    DEPLOYMENT NEXT STEPS                       ║
    ╠══════════════════════════════════════════════════════════════════╣
    ║                                                                ║
    ║  1. Build & push Docker image:                                 ║
    ║     cd ${abspath(path.module)}/../../                           ║
    ║     docker build -f packages/backend/Dockerfile \              ║
    ║       -t ${var.region}-docker.pkg.dev/${var.project_id}/${google_artifact_registry_repository.mbg_repo.repository_id}/mbg-backend:latest .  ║
    ║     docker push ${var.region}-docker.pkg.dev/${var.project_id}/${google_artifact_registry_repository.mbg_repo.repository_id}/mbg-backend:latest  ║
    ║                                                                ║
    ║  2. Run database migration:                                    ║
    ║     See infrastructure/RUNBOOK.md Task 4                       ║
    ║                                                                ║
    ║  3. Deploy admin portal:                                       ║
    ║     bash infrastructure/deploy-admin-portal.sh                 ║
    ║                                                                ║
    ║  4. Add Firebase service account secret:                       ║
    ║     gcloud secrets versions add FIREBASE_SERVICE_ACCOUNT \     ║
    ║       --data-file=firebase-service-account.json                ║
    ║                                                                ║
    ║  5. Verify health:                                             ║
    ║     curl ${google_cloud_run_v2_service.backend.uri}/healthz    ║
    ║                                                                ║
    ╚══════════════════════════════════════════════════════════════════╝
  EOT
}
