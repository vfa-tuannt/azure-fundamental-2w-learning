output "account_id" {
  value = azurerm_cosmosdb_account.this.id
}

output "account_name" {
  value = azurerm_cosmosdb_account.this.name
}

output "endpoint" {
  value       = azurerm_cosmosdb_account.this.endpoint
  description = "Cosmos endpoint URL — used by SDKs that prefer endpoint + key over a composed connection string."
}

output "primary_connection_string" {
  value       = format("AccountEndpoint=%s;AccountKey=%s;", azurerm_cosmosdb_account.this.endpoint, azurerm_cosmosdb_account.this.primary_key)
  sensitive   = true
  description = "SQL API primary connection string. Will be written to Key Vault as `cosmos-connection-string` in task 1.8.8 (now uncommented)."
}

output "database_name" {
  value = azurerm_cosmosdb_sql_database.this.name
}

output "activity_events_container_name" {
  value = azurerm_cosmosdb_sql_container.activity_events.name
}

output "submission_events_container_name" {
  value = azurerm_cosmosdb_sql_container.submission_events.name
}
