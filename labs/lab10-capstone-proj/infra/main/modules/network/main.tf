############################################
# Virtual Network
############################################

resource "azurerm_virtual_network" "this" {
  name                = var.naming.vnet
  location            = var.location
  resource_group_name = var.resource_group_name
  address_space       = var.vnet_address_space
  tags                = var.tags
}

############################################
# Subnets
############################################

# snet-app: delegated to App Service for regional VNet integration
resource "azurerm_subnet" "app" {
  name                 = var.naming.snet_app
  resource_group_name  = var.resource_group_name
  virtual_network_name = azurerm_virtual_network.this.name
  address_prefixes     = [var.subnet_prefixes.app]

  delegation {
    name = "appservice-delegation"
    service_delegation {
      name = "Microsoft.Web/serverFarms"
      actions = [
        "Microsoft.Network/virtualNetworks/subnets/action",
      ]
    }
  }
}

# snet-pe: holds Private Endpoints — NIC-style attachments need policies disabled
resource "azurerm_subnet" "pe" {
  name                 = var.naming.snet_pe
  resource_group_name  = var.resource_group_name
  virtual_network_name = azurerm_virtual_network.this.name
  address_prefixes     = [var.subnet_prefixes.pe]

  private_endpoint_network_policies = "Disabled"
}

# snet-db: VNet-injected Postgres Flexible Server requires this delegation
resource "azurerm_subnet" "db" {
  name                 = var.naming.snet_db
  resource_group_name  = var.resource_group_name
  virtual_network_name = azurerm_virtual_network.this.name
  address_prefixes     = [var.subnet_prefixes.db]

  delegation {
    name = "psql-flex-delegation"
    service_delegation {
      name = "Microsoft.DBforPostgreSQL/flexibleServers"
      actions = [
        "Microsoft.Network/virtualNetworks/subnets/join/action",
      ]
    }
  }
}

# snet-aca: infrastructure subnet for Container Apps environment — /27 minimum
resource "azurerm_subnet" "aca" {
  name                 = var.naming.snet_aca
  resource_group_name  = var.resource_group_name
  virtual_network_name = azurerm_virtual_network.this.name
  address_prefixes     = [var.subnet_prefixes.aca]
}

############################################
# Network Security Groups
############################################

# nsg-app: allow inbound 443 from APIM service tag.
# AzureLoadBalancer is allowed by default rule AllowAzureLoadBalancerInBound.
resource "azurerm_network_security_group" "app" {
  name                = var.naming.nsg_app
  location            = var.location
  resource_group_name = var.resource_group_name
  tags                = var.tags

  security_rule {
    name                       = "AllowAPIMHttpsInbound"
    priority                   = 100
    direction                  = "Inbound"
    access                     = "Allow"
    protocol                   = "Tcp"
    source_port_range          = "*"
    destination_port_range     = "443"
    source_address_prefix      = "ApiManagement"
    destination_address_prefix = "VirtualNetwork"
  }
}

# nsg-pe: no custom rules. Default rules already:
#   - Allow inbound VirtualNetwork → VirtualNetwork
#   - Deny inbound from Internet (priority 65500)
resource "azurerm_network_security_group" "pe" {
  name                = var.naming.nsg_pe
  location            = var.location
  resource_group_name = var.resource_group_name
  tags                = var.tags
}

# nsg-db: same default-deny posture as nsg-pe
resource "azurerm_network_security_group" "db" {
  name                = var.naming.nsg_db
  location            = var.location
  resource_group_name = var.resource_group_name
  tags                = var.tags
}

############################################
# Subnet ↔ NSG associations
############################################

resource "azurerm_subnet_network_security_group_association" "app" {
  subnet_id                 = azurerm_subnet.app.id
  network_security_group_id = azurerm_network_security_group.app.id
}

resource "azurerm_subnet_network_security_group_association" "pe" {
  subnet_id                 = azurerm_subnet.pe.id
  network_security_group_id = azurerm_network_security_group.pe.id
}

resource "azurerm_subnet_network_security_group_association" "db" {
  subnet_id                 = azurerm_subnet.db.id
  network_security_group_id = azurerm_network_security_group.db.id
}

############################################
# Private DNS zones — one per service that uses a Private Endpoint
#
# Each zone is linked to the workload VNet so VNet clients resolve the
# service's public FQDN to its private IP. Registration is disabled
# because the Private Endpoints register A records themselves via
# `private_dns_zone_group`.
############################################

locals {
  private_dns_zone_names = {
    postgres = "privatelink.postgres.database.azure.com"
    blob     = "privatelink.blob.core.windows.net"
    vault    = "privatelink.vaultcore.azure.net"
    cosmos   = "privatelink.documents.azure.com"
    acr      = "privatelink.azurecr.io"
  }
}

resource "azurerm_private_dns_zone" "this" {
  for_each = local.private_dns_zone_names

  name                = each.value
  resource_group_name = var.resource_group_name
  tags                = var.tags
}

resource "azurerm_private_dns_zone_virtual_network_link" "this" {
  for_each = azurerm_private_dns_zone.this

  name                  = "link-${var.naming.vnet}"
  resource_group_name   = var.resource_group_name
  private_dns_zone_name = each.value.name
  virtual_network_id    = azurerm_virtual_network.this.id
  registration_enabled  = false
  tags                  = var.tags
}
