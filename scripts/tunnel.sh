#!/bin/sh
# Levanta el Funnel de Tailscale hacia :3000 e imprime la URL del webhook lista
# para pegar en VAPI. Requisitos previos (§15.1, documentados en el README):
#   1) Tailscale instalado y con sesión iniciada.
#   2) MagicDNS activado.
#   3) Certificados HTTPS habilitados en el tailnet.
#   4) Atributo `funnel` en las ACL del tailnet.
set -e

if ! command -v tailscale >/dev/null 2>&1; then
  echo "Tailscale no está instalado. Instálalo e inicia sesión antes de continuar." >&2
  exit 1
fi

echo "Levantando Tailscale Funnel hacia el puerto local 3000…"
tailscale funnel --bg 3000 >/dev/null 2>&1 || {
  echo "No se pudo levantar el Funnel. Revisa los requisitos previos (§15.1)." >&2
  exit 1
}

URL=$(tailscale funnel status 2>/dev/null | grep -oE 'https://[a-z0-9.-]+\.ts\.net' | head -n1)
if [ -z "$URL" ]; then
  echo "No se pudo leer la URL pública. Ejecuta 'tailscale funnel status' a mano." >&2
  exit 1
fi

echo ""
echo "✅ Webhook listo para pegar en VAPI (server.url del asistente y de las tools):"
echo "    ${URL}/api/vapi/webhook"
echo ""
echo "Si la URL cambió respecto a APP_URL en .env, actualízala y ejecuta:"
echo "    pnpm vapi:sync"