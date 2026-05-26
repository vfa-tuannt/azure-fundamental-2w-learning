variable "location" {
  type        = string
  description = "Azure region for the registry."
}

variable "resource_group_name" {
  type        = string
  description = "Resource group that owns the registry."
}

variable "registry_name" {
  type        = string
  description = "Globally-unique registry name (lowercase alphanumeric, 5-50 chars)."
}

variable "sku" {
  type        = string
  default     = "Premium"
  description = "Registry SKU. Premium is required for Private Endpoints and IP rules; Basic and Standard cannot be VNet-isolated."
}

variable "subnet_pe_id" {
  type        = string
  description = "snet-pe subnet ID where the registry Private Endpoint attaches."
}

variable "acr_private_dns_zone_id" {
  type        = string
  description = "Resource ID of the privatelink.azurecr.io Private DNS zone."
}

variable "tags" {
  type    = map(string)
  default = {}
}
