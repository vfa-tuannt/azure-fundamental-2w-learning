variable "location" {
  type        = string
  description = "Azure region for the Postgres Flexible Server."
}

variable "resource_group_name" {
  type        = string
  description = "Name of the resource group that owns the server."
}

variable "server_name" {
  type        = string
  description = "Globally-unique Postgres Flexible Server name."
}

variable "database_name" {
  type        = string
  default     = "skillplatform"
  description = "Database to create on the server."
}

variable "admin_user" {
  type        = string
  description = "Server admin username."
}

variable "admin_password" {
  type        = string
  sensitive   = true
  description = "Server admin password."
}

variable "delegated_subnet_id" {
  type        = string
  description = "snet-db subnet ID (must be delegated to Microsoft.DBforPostgreSQL/flexibleServers)."
}

variable "private_dns_zone_id" {
  type        = string
  description = "Private DNS zone ID for privatelink.postgres.database.azure.com. The module that supplies this MUST have already linked the zone to the VNet — the dependency flows naturally through the module-output graph."
}

variable "sku_name" {
  type        = string
  default     = "B_Standard_B1ms"
  description = "Compute SKU — Burstable B1ms for the learning budget."
}

variable "storage_mb" {
  type        = number
  default     = 32768 # 32 GB
  description = "Storage size in MB."
}

variable "postgres_version" {
  type        = string
  default     = "16"
  description = "Postgres major version."
}

variable "backup_retention_days" {
  type        = number
  default     = 7
  description = "Backup retention window."
}

variable "zone" {
  type        = string
  default     = "1"
  description = "Availability zone — pin to avoid spurious diffs from Azure rebalancing."
}

variable "tags" {
  type    = map(string)
  default = {}
}
