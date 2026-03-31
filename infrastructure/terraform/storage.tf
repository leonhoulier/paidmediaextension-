# ─────────────────────────────────────────────────────────────────────────────
# Cloud Storage — Admin Portal Static Hosting
# ─────────────────────────────────────────────────────────────────────────────
# Hosts the Vite-built React SPA. Served via Cloud CDN with a global
# HTTPS load balancer for custom domain support and cache optimization.

# ─── Storage Bucket ──────────────────────────────────────────────────────────

resource "google_storage_bucket" "admin_portal" {
  name     = "${var.admin_portal_bucket_name}-${random_id.suffix.hex}"
  location = var.region
  project  = var.project_id

  storage_class               = "STANDARD"
  uniform_bucket_level_access = true
  force_destroy               = false

  website {
    main_page_suffix = "index.html"
    not_found_page   = "index.html" # SPA routing: all 404s serve index.html
  }

  cors {
    origin          = ["*"] # Will be tightened after deployment; see deploy-admin-portal.sh
    method          = ["GET", "HEAD", "OPTIONS"]
    response_header = ["Content-Type", "Cache-Control"]
    max_age_seconds = 3600
  }

  # Lifecycle rule: auto-delete old sourcemaps after 90 days
  lifecycle_rule {
    condition {
      age                = 90
      matches_suffix     = [".map"]
    }
    action {
      type = "Delete"
    }
  }

  depends_on = [google_project_service.required_apis]
}

# ─── Public Access ───────────────────────────────────────────────────────────
# Make bucket objects publicly readable for CDN.

resource "google_storage_bucket_iam_member" "public_read" {
  bucket = google_storage_bucket.admin_portal.name
  role   = "roles/storage.objectViewer"
  member = "allUsers"
}

# ─── Cloud CDN + HTTPS Load Balancer ─────────────────────────────────────────
# Creates a global load balancer with Cloud CDN enabled, pointing to the
# Cloud Storage bucket as the backend.

# Backend bucket (connects LB to Cloud Storage)
resource "google_compute_backend_bucket" "admin_portal_backend" {
  name        = "mbg-admin-portal-backend"
  bucket_name = google_storage_bucket.admin_portal.name
  enable_cdn  = true
  project     = var.project_id

  cdn_policy {
    cache_mode        = "CACHE_ALL_STATIC"
    default_ttl       = 3600   # 1 hour default
    max_ttl           = 86400  # 24 hours max
    client_ttl        = 3600   # 1 hour client cache
    negative_caching  = true

    # Serve stale content while revalidating
    serve_while_stale = 86400 # 24 hours
  }
}

# URL map (routes all traffic to the backend bucket)
resource "google_compute_url_map" "admin_portal" {
  name            = "mbg-admin-portal-urlmap"
  default_service = google_compute_backend_bucket.admin_portal_backend.id
  project         = var.project_id
}

# HTTP(S) target proxy
resource "google_compute_target_http_proxy" "admin_portal" {
  name    = "mbg-admin-portal-http-proxy"
  url_map = google_compute_url_map.admin_portal.id
  project = var.project_id
}

# Global forwarding rule (HTTP — port 80)
resource "google_compute_global_forwarding_rule" "admin_portal_http" {
  name       = "mbg-admin-portal-http"
  target     = google_compute_target_http_proxy.admin_portal.id
  port_range = "80"
  project    = var.project_id
}

# ─── HTTPS (optional — requires managed SSL certificate) ─────────────────────
# Uncomment the following resources if you have a custom domain.
# Replace "admin.yourdomain.com" with your actual domain.

# resource "google_compute_managed_ssl_certificate" "admin_portal" {
#   name    = "mbg-admin-portal-cert"
#   project = var.project_id
#
#   managed {
#     domains = ["admin.yourdomain.com"]
#   }
# }

# resource "google_compute_target_https_proxy" "admin_portal" {
#   name             = "mbg-admin-portal-https-proxy"
#   url_map          = google_compute_url_map.admin_portal.id
#   ssl_certificates = [google_compute_managed_ssl_certificate.admin_portal.id]
#   project          = var.project_id
# }

# resource "google_compute_global_forwarding_rule" "admin_portal_https" {
#   name       = "mbg-admin-portal-https"
#   target     = google_compute_target_https_proxy.admin_portal.id
#   port_range = "443"
#   project    = var.project_id
# }
