variable "location" {
  type        = string
  description = "Azure region for the Cosmos account."
}

variable "resource_group_name" {
  type        = string
  description = "Resource group that owns the Cosmos account."
}

variable "account_name" {
  type        = string
  description = "Globally-unique Cosmos account name (3-44 chars, lowercase + hyphens)."
}

variable "database_name" {
  type        = string
  default     = "skillplatform"
  description = "SQL database to create on the account."
}

variable "subnet_pe_id" {
  type        = string
  description = "snet-pe subnet ID where the Cosmos Private Endpoint attaches."
}

variable "cosmos_private_dns_zone_id" {
  type        = string
  description = "Resource ID of the privatelink.documents.azure.com Private DNS zone."
}

variable "tags" {
  type    = map(string)
  default = {}
}
