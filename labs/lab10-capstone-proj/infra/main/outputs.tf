############################################
# Root-level outputs
#
# These surface values that downstream tooling (GitHub Actions workflows,
# the SWA CLI deploy, the FE build) needs to read after `terraform apply`.
# Run `terraform output <name>` to fetch them.
############################################

output "static_web_app_url" {
  description = "Public URL of the Static Web App (https://<host>). Feed into VITE_PUBLIC_URL at FE build time."
  value       = "https://${module.static_web_app.default_host_name}"
}

output "static_web_app_deployment_token" {
  description = "SWA deployment token for GitHub Actions / SWA CLI. Sensitive — read with `terraform output -raw static_web_app_deployment_token`."
  value       = module.static_web_app.api_key
  sensitive   = true
}
