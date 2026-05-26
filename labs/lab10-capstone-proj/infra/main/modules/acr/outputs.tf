output "registry_id" {
  value = azurerm_container_registry.this.id
}

output "registry_name" {
  value = azurerm_container_registry.this.name
}

output "login_server" {
  value       = azurerm_container_registry.this.login_server
  description = "Registry FQDN (e.g., acrskillplatformprod.azurecr.io). Used for image references and AAD token audience."
}
