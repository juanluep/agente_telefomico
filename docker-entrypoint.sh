#!/bin/sh
# docker-entrypoint.sh (§16.1): ejecuta migraciones (con pg_advisory_lock) y
# luego arranca el servidor standalone. Varias réplicas pueden lanzarse a la
# vez: solo una migra, el resto espera el lock y no vuelve a migrar.
set -e

echo "→ Migraciones…"
node scripts/migrate.cjs

echo "→ Arrancando servidor…"
exec node server.js