-- ════════════════════════════════════════════════════════════════════
-- 0003_phone_details.sql — persistencia de la info del número vinculado
-- ════════════════════════════════════════════════════════════════════
-- Hasta ahora voice_agents solo guardaba el vapi_phone_number_id (UUID de
-- VAPI), y la página de Conexiones mostraba ese ID crudo. Este esquema añade
-- los datos legibles del número (número E.164, nombre, proveedor, estado y
-- resourceId del proveedor) que se refrescan desde VAPI con `pnpm vapi:sync`
-- o al publicar el asistente. La información del número queda así persistida
-- y permanente, sin depender de llamadas en vivo a la API de VAPI.
ALTER TABLE voice_agents
  ADD COLUMN IF NOT EXISTS vapi_phone_number       text,
  ADD COLUMN IF NOT EXISTS vapi_phone_name         text,
  ADD COLUMN IF NOT EXISTS vapi_phone_provider     text,
  ADD COLUMN IF NOT EXISTS vapi_phone_status       text,
  ADD COLUMN IF NOT EXISTS vapi_phone_provider_resource_id text,
  ADD COLUMN IF NOT EXISTS vapi_phone_synced_at    timestamptz;