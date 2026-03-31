# ─────────────────────────────────────────────────────────────────────────────
# Media Buying Governance Platform — GCP Infrastructure
# ─────────────────────────────────────────────────────────────────────────────
#
# This Terraform configuration provisions all GCP resources for the
# Media Buying Governance platform production deployment:
#
#   - Cloud SQL (PostgreSQL 15)
#   - Cloud Run (backend API)
#   - Cloud Pub/Sub (event bus)
#   - Secret Manager (credentials)
#   - Cloud Storage + CDN (admin portal static hosting)
#   - VPC Connector (Cloud Run <-> Cloud SQL private networking)
#   - Monitoring (uptime checks, alert policies)
#
# Usage:
#   1. Copy terraform.tfvars.example to terraform.tfvars
#   2. Fill in your project_id, db_password, etc.
#   3. Run: terraform init && terraform plan && terraform apply
#
# ─────────────────────────────────────────────────────────────────────────────

terraform {
  required_version = ">= 1.5.0"

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.0"
    }
    google-beta = {
      source  = "hashicorp/google-beta"
      version = "~> 5.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
  }

  # Uncomment and configure for remote state storage:
  # backend "gcs" {
  #   bucket = "mbg-terraform-state"
  #   prefix = "terraform/state"
  # }
}

provider "google" {
  project = var.project_id
  region  = var.region
}

provider "google-beta" {
  project = var.project_id
  region  = var.region
}

# ─── Enable Required APIs ────────────────────────────────────────────────────

resource "google_project_service" "required_apis" {
  for_each = toset([
    "run.googleapis.com",
    "sqladmin.googleapis.com",
    "secretmanager.googleapis.com",
    "pubsub.googleapis.com",
    "vpcaccess.googleapis.com",
    "compute.googleapis.com",
    "servicenetworking.googleapis.com",
    "cloudresourcemanager.googleapis.com",
    "monitoring.googleapis.com",
    "logging.googleapis.com",
    "artifactregistry.googleapis.com",
    "cloudbuild.googleapis.com",
  ])

  project = var.project_id
  service = each.key

  disable_dependent_services = false
  disable_on_destroy         = false
}

# ─── Random Suffix ───────────────────────────────────────────────────────────
# Used to ensure globally unique bucket names and avoid collisions.

resource "random_id" "suffix" {
  byte_length = 4
}

# ─── Webhook Signing Secret ─────────────────────────────────────────────────
# Generate a random 32-byte hex secret for signing webhook payloads.

resource "random_id" "webhook_signing_secret" {
  byte_length = 32
}
