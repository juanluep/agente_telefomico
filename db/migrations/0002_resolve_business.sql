-- ════════════════════════════════════════════════════════════════════
-- 0002_resolve_business.sql — resolución de inquilino para el webhook
-- ════════════════════════════════════════════════════════════════════
-- El webhook (§4.5) tiene que resolver a qué negocio pertenece una llamada a
-- partir del assistantId / phoneNumberId / metadata.businessId, PERO voice_agents
-- y calls están bajo RLS: app_user no puede verlos sin un inquilino fijado (y
-- fijarlo es justo lo que intenta resolver). Es el clásico problema de arranque.
--
-- Solución: una función SECURITY DEFINER, estable (read-only), propiedad del
-- rol propietario (superuser) → ejecuta saltando RLS. app_user la invoca, lee
-- el business_id y a partir de ahí entra por withTenant, donde ya aplica RLS.
-- Es el "camino explícito y auditado" que menciona §5 para el webhook. Solo
-- lectura; no expresa datos del inquilino más allá del id necesario.
CREATE OR REPLACE FUNCTION resolve_business(
  p_business_id   text,
  p_assistant_id  text,
  p_phone_id      text,
  p_vapi_call_id  text
) RETURNS uuid
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public
AS $$
  -- 1) metadata.businessId determinista (llamadas salientes creadas con metadata)
  SELECT id FROM businesses
   WHERE p_business_id IS NOT NULL
     AND p_business_id ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
     AND id = p_business_id::uuid
  UNION ALL
  -- 2) assistantId → voice_agents
  SELECT business_id FROM voice_agents
   WHERE p_assistant_id IS NOT NULL AND vapi_assistant_id = p_assistant_id
  UNION ALL
  -- 3) phoneNumberId → voice_agents
  SELECT business_id FROM voice_agents
   WHERE p_phone_id IS NOT NULL AND vapi_phone_number_id = p_phone_id
  UNION ALL
  -- 4) vapiCallId → llamada ya persistida (status-update / end-of-call-report)
  SELECT business_id FROM calls
   WHERE p_vapi_call_id IS NOT NULL AND vapi_call_id = p_vapi_call_id
  LIMIT 1
$$;

REVOKE EXECUTE ON FUNCTION resolve_business(text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION resolve_business(text, text, text, text) TO app_user;