variable "name" {
  type        = string
  description = "Resource name for the Static Web App (e.g., stapp-skillplatform-prod)."
}

variable "location" {
  type        = string
  description = "Azure region. Must be one of SWA's supported regions — eastasia is the closest to japaneast."
}

variable "resource_group_name" {
  type        = string
  description = "Resource group the Static Web App is created in."
}

variable "tags" {
  type        = map(string)
  default     = {}
  description = "Standard resource tags."
}
