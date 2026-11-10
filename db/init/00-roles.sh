#!/bin/sh
# Scripts de inicialización del motor Postgres (ejecutados por la imagen oficial
# una sola vez, al crear el volumen). Crea el rol de aplicación SIN BYPASSRLS
# y habilita extensiones. Es un .sh (no .sql) porque necesita leer variables de
# entorno para el password; la imagen soporta .sh en /docker-entrypoint-initdb.d.
set -e

# Escapa comillas simples para incrustar de forma segura en SQL.
pw_esc=$(printf '%s' "$APP_DB_PASSWORD" | sed "s/'/''/g")
user_esc=$(printf '%s' "$APP_DB_USER" | sed "s/'/''/g")

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<EOSQL
-- ── Rol de aplicación ──────────────────────────────────────────
-- Sin SUPERUSER y, sobre todo, SIN BYPASSRLS: esta separación es lo que hace
-- que el aislamiento por negocio (§5) sea real y no decorativo.
DO \$do\$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '$user_esc') THEN
    CREATE ROLE "$user_esc" LOGIN PASSWORD '$pw_esc'
      NOCREATEDB NOCREATEROLE NOSUPERUSER NOBYPASSRLS;
  ELSE
    ALTER ROLE "$user_esc" LOGIN PASSWORD '$pw_esc' NOBYPASSRLS;
  END IF;
END
\$do\$;

-- ── Extensiones ─────────────────────────────────────────────────
-- unaccent + pg_trgm: buscador del CRM insensible a acentos (§5/lib).
-- btree_gist: previsto para el cinturón anti-solapamiento opcional (§5).
-- No hace falta pgcrypto: en Postgres 18 gen_random_uuid() y uuidv7() son
-- funciones del núcleo.
CREATE EXTENSION IF NOT EXISTS unaccent;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- Permisos base del rol de aplicación sobre el esquema. Los GRANT sobre
-- tablas concretas los da la migración 0001 (las tablas aún no existen aquí).
GRANT USAGE ON SCHEMA public TO "$user_esc";
GRANT CREATE ON SCHEMA public TO "$user_esc";

-- Permisos por defecto para tablas/secuencias que el rol propietario cree en
-- el futuro (por si se añaden migraciones nuevas sin re-grantear a mano).
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO "$user_esc";
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO "$user_esc";
EOSQL

echo "Rol de aplicación '$APP_DB_USER' y extensiones listos."