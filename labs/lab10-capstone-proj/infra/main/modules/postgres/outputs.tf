output "server_id" {
  value = azurerm_postgresql_flexible_server.this.id
}

output "server_name" {
  value = azurerm_postgresql_flexible_server.this.name
}

output "server_fqdn" {
  value       = azurerm_postgresql_flexible_server.this.fqdn
  description = "Server FQDN — resolves to the private IP inside the VNet."
}

output "database_name" {
  value = azurerm_postgresql_flexible_server_database.skillplatform.name
}

output "database_url" {
  value = format(
    "postgresql://%s:%s@%s:5432/%s?sslmode=require",
    var.admin_user,
    urlencode(var.admin_password),
    azurerm_postgresql_flexible_server.this.fqdn,
    var.database_name,
  )
  sensitive   = true
  description = "Full Postgres connection URL (URL-encoded password). Will be written to Key Vault as `database-url` in task 1.8.8."
}
