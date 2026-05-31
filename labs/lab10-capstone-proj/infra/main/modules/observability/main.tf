############################################
# Log Analytics workspace — single shared sink for App Service,
# Function App, Container Apps, and Application Insights.
#
# The `daily_quota_gb` cap is the budget defense: once we hit it,
# Azure pauses ingestion for the day. Reads keep working.
############################################

resource "azurerm_log_analytics_workspace" "this" {
  name                = var.log_analytics_workspace_name
  location            = var.location
  resource_group_name = var.resource_group_name

  sku               = "PerGB2018"
  retention_in_days = var.retention_in_days
  daily_quota_gb    = var.daily_quota_gb

  tags = var.tags
}

############################################
# Application Insights — Workspace-based mode (the modern default).
# All three compute resources will share this single instance and
# distinguish themselves via `cloud_RoleName`.
############################################

resource "azurerm_application_insights" "this" {
  name                = var.appinsights_name
  location            = var.location
  resource_group_name = var.resource_group_name

  application_type = "web"
  workspace_id     = azurerm_log_analytics_workspace.this.id

  tags = var.tags
}
