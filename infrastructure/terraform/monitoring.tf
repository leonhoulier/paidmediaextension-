# ─────────────────────────────────────────────────────────────────────────────
# Monitoring — Uptime Checks, Alerts, Log-based Metrics
# ─────────────────────────────────────────────────────────────────────────────

# ─── Notification Channel (Email) ────────────────────────────────────────────

resource "google_monitoring_notification_channel" "email" {
  count        = var.alert_email != "" ? 1 : 0
  display_name = "MBG Alert Email"
  type         = "email"
  project      = var.project_id

  labels = {
    email_address = var.alert_email
  }
}

# ─── Uptime Check: /healthz ─────────────────────────────────────────────────
# Checks the backend health endpoint every 60 seconds from multiple regions.
# Alerts after 3 consecutive failures.

resource "google_monitoring_uptime_check_config" "healthz" {
  display_name = "MBG Backend Health Check"
  project      = var.project_id
  timeout      = "10s"
  period       = "60s"

  http_check {
    path         = "/healthz"
    port         = 443
    use_ssl      = true
    validate_ssl = true

    accepted_response_status_codes {
      status_value = 200
    }
  }

  monitored_resource {
    type = "uptime_url"
    labels = {
      project_id = var.project_id
      host       = trimprefix(google_cloud_run_v2_service.backend.uri, "https://")
    }
  }

  checker_type = "STATIC_IP_CHECKERS"

  depends_on = [google_cloud_run_v2_service.backend]
}

# ─── Alert: Uptime Check Failure ─────────────────────────────────────────────

resource "google_monitoring_alert_policy" "uptime_failure" {
  count        = var.alert_email != "" ? 1 : 0
  display_name = "MBG Backend Uptime Failure"
  project      = var.project_id
  combiner     = "OR"

  conditions {
    display_name = "Uptime check failure"

    condition_threshold {
      filter          = "resource.type = \"uptime_url\" AND metric.type = \"monitoring.googleapis.com/uptime_check/check_passed\" AND metric.labels.check_id = \"${google_monitoring_uptime_check_config.healthz.uptime_check_id}\""
      comparison      = "COMPARISON_GT"
      threshold_value = 1
      duration        = "180s" # 3 consecutive failures (60s period)

      aggregations {
        alignment_period     = "60s"
        per_series_aligner   = "ALIGN_NEXT_OLDER"
        cross_series_reducer = "REDUCE_COUNT_FALSE"
        group_by_fields      = ["resource.label.project_id"]
      }

      trigger {
        count = 1
      }
    }
  }

  notification_channels = [google_monitoring_notification_channel.email[0].name]

  alert_strategy {
    auto_close = "1800s" # Auto-close after 30 minutes
  }

  documentation {
    content   = "The MBG backend /healthz endpoint has failed 3 consecutive uptime checks. Investigate Cloud Run logs immediately."
    mime_type = "text/markdown"
  }
}

# ─── Log-based Metric: 5xx Errors ───────────────────────────────────────────

resource "google_logging_metric" "backend_5xx_errors" {
  name    = "mbg-backend-5xx-errors"
  project = var.project_id
  filter  = "resource.type=\"cloud_run_revision\" AND resource.labels.service_name=\"${var.backend_service_name}\" AND httpRequest.status>=500"

  metric_descriptor {
    metric_kind = "DELTA"
    value_type  = "INT64"
    unit        = "1"
  }
}

# ─── Alert: 5xx Error Rate ──────────────────────────────────────────────────

resource "google_monitoring_alert_policy" "backend_5xx" {
  count        = var.alert_email != "" ? 1 : 0
  display_name = "MBG Backend 5xx Error Rate"
  project      = var.project_id
  combiner     = "OR"

  conditions {
    display_name = "5xx errors > 5/min"

    condition_threshold {
      filter          = "resource.type = \"cloud_run_revision\" AND metric.type = \"logging.googleapis.com/user/${google_logging_metric.backend_5xx_errors.name}\""
      comparison      = "COMPARISON_GT"
      threshold_value = 5
      duration        = "60s"

      aggregations {
        alignment_period   = "60s"
        per_series_aligner = "ALIGN_RATE"
      }

      trigger {
        count = 1
      }
    }
  }

  notification_channels = var.alert_email != "" ? [google_monitoring_notification_channel.email[0].name] : []

  alert_strategy {
    auto_close = "1800s"
  }

  documentation {
    content   = "The MBG backend is returning more than 5 server errors per minute. Check Cloud Run logs for stack traces."
    mime_type = "text/markdown"
  }
}

# ─── Alert: Cloud SQL Connection Failures ────────────────────────────────────

resource "google_monitoring_alert_policy" "cloudsql_connections" {
  count        = var.alert_email != "" ? 1 : 0
  display_name = "MBG Cloud SQL Connection Issues"
  project      = var.project_id
  combiner     = "OR"

  conditions {
    display_name = "Cloud SQL connection count near limit"

    condition_threshold {
      filter          = "resource.type = \"cloudsql_database\" AND resource.labels.database_id = \"${var.project_id}:${var.db_instance_name}\" AND metric.type = \"cloudsql.googleapis.com/database/network/connections\""
      comparison      = "COMPARISON_GT"
      threshold_value = 80 # Alert when connections exceed 80 (limit is 100)
      duration        = "300s"

      aggregations {
        alignment_period   = "60s"
        per_series_aligner = "ALIGN_MEAN"
      }

      trigger {
        count = 1
      }
    }
  }

  notification_channels = var.alert_email != "" ? [google_monitoring_notification_channel.email[0].name] : []

  alert_strategy {
    auto_close = "1800s"
  }

  documentation {
    content   = "Cloud SQL connection count is approaching the maximum (100). Consider scaling the instance tier or investigating connection leaks."
    mime_type = "text/markdown"
  }
}
