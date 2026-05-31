locals {
  # Resource name map — every resource is derived from here so names are consistent.
  # Convention: <type-prefix>-skillplatform-prod[-<purpose>]
  naming = {
    rg        = "rg-skillplatform-prod"
    vnet      = "vnet-skillplatform-prod"
    snet_app  = "snet-app"
    snet_pe   = "snet-pe"
    snet_db   = "snet-db"
    snet_aca  = "snet-aca"
    nsg_app   = "nsg-app"
    nsg_pe    = "nsg-pe"
    nsg_db    = "nsg-db"
    psql      = "psql-skillplatform-prod"
    storage   = "stskillplatformprod" # storage accounts: lowercase, no hyphens, ≤24 chars
    kv        = "kv-skillplatform-prod"
    cosmos    = "cosmos-skillplatform-prod"
    acr       = "acrskillplatformprod" # ACR: lowercase alphanumeric only
    log       = "log-skillplatform-prod"
    appi      = "appi-skillplatform-prod"
    plan      = "plan-skillplatform-prod"
    app       = "app-skillplatform-prod"
    stapp     = "stapp-skillplatform-prod"
    func_plan = "plan-func-skillplatform-prod"
    func      = "func-skillplatform-prod"
    cae       = "cae-skillplatform-prod"
    aca_thumb = "aca-skillplatform-thumbnail"
    apim      = "apim-skillplatform-prod"
    budget    = "budget-skillplatform-monthly"
    dash      = "dash-skillplatform-prod"
    ag        = "ag-skillplatform-oncall"
  }

  tags = {
    project   = "skillplatform"
    env       = "prod"
    managedBy = "terraform"
  }
}
