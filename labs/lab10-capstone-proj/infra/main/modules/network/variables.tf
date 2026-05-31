variable "location" {
  type        = string
  description = "Azure region for all network resources."
}

variable "resource_group_name" {
  type        = string
  description = "Name of the resource group that owns the VNet, subnets, and NSGs."
}

variable "naming" {
  type = object({
    vnet     = string
    snet_app = string
    snet_pe  = string
    snet_db  = string
    snet_aca = string
    nsg_app  = string
    nsg_pe   = string
    nsg_db   = string
  })
  description = "Resource name map (passed from root locals)."
}

variable "vnet_address_space" {
  type        = list(string)
  default     = ["10.20.0.0/16"]
  description = "VNet CIDR. Default 10.20.0.0/16 keeps clear of common home/office ranges."
}

variable "subnet_prefixes" {
  type = object({
    app = string
    pe  = string
    db  = string
    aca = string
  })
  default = {
    app = "10.20.1.0/24"
    pe  = "10.20.2.0/24"
    db  = "10.20.3.0/24"
    aca = "10.20.4.0/27" # ACA requires /27 minimum
  }
}

variable "tags" {
  type    = map(string)
  default = {}
}
