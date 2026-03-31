# ─── Variables ───────────────────────────────────────────────────────────────
# All configurable inputs for the Media Buying Governance GCP infrastructure.
# Override defaults in terraform.tfvars or via -var flags.

variable "project_id" {
  description = "GCP project ID"
  type        = string
}

variable "region" {
  description = "GCP region for all resources"
  type        = string
  default     = "us-central1"
}

variable "zone" {
  description = "GCP zone for zonal resources"
  type        = string
  default     = "us-central1-a"
}

# ─── Cloud SQL ───────────────────────────────────────────────────────────────

variable "db_instance_name" {
  description = "Cloud SQL instance name"
  type        = string
  default     = "mbg-postgres"
}

variable "db_tier" {
  description = "Cloud SQL machine tier"
  type        = string
  default     = "db-f1-micro"
}

variable "db_version" {
  description = "PostgreSQL version"
  type        = string
  default     = "POSTGRES_15"
}

variable "db_name" {
  description = "Database name"
  type        = string
  default     = "media_buying_governance"
}

variable "db_user" {
  description = "Database application user"
  type        = string
  default     = "mbg_app"
}

variable "db_password" {
  description = "Database application user password (stored in Secret Manager)"
  type        = string
  sensitive   = true
}

# ─── Cloud Run ───────────────────────────────────────────────────────────────

variable "backend_service_name" {
  description = "Cloud Run service name for the backend"
  type        = string
  default     = "mbg-backend"
}

variable "backend_image" {
  description = "Container image for the backend (gcr.io/PROJECT/IMAGE:TAG)"
  type        = string
  default     = ""
}

variable "backend_min_instances" {
  description = "Minimum Cloud Run instances (0 = scale to zero)"
  type        = number
  default     = 0
}

variable "backend_max_instances" {
  description = "Maximum Cloud Run instances"
  type        = number
  default     = 3
}

variable "backend_memory" {
  description = "Memory allocation for Cloud Run"
  type        = string
  default     = "512Mi"
}

variable "backend_cpu" {
  description = "CPU allocation for Cloud Run"
  type        = string
  default     = "1"
}

# ─── Cloud Storage (Admin Portal) ───────────────────────────────────────────

variable "admin_portal_bucket_name" {
  description = "Cloud Storage bucket for admin portal static assets"
  type        = string
  default     = "mbg-admin-portal"
}

# ─── Firebase ────────────────────────────────────────────────────────────────

variable "firebase_service_account_json" {
  description = "Firebase Admin SDK service account JSON (base64 encoded)"
  type        = string
  sensitive   = true
  default     = ""
}

# ─── Alerting ────────────────────────────────────────────────────────────────

variable "alert_email" {
  description = "Email address for alert notifications"
  type        = string
  default     = ""
}

variable "slack_webhook_url" {
  description = "Slack incoming webhook URL for alerts and notifications"
  type        = string
  sensitive   = true
  default     = ""
}

# ─── Production Instrumentation ──────────────────────────────────────────────

variable "sentry_dsn" {
  description = "Sentry DSN for error monitoring (backend)"
  type        = string
  sensitive   = true
  default     = ""
}

variable "posthog_api_key" {
  description = "PostHog API key for product analytics (backend)"
  type        = string
  sensitive   = true
  default     = ""
}

variable "splitio_api_key" {
  description = "Split.io API key for feature flags (backend)"
  type        = string
  sensitive   = true
  default     = ""
}
