output "vault_id" {
  value = azurerm_key_vault.this.id
}

output "vault_name" {
  value = azurerm_key_vault.this.name
}

output "vault_uri" {
  value       = azurerm_key_vault.this.vault_uri
  description = "Full vault URI (e.g., https://kv-skillplatform-prod.vault.azure.net/). Used for KV-reference syntax in app settings."
}

output "tenant_id" {
  value = data.azurerm_client_config.current.tenant_id
}
