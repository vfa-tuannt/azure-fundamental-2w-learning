variable "location" {
  type        = string
  description = "Azure region for the storage account."
}

variable "resource_group_name" {
  type        = string
  description = "Resource group that owns the storage account."
}

variable "storage_account_name" {
  type        = string
  description = "Globally-unique storage account name (lowercase, alphanumeric, ≤24 chars)."
}

variable "container_names" {
  type        = list(string)
  default     = ["submissions", "reports"]
  description = "Containers to provision. All private-access."
}

variable "subnet_pe_id" {
  type        = string
  description = "snet-pe subnet ID where the blob Private Endpoint attaches."
}

variable "blob_private_dns_zone_id" {
  type        = string
  description = "Resource ID of the privatelink.blob.core.windows.net Private DNS zone (already linked to the VNet)."
}

variable "tags" {
  type    = map(string)
  default = {}
}
