variable "location" {
  type        = string
  default     = "japaneast"
  description = "Azure region for all workload resources."
}

variable "pg_admin_user" {
  type        = string
  description = "Postgres Flexible Server admin username."
}

variable "pg_admin_password" {
  type        = string
  sensitive   = true
  description = "Postgres Flexible Server admin password (min 8 chars, upper+lower+digit required)."
}

variable "google_client_id" {
  type        = string
  sensitive   = true
  description = "Google OAuth 2.0 client ID."
}

variable "google_client_secret" {
  type        = string
  sensitive   = true
  description = "Google OAuth 2.0 client secret."
}

variable "jwt_private_key" {
  type        = string
  sensitive   = true
  description = "RS256 private key PEM (multi-line). Generate with: openssl genrsa 2048."
}

variable "jwt_public_key" {
  type        = string
  description = "RS256 public key PEM corresponding to jwt_private_key."
}

variable "alert_email" {
  type        = string
  description = "Email address to receive the 5xx alert notifications."
}

variable "apim_publisher_email" {
  type        = string
  description = "Publisher email required by the APIM resource."
}

variable "apim_publisher_name" {
  type        = string
  description = "Publisher display name required by the APIM resource."
}

variable "allowed_admin_ips" {
  type        = list(string)
  default     = []
  description = "Public IPs allowed to reach Key Vault's data plane. Add your laptop's public IP here (`curl https://api.ipify.org`) so the initial `terraform apply` can write secrets. Set to [] once secret bootstrap is done."
}
