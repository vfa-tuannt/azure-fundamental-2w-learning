output "storage_account_id" {
  value = azurerm_storage_account.this.id
}

output "storage_account_name" {
  value = azurerm_storage_account.this.name
}

output "primary_blob_endpoint" {
  value       = azurerm_storage_account.this.primary_blob_endpoint
  description = "Primary blob endpoint URL — used by NestJS to construct blob URLs."
}

output "primary_connection_string" {
  value       = azurerm_storage_account.this.primary_connection_string
  sensitive   = true
  description = "Storage Account connection string. Will be written to Key Vault as `storage-connection-string` in task 1.8.8."
}

output "container_names" {
  value = [for c in azurerm_storage_container.this : c.name]
}
