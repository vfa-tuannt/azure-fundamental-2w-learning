output "plan_id" {
  value = azurerm_service_plan.this.id
}

output "app_id" {
  value = azurerm_linux_web_app.this.id
}

output "app_name" {
  value = azurerm_linux_web_app.this.name
}

output "default_hostname" {
  value       = azurerm_linux_web_app.this.default_hostname
  description = "Default *.azurewebsites.net hostname (no protocol)."
}

output "principal_id" {
  value       = azurerm_linux_web_app.this.identity[0].principal_id
  description = "Object ID of the system-assigned managed identity. Consumed by iam.tf to grant Key Vault / Storage / Cosmos data-plane access."
}
