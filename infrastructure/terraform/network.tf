# ─────────────────────────────────────────────────────────────────────────────
# VPC Network + Serverless VPC Connector
# ─────────────────────────────────────────────────────────────────────────────
# Cloud Run needs a VPC connector to reach Cloud SQL via private IP.
# We create a dedicated VPC and connector for this purpose.

resource "google_compute_network" "mbg_vpc" {
  name                    = "mbg-vpc"
  auto_create_subnetworks = false
  project                 = var.project_id

  depends_on = [google_project_service.required_apis]
}

resource "google_compute_subnetwork" "mbg_subnet" {
  name          = "mbg-subnet"
  ip_cidr_range = "10.8.0.0/28"
  region        = var.region
  network       = google_compute_network.mbg_vpc.id
  project       = var.project_id
}

# Private IP range for Cloud SQL
resource "google_compute_global_address" "private_ip_range" {
  name          = "mbg-private-ip"
  purpose       = "VPC_PEERING"
  address_type  = "INTERNAL"
  prefix_length = 16
  network       = google_compute_network.mbg_vpc.id
  project       = var.project_id
}

resource "google_service_networking_connection" "private_vpc_connection" {
  network                 = google_compute_network.mbg_vpc.id
  service                 = "servicenetworking.googleapis.com"
  reserved_peering_ranges = [google_compute_global_address.private_ip_range.name]

  depends_on = [google_project_service.required_apis]
}

# Serverless VPC Access Connector — allows Cloud Run to reach private IP resources
resource "google_vpc_access_connector" "connector" {
  name          = "mbg-vpc-connector"
  region        = var.region
  project       = var.project_id
  network       = google_compute_network.mbg_vpc.name
  ip_cidr_range = "10.8.1.0/28"
  min_instances = 2
  max_instances = 3

  depends_on = [google_project_service.required_apis]
}
