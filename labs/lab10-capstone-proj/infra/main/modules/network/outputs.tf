output "vnet_id" {
  value = azurerm_virtual_network.this.id
}

output "vnet_name" {
  value = azurerm_virtual_network.this.name
}

output "subnet_app_id" {
  value       = azurerm_subnet.app.id
  description = "Subnet for App Service VNet integration."
}

output "subnet_pe_id" {
  value       = azurerm_subnet.pe.id
  description = "Subnet for Private Endpoints."
}

output "subnet_db_id" {
  value       = azurerm_subnet.db.id
  description = "Subnet for Postgres Flexible Server (delegated)."
}

output "subnet_aca_id" {
  value       = azurerm_subnet.aca.id
  description = "Subnet for the Container Apps environment (infrastructure subnet)."
}

output "nsg_app_id" {
  value = azurerm_network_security_group.app.id
}

output "nsg_pe_id" {
  value = azurerm_network_security_group.pe.id
}

output "nsg_db_id" {
  value = azurerm_network_security_group.db.id
}
