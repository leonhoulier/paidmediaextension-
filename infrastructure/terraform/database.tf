# ─────────────────────────────────────────────────────────────────────────────
# Cloud SQL PostgreSQL Instance
# ─────────────────────────────────────────────────────────────────────────────
# Managed PostgreSQL 15 instance with private IP networking.
# Cloud Run connects via the Cloud SQL Auth Proxy sidecar (Unix socket).

resource "google_sql_database_instance" "postgres" {
  name             = var.db_instance_name
  database_version = var.db_version
  region           = var.region
  project          = var.project_id

  # Prevent accidental destruction of production database
  deletion_protection = true

  settings {
    tier              = var.db_tier
    availability_type = "ZONAL" # Use "REGIONAL" for HA in production at scale
    disk_type         = "PD_SSD"
    disk_size         = 10 # GB, auto-grows
    disk_autoresize   = true

    ip_configuration {
      ipv4_enabled                                  = false # Private IP only
      private_network                               = google_compute_network.mbg_vpc.id
      enable_private_path_for_google_cloud_services = true
    }

    backup_configuration {
      enabled                        = true
      start_time                     = "03:00" # 3 AM UTC
      point_in_time_recovery_enabled = true
      transaction_log_retention_days = 7

      backup_retention_settings {
        retained_backups = 14
        retention_unit   = "COUNT"
      }
    }

    maintenance_window {
      day          = 7 # Sunday
      hour         = 4 # 4 AM UTC
      update_track = "stable"
    }

    database_flags {
      name  = "max_connections"
      value = "100"
    }

    database_flags {
      name  = "log_checkpoints"
      value = "on"
    }

    database_flags {
      name  = "log_connections"
      value = "on"
    }

    database_flags {
      name  = "log_disconnections"
      value = "on"
    }

    insights_config {
      query_insights_enabled  = true
      query_plans_per_minute  = 5
      query_string_length     = 1024
      record_application_tags = true
      record_client_address   = false
    }
  }

  depends_on = [
    google_service_networking_connection.private_vpc_connection,
    google_project_service.required_apis,
  ]
}

# ─── Database ────────────────────────────────────────────────────────────────

resource "google_sql_database" "mbg_db" {
  name     = var.db_name
  instance = google_sql_database_instance.postgres.name
  project  = var.project_id
}

# ─── Database User ───────────────────────────────────────────────────────────

resource "google_sql_user" "mbg_app" {
  name     = var.db_user
  instance = google_sql_database_instance.postgres.name
  password = var.db_password
  project  = var.project_id

  depends_on = [google_sql_database.mbg_db]
}
