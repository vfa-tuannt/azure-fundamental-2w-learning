output "id" {
  description = "Resource ID of the Static Web App (used for role assignments / diagnostic settings later)."
  value       = azurerm_static_web_app.this.id
}

output "default_host_name" {
  description = "Public hostname of the SWA (e.g., <random>-<name>.azurestaticapps.net) — fed into VITE_PUBLIC_URL at build time."
  value       = azurerm_static_web_app.this.default_host_name
}

output "api_key" {
  description = "Deployment token used by the GitHub Actions / SWA CLI deploy. Sensitive."
  value       = azurerm_static_web_app.this.api_key
  sensitive   = true
}
