-- ════════════════════════════════════════════════════════════════════
-- 0001_init.sql — Esquema completo de VoiceOps
-- ════════════════════════════════════════════════════════════════════
-- AISLAMIENTO POR NEGOCIO (§5)
-- Sin Auth gestionado no existe auth.uid(). El aislamiento se implementa con
-- variables de sesión de Postgres: el helper withTenant(businessId) abre una
-- transacción, fija el inquilino con set_config('app.business_id', $1, true)
-- — PARAMETRIZADO, SET LOCAL no admite parámetros y concatenar sería
-- inyectable — y cada política RLS compara contra
-- current_setting('app.business_id', true)::uuid.
--
-- Todas las tablas de negocio llevan ENABLE + FORCE ROW LEVEL SECURITY, para
-- que la protección aplique incluso al propietario (el rol de aplicación
-- app_user, que NO es superuser ni BYPASSRLS, queda siempre sujeto). Las
-- migraciones corren con el rol propietario (superuser), que salta RLS.
--
-- ANTI-SOLAPAMIENTO (§5): vía transaccional en lib/scheduling/booking.ts, SIN
-- EXCLUDE. Se toma pg_advisory_xact_lock(hashtextextended(business_id::text,0))
-- por negocio + recuento de citas solapadas no anuladas frente a slot_capacity
-- + revalidación de horario/cierres/antelación. btree_gist queda instalada por
-- si un despliegue con capacidad fija 1 quiere añadir una EXCLUDE como
-- cinturón extra; este fichero no la declara.
-- ════════════════════════════════════════════════════════════════════

-- ── Helpers ────────────────────────────────────────────────────────

-- Wrapper IMMUTABLE de unaccent para indexar (unaccent() no es IMMUTABLE).
-- La forma de un argumento no es IMMUTABLE; la de dos (diccionario explícito)
-- sí se puede envolver así. Necesario para el GIN de trigramas del CRM.
CREATE OR REPLACE FUNCTION f_unaccent(text) RETURNS text
  LANGUAGE sql IMMUTABLE PARALLEL SAFE
  AS $$ SELECT public.unaccent('public.unaccent', $1) $$;

-- updated_at automático.
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger
  LANGUAGE plpgsql
  AS $$
  BEGIN
    NEW.updated_at = now();
    RETURN NEW;
  END;
  $$;

-- Slug único para el nombre del negocio al registrarse.
CREATE OR REPLACE FUNCTION slugify_business_name(input text) RETURNS text
  LANGUAGE sql IMMUTABLE PARALLEL SAFE
  AS $$
  SELECT lower(regexp_replace(f_unaccent(input), '[^a-z0-9]+', '-', 'g'))
  $$;

-- ── Tablas de identidad (sin RLS: solo lib/auth las toca) ──────────

CREATE TABLE businesses (
  id          uuid PRIMARY KEY DEFAULT uuidv7(),
  name        text NOT NULL,
  slug        text NOT NULL UNIQUE,
  timezone    text NOT NULL DEFAULT 'Europe/Madrid',
  phone       text,
  email       text,
  website     text,
  address     text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE users (
  id            uuid PRIMARY KEY DEFAULT uuidv7(),
  email         text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  full_name     text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE memberships (
  user_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  business_id  uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  role         text NOT NULL DEFAULT 'owner' CHECK (role IN ('owner','staff')),
  created_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, business_id)
);

CREATE TABLE sessions (
  id          uuid PRIMARY KEY DEFAULT uuidv7(),
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  text NOT NULL UNIQUE,
  expires_at  timestamptz NOT NULL,
  user_agent  text,
  ip          text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- ── Configuración del agente de voz (1:1 con negocio) ─────────────

CREATE TABLE voice_agents (
  business_id           uuid PRIMARY KEY REFERENCES businesses(id) ON DELETE CASCADE,
  system_prompt         text,
  system_prompt_override text,
  first_message         text,
  tone                  text NOT NULL DEFAULT 'cercano y resolutivo',
  voice_provider        text,
  voice_id              text,
  voice_model           text,
  voice_language        text,
  language              text NOT NULL DEFAULT 'es',
  model                 jsonb NOT NULL DEFAULT '{}'::jsonb,
  transcriber           jsonb NOT NULL DEFAULT '{}'::jsonb,
  handoff_number        text,
  handoff_message       text,
  slot_capacity         int  NOT NULL DEFAULT 1 CHECK (slot_capacity >= 1),
  min_notice_minutes    int  NOT NULL DEFAULT 60,
  booking_horizon_days  int  NOT NULL DEFAULT 60,
  max_duration_seconds  int  NOT NULL DEFAULT 600,
  vapi_assistant_id    text,
  vapi_phone_number_id text,
  published_at         timestamptz,
  updated_at           timestamptz NOT NULL DEFAULT now()
);

-- ── Conocimiento editable del negocio ─────────────────────────────

CREATE TABLE business_facts (
  id          uuid PRIMARY KEY DEFAULT uuidv7(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  question    text NOT NULL,
  answer      text NOT NULL,
  sort_order  int  NOT NULL DEFAULT 0
);

CREATE TABLE services (
  id               uuid PRIMARY KEY DEFAULT uuidv7(),
  business_id      uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name             text NOT NULL,
  duration_minutes int  NOT NULL DEFAULT 60 CHECK (duration_minutes > 0),
  price_cents      int,
  description      text,
  is_active        boolean NOT NULL DEFAULT true,
  sort_order       int  NOT NULL DEFAULT 0
);

CREATE TABLE business_hours (
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  weekday     int  NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  opens_at    time NOT NULL,
  closes_at   time NOT NULL,
  is_closed   boolean NOT NULL DEFAULT false,
  id          uuid PRIMARY KEY DEFAULT uuidv7()
);

CREATE TABLE closures (
  id          uuid PRIMARY KEY DEFAULT uuidv7(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  starts_at   timestamptz NOT NULL,
  ends_at     timestamptz NOT NULL,
  reason      text
);

-- ── CRM ────────────────────────────────────────────────────────────

CREATE TABLE contacts (
  id                uuid PRIMARY KEY DEFAULT uuidv7(),
  business_id       uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  full_name         text,
  phone             text,
  email             text,
  company           text,
  notes             text,
  tags              text[] NOT NULL DEFAULT '{}',
  status            text NOT NULL DEFAULT 'lead' CHECK (status IN ('lead','cliente','inactivo')),
  source            text NOT NULL DEFAULT 'manual' CHECK (source IN ('agente_voz','manual','importado')),
  custom_fields     jsonb NOT NULL DEFAULT '{}'::jsonb,
  outbound_consent  boolean NOT NULL DEFAULT false,
  last_contacted_at timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT contacts_phone_check CHECK (phone IS NULL OR phone ~ '^\+[1-9][0-9]{6,14}$')
);

-- Único parcial: el agente no duplica fichas por teléfono (§8.1).
CREATE UNIQUE INDEX contacts_business_phone_uniq
  ON contacts (business_id, phone)
  WHERE phone IS NOT NULL;

CREATE TABLE contact_notes (
  id             uuid PRIMARY KEY DEFAULT uuidv7(),
  business_id    uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  contact_id     uuid NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  body           text NOT NULL,
  author_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at     timestamptz NOT NULL DEFAULT now()
);

-- ── Llamadas y transcripción ───────────────────────────────────────

CREATE TABLE calls (
  id               uuid PRIMARY KEY DEFAULT uuidv7(),
  business_id      uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  contact_id       uuid REFERENCES contacts(id) ON DELETE SET NULL,
  vapi_call_id     text NOT NULL UNIQUE,
  direction        text NOT NULL DEFAULT 'inbound' CHECK (direction IN ('inbound','outbound')),
  from_number      text,
  started_at       timestamptz,
  ended_at         timestamptz,
  duration_seconds int,
  status           text NOT NULL DEFAULT 'queued'
                   CHECK (status IN ('scheduled','queued','ringing','in-progress','forwarding','ended')),
  ended_reason     text,
  summary          text,
  cost_cents       int,  -- céntimos de USD; VAPI factura en dólares (§5).
  recording_url    text,
  needs_review     boolean NOT NULL DEFAULT false,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE call_messages (
  id                uuid PRIMARY KEY DEFAULT uuidv7(),
  business_id       uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  call_id           uuid NOT NULL REFERENCES calls(id) ON DELETE CASCADE,
  role              text NOT NULL CHECK (role IN ('assistant','user','system','tool')),
  content           text NOT NULL,
  seconds_from_start int,
  sort_order        int  NOT NULL DEFAULT 0
);

-- ── Citas ──────────────────────────────────────────────────────────

CREATE TABLE appointments (
  id           uuid PRIMARY KEY DEFAULT uuidv7(),
  business_id  uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  contact_id   uuid REFERENCES contacts(id) ON DELETE SET NULL,
  call_id      uuid REFERENCES calls(id) ON DELETE SET NULL,
  service_id   uuid REFERENCES services(id) ON DELETE SET NULL,
  service_name text,
  starts_at    timestamptz NOT NULL,
  ends_at      timestamptz NOT NULL,
  status       text NOT NULL DEFAULT 'agendada'
               CHECK (status IN ('agendada','confirmada','completada','anulada','no_show')),
  notes        text,
  created_via  text NOT NULL DEFAULT 'panel' CHECK (created_via IN ('agente_voz','panel')),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

-- ── Webhook: idempotencia y auditoría ──────────────────────────────

CREATE TABLE webhook_events (
  id          uuid PRIMARY KEY DEFAULT uuidv7(),
  business_id uuid REFERENCES businesses(id) ON DELETE CASCADE,
  provider    text NOT NULL DEFAULT 'vapi',
  event_type  text NOT NULL,
  external_id text NOT NULL UNIQUE,
  payload     jsonb NOT NULL DEFAULT '{}'::jsonb,
  processed_at timestamptz,
  error       text
);

-- ── Tools compartidas de VAPI (infraestructura de plataforma, sin RLS) ──

CREATE TABLE vapi_tools (
  name         text PRIMARY KEY,
  vapi_tool_id text NOT NULL,
  checksum     text NOT NULL,
  synced_at   timestamptz NOT NULL DEFAULT now()
);

-- ── Índices ───────────────────────────────────────────────────────

CREATE INDEX appointments_business_starts_idx    ON appointments (business_id, starts_at);
CREATE INDEX calls_business_started_idx          ON calls (business_id, started_at DESC);
CREATE INDEX contact_notes_contact_idx           ON contact_notes (contact_id, created_at DESC);
CREATE INDEX call_messages_call_idx             ON call_messages (call_id, sort_order);

-- Buscador del CRM: GIN de trigramas sobre el nombre sin acentos (§5).
-- Ojo: un GIN "a secas" sobre text no existe; hace falta gin_trgm_ops, y
-- unaccent() no es IMMUTABLE, por eso el wrapper f_unaccent().
CREATE INDEX contacts_name_trgm_idx
  ON contacts USING gin (f_unaccent(full_name) gin_trgm_ops);

-- ── Triggers de updated_at ────────────────────────────────────────

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['businesses','voice_agents','contacts','appointments'] LOOP
    EXECUTE format(
      'CREATE TRIGGER set_updated_at BEFORE UPDATE ON %I ' ||
      'FOR EACH ROW EXECUTE FUNCTION set_updated_at()', t);
  END LOOP;
END $$;

-- ── Row Level Security ────────────────────────────────────────────
-- Tablas de negocio: el inquilino sale de current_setting('app.business_id').
-- businesses permite INSERT sin tenant (registro atómico §5): WITH CHECK (true)
-- — ya que no hay lectura posible de otro negocio y la inserción la.controla
-- el servidor con app_user. El resto exige business_id == inquilino activo.

ALTER TABLE voice_agents       ENABLE ROW LEVEL SECURITY; ALTER TABLE voice_agents       FORCE ROW LEVEL SECURITY;
ALTER TABLE business_facts     ENABLE ROW LEVEL SECURITY; ALTER TABLE business_facts     FORCE ROW LEVEL SECURITY;
ALTER TABLE services           ENABLE ROW LEVEL SECURITY; ALTER TABLE services           FORCE ROW LEVEL SECURITY;
ALTER TABLE business_hours     ENABLE ROW LEVEL SECURITY; ALTER TABLE business_hours     FORCE ROW LEVEL SECURITY;
ALTER TABLE closures           ENABLE ROW LEVEL SECURITY; ALTER TABLE closures           FORCE ROW LEVEL SECURITY;
ALTER TABLE contacts           ENABLE ROW LEVEL SECURITY; ALTER TABLE contacts           FORCE ROW LEVEL SECURITY;
ALTER TABLE contact_notes      ENABLE ROW LEVEL SECURITY; ALTER TABLE contact_notes      FORCE ROW LEVEL SECURITY;
ALTER TABLE calls              ENABLE ROW LEVEL SECURITY; ALTER TABLE calls              FORCE ROW LEVEL SECURITY;
ALTER TABLE call_messages      ENABLE ROW LEVEL SECURITY; ALTER TABLE call_messages      FORCE ROW LEVEL SECURITY;
ALTER TABLE appointments       ENABLE ROW LEVEL SECURITY; ALTER TABLE appointments       FORCE ROW LEVEL SECURITY;
ALTER TABLE webhook_events     ENABLE ROW LEVEL SECURITY; ALTER TABLE webhook_events     FORCE ROW LEVEL SECURITY;
ALTER TABLE businesses         ENABLE ROW LEVEL SECURITY; ALTER TABLE businesses         FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON businesses
  USING (id = current_setting('app.business_id', true)::uuid)
  WITH CHECK (true);

CREATE POLICY tenant_isolation ON voice_agents
  USING (business_id = current_setting('app.business_id', true)::uuid)
  WITH CHECK (business_id = current_setting('app.business_id', true)::uuid);

CREATE POLICY tenant_isolation ON business_facts
  USING (business_id = current_setting('app.business_id', true)::uuid)
  WITH CHECK (business_id = current_setting('app.business_id', true)::uuid);

CREATE POLICY tenant_isolation ON services
  USING (business_id = current_setting('app.business_id', true)::uuid)
  WITH CHECK (business_id = current_setting('app.business_id', true)::uuid);

CREATE POLICY tenant_isolation ON business_hours
  USING (business_id = current_setting('app.business_id', true)::uuid)
  WITH CHECK (business_id = current_setting('app.business_id', true)::uuid);

CREATE POLICY tenant_isolation ON closures
  USING (business_id = current_setting('app.business_id', true)::uuid)
  WITH CHECK (business_id = current_setting('app.business_id', true)::uuid);

CREATE POLICY tenant_isolation ON contacts
  USING (business_id = current_setting('app.business_id', true)::uuid)
  WITH CHECK (business_id = current_setting('app.business_id', true)::uuid);

CREATE POLICY tenant_isolation ON contact_notes
  USING (business_id = current_setting('app.business_id', true)::uuid)
  WITH CHECK (business_id = current_setting('app.business_id', true)::uuid);

CREATE POLICY tenant_isolation ON calls
  USING (business_id = current_setting('app.business_id', true)::uuid)
  WITH CHECK (business_id = current_setting('app.business_id', true)::uuid);

CREATE POLICY tenant_isolation ON call_messages
  USING (business_id = current_setting('app.business_id', true)::uuid)
  WITH CHECK (business_id = current_setting('app.business_id', true)::uuid);

CREATE POLICY tenant_isolation ON appointments
  USING (business_id = current_setting('app.business_id', true)::uuid)
  WITH CHECK (business_id = current_setting('app.business_id', true)::uuid);

CREATE POLICY tenant_isolation ON webhook_events
  USING (business_id = current_setting('app.business_id', true)::uuid OR business_id IS NULL)
  WITH CHECK (business_id = current_setting('app.business_id', true)::uuid OR business_id IS NULL);

-- ── Permisos del rol de aplicación ────────────────────────────────
-- app_user accede a todo el esquema. RLS es lo que aisla, no los grants.

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_user;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_user;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO app_user;