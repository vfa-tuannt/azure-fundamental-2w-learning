output "log_analytics_workspace_id" {
  value = azurerm_log_analytics_workspace.this.id
}

output "log_analytics_workspace_name" {
  value = azurerm_log_analytics_workspace.this.name
}

output "appinsights_id" {
  value = azurerm_application_insights.this.id
}

output "appinsights_name" {
  value = azurerm_application_insights.this.name
}

output "appinsights_connection_string" {
  value       = azurerm_application_insights.this.connection_string
  sensitive   = true
  description = "Application Insights connection string. Written to Key Vault as `appinsights-connection-string` and consumed by all three compute resources via Key Vault references."
}

output "appinsights_instrumentation_key" {
  value     = azurerm_application_insights.this.instrumentation_key
  sensitive = true
  description = "Legacy instrumentation key. Modern SDKs should prefer the connection string."
}
