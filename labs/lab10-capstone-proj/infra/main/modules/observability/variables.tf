variable "location" {
  type        = string
  description = "Azure region."
}

variable "resource_group_name" {
  type        = string
  description = "Resource group that owns the workspace and Application Insights."
}

variable "log_analytics_workspace_name" {
  type        = string
  description = "Log Analytics workspace name (e.g., log-skillplatform-prod)."
}

variable "appinsights_name" {
  type        = string
  description = "Application Insights resource name (e.g., appi-skillplatform-prod)."
}

variable "retention_in_days" {
  type        = number
  default     = 30
  description = "Log retention window."
}

variable "daily_quota_gb" {
  type        = number
  default     = 1
  description = "Daily ingestion cap in GB. Pauses ingestion past the cap to defend the budget."
}

variable "tags" {
  type    = map(string)
  default = {}
}
