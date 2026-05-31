variable "location" {
  type        = string
  description = "Azure region for the plan and app."
}

variable "resource_group_name" {
  type        = string
  description = "Resource group that owns the plan and app."
}

variable "plan_name" {
  type        = string
  description = "Name of the Linux App Service Plan (e.g., plan-skillplatform-prod)."
}

variable "app_name" {
  type        = string
  description = "Globally-unique name of the App Service (e.g., app-skillplatform-prod)."
}

variable "subnet_id" {
  type        = string
  description = "Resource ID of snet-app — the subnet used for App Service VNet integration."
}

variable "key_vault_uri" {
  type        = string
  description = "Vault URI (e.g., https://kv-skillplatform-prod.vault.azure.net/) — used to construct @Microsoft.KeyVault(SecretUri=...) app-setting references."
}

variable "cors_origin" {
  type        = string
  description = "Allowed CORS origin for the NestJS API. Initially set to a placeholder; update once the Static Web App default hostname is known (task 2.5)."
}

variable "thumbnail_service_url" {
  type        = string
  description = "Internal URL of the thumbnail Container App. Initially a placeholder; updated once Phase 7c provisions the Container App."
}

variable "tags" {
  type    = map(string)
  default = {}
}
