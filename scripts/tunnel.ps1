# Levanta el Funnel de Tailscale hacia :3000 e imprime la URL del webhook lista
# para pegar en VAPI. Ver requisitos previos en el README (§15.1).
$ErrorActionPreference = "Stop"

if (-not (Get-Command tailscale -ErrorAction SilentlyContinue)) {
  Write-Error "Tailscale no está instalado. Instálalo e inicia sesión antes de continuar."
  exit 1
}

Write-Host "Levantando Tailscale Funnel hacia el puerto local 3000…"
$null = tailscale funnel --bg 3000 2>&1
if ($LASTEXITCODE -ne 0) {
  Write-Error "No se pudo levantar el Funnel. Revisa los requisitos previos (§15.1)."
  exit 1
}

$status = tailscale funnel status 2>$null
$url = ([regex]::Match($status, 'https://[a-z0-9.\-]+\.ts\.net')).Value
if (-not $url) {
  Write-Error "No se pudo leer la URL pública. Ejecuta 'tailscale funnel status' a mano."
  exit 1
}

Write-Host ""
Write-Host "✅ Webhook listo para pegar en VAPI (server.url del asistente y de las tools):"
Write-Host "    $url/api/vapi/webhook"
Write-Host ""
Write-Host "Si la URL cambió respecto a APP_URL en .env, actualízala y ejecuta:"
Write-Host "    pnpm vapi:sync"