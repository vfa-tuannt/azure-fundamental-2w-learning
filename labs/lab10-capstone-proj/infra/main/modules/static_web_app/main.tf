############################################
# Azure Static Web Apps — Free tier
#
# The Vue SPA build artifact (frontend/dist/) is published here. We
# choose the "Custom" / no-built-in-build flavour because the project
# already has a yarn-based pipeline and will deploy via GitHub Actions
# (Phase 7d) rather than the SWA-managed Oryx build.
#
# Region note: SWA is only offered in a handful of regions. `eastasia`
# is the closest one to the rest of the workload (which lives in
# `japaneast`). Latency between the two is in the low-tens-of-ms range —
# fine for serving the SPA shell.
#
# Networking: the Free SKU does NOT support private endpoints or VNet
# integration. The SWA is therefore implicitly public — which is the
# desired behaviour for a SPA shell anyway. All sensitive API traffic
# leaves the SWA over the public Internet to APIM (Phase 7d).
############################################

resource "azurerm_static_web_app" "this" {
  name                = var.name
  location            = var.location
  resource_group_name = var.resource_group_name

  sku_tier = "Free"
  sku_size = "Free"

  tags = var.tags
}
