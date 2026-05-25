variable "location" {
  type        = string
  description = "Azure region for the Key Vault."
}

variable "resource_group_name" {
  type        = string
  description = "Resource group that owns the vault."
}

variable "vault_name" {
  type        = string
  description = "Globally-unique Key Vault name (3-24 chars, alphanumeric + hyphens)."
}

variable "subnet_pe_id" {
  type        = string
  description = "snet-pe subnet ID where the vault Private Endpoint attaches."
}

variable "vault_private_dns_zone_id" {
  type        = string
  description = "Resource ID of the privatelink.vaultcore.azure.net Private DNS zone."
}

variable "soft_delete_retention_days" {
  type        = number
  default     = 90
  description = "Soft-delete retention window. Must be 7-90."
}

variable "tags" {
  type    = map(string)
  default = {}
}
