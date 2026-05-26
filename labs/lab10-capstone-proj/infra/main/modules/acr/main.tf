############################################
# Azure Container Registry — Premium, private-only
#
# Premium SKU is required because:
#   - Private Endpoints are a Premium feature.
#   - IP/network rules are a Premium feature.
# Basic and Standard tiers can ONLY be exposed publicly with AAD auth.
#
# Admin user is OFF. The only way to pull images is via AAD tokens
# (managed identity + AcrPull role), which the Container App will
# use in section 3.4.
############################################

resource "azurerm_container_registry" "this" {
  name                = var.registry_name
  resource_group_name = var.resource_group_name
  location            = var.location

  sku           = var.sku
  admin_enabled = false

  # Force AAD-only auth path. With public access off and admin off,
  # the only ingress is via the Private Endpoint below.
  public_network_access_enabled = false

  # Disable anonymous pull and quarantine policy — not needed here.
  anonymous_pull_enabled = false

  tags = var.tags
}

############################################
# Private Endpoint (registry sub-resource)
############################################

resource "azurerm_private_endpoint" "registry" {
  name                = "pe-${var.registry_name}"
  location            = var.location
  resource_group_name = var.resource_group_name
  subnet_id           = var.subnet_pe_id

  private_service_connection {
    name                           = "psc-${var.registry_name}"
    private_connection_resource_id = azurerm_container_registry.this.id
    subresource_names              = ["registry"]
    is_manual_connection           = false
  }

  private_dns_zone_group {
    name                 = "default"
    private_dns_zone_ids = [var.acr_private_dns_zone_id]
  }

  tags = var.tags
}
