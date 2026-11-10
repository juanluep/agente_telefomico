# CLAUDE.md — VoiceOps

VoiceOps es una centralita inteligente + CRM multi-negocio autoalojada (Next 16,
Postgres 18, VAPI) para talleres mecánicos. Cambiar de nicho es tocar
`lib/nicho.ts` y los ejemplos del prompt; el resto es neutral.

## Arranque desde cero
```bash
docker compose up -d              # Postgres + Adminer (infra)
pnpm install                       # dependencias
cp .env.example .env && rellena    # credenciales locales + APP_URL del Funnel
pnpm db:migrate                    # crea el esquema + RLS
pnpm db:seed                       # negocio demo (demo@taller.es / demo1234)
pnpm dev                           # http://localhost:3000
pnpm tunnel                        # expone el webhook vía Tailscale Funnel
pnpm vapi:tools:sync               # crea las 7 tools en VAPI (necesita VAPI_API_KEY)
```
En producción: `docker compose -f docker-compose.dokploy.yml build`.

## Comandos
- `pnpm dev` — app en caliente. `pnpm build` / `pnpm start` — producción.
- `pnpm lint` · `pnpm typecheck` · `pnpm test` — vitest.
- `pnpm db:migrate` / `pnpm db:seed` — esquema y datos demo (TS, vía tsx).
- `pnpm tunnel` — Tailscale Funnel hacia :3000 (lee la URL pública e imprime
  el webhook). `pnpm vapi:sync` — reescribe el `server.url` del asistente Y de
  las tools desde `APP_URL`.
- `pnpm vapi:tools:sync` — crea/actualiza las tools compartidas en VAPI y
  guarda sus IDs en `vapi_tools`. `pnpm vapi:pull-catalog` — regenera el
  catálogo de modelos desde el OpenAPI público de VAPI.

## Arquitectura y decisiones no evidentes
- **`withTenant(businessId, fn)`** (`lib/db/tenant.ts`) es la ÚNICA puerta a
  datos de inquilino: abre transacción, fija `set_config('app.business_id',$1,
  true)` (parametrizado) y corre dentro las consultas. Todas las tablas de
  negocio llevan RLS ENABLE+FORCE contra `current_setting('app.business_id',
  true)::uuid`. `users`/`sessions`/`memberships` NO tienen RLS (solo `lib/auth`).
- **Aislamiento real, no decorativo**: la app conecta como `app_user` (sin
  BYPASSRLS); las migraciones corren como rol propietario (superuser).
  `businesses` permite INSERT sin tenant (`WITH CHECK true`) para que el
  registro atómico funcione; su id se genera con `uuidv7()` JS antes de insertar.
- **Disponibilidad, una sola fuente de verdad**: `lib/scheduling/availability.ts`
  (`findSlots`) + `booking.ts` la usan por igual el agente (tools) y el panel.
  No hay calendario externo. Dos modos de reserva por negocio
  (`voice_agents.booking_mode`): `horas` (franjas, default) y `dias` (estancia
  por días completos, p. ej. hoteles; la estancia la define `services.duration_days`
  y la capacidad es el nº de unidades simultáneas por día).
- **Webhook (`app/api/vapi/webhook`)**: verifica Bearer (§7), resuelve negocio
  con la función SECURITY DEFINER `resolve_business` (salta RLS), marca
  idempotencia en `webhook_events`, despacha tool-calls / status-update /
  end-of-call-report. Siempre responde 200 con JSON.
- **Tools de VAPI = recursos compartidos** (§4.4): se crean una sola vez con
  `vapi:tools:sync` y cada asistente las engancha por `toolIds`. Duplicarlas por
  negocio dispersaría el `server.url`.
- **Stack de modelos por defecto (§10.1) FIJO** en `lib/vapi/defaults.ts`
  (`gpt-5.6-luna`, `eleven_turbo_v2_5`, `voiceId UOIqAnmS11Reiei1Ytkc`,
  Deepgram `nova-3-general` es). El catálogo completo se AMPLIA solo
  regenerando `lib/vapi/catalog-data.generated.ts` con `pnpm vapi:pull-catalog`
  — jamás a mano. Los cambios por negocio se validan contra ese catálogo.
- **Grabaciones**: no se enlaza la URL privada de VAPI (da 400); se sirven por
  `/api/calls/:id/recording` que pide un enlace firmado fresco (302), con caché
  de 20 min. `<audio preload="metadata">`.

## Reglas duras (con su porqué)
- Nunca consultar tablas de inquilino fuera de `withTenant` — RLS las oculta.
  Las únicas excepciones son `resolve_business` y `lib/auth`.
- Nunca declarar el teléfono del llamante como parámetro de una tool — es dato
  de servidor (`message.call.customer.number`); si lo rellena el modelo, alguien
  puede anular la cita de otra persona.
- Nunca inventar identificadores de VAPI (modelos, voces, toolIds). El catálogo
  solo crece regenerándolo.
- Nunca pintar un valor interno crudo: estados, orígenes, roles y `endedReason`
  salen SIEMPRE de `lib/labels.ts`.
- Nunca ejecutar `git add/commit/push` salvo petición expresa del usuario.

## Trampas conocidas
- El `server.url` hay que actualizarlo en el asistente **Y** en las tools: si
  no, el agente contesta pero no agenda. `pnpm vapi:sync` lo hace.
- Los campos del `end-of-call-report` viven en `analysis`/`artifact`, no en la
  raíz. Los roles de `artifact.messages` son `bot`/`user`/`system`/`tool_*`:
  mapear `bot→assistant`, descartar `system` (el prompt). `call_messages.role`
  solo admite `assistant|user|system|tool`.
- `db.execute` (pg crudo) devuelve `timestamptz` como **string**, no `Date`. Usar
  select tipado de Drizzle o pedir convertido en SQL.
- Sin `HOSTNAME=0.0.0.0` el contenedor standalone escucha localhost y Traefik no
  lo alcanza. Sin `dokploy-network` el dominio da 404. Sin `env_file` arranca
  con variables vacías. El volumen de la BD debe ser con nombre, no ruta host.
- Los teléfonos se normalizan a E.164 ANTES de tocar la BD (sin esto, el CRM
  duplica fichas). `analysisPlan.summaryPlan` debe llevar `enabled: true`
  explícito (si no, vuelve false y los resúmenes no se generan).

## Mapa de carpetas
- `lib/` — lógica de negocio. `db/` (pool, tenant, schema Drizzle), `auth/`,
  `vapi/` (defaults, prompt, catalog, publish, webhook handler), `scheduling/`,
  `crm/`, `labels.ts`, `phone.ts`, `env.ts`, `nicho.ts`.
- `app/` — rutas (App Router). `(app)/` grupo con layout+sidebar; `(app)/panel`,
  `agenda`, `contactos`, `conversaciones/`, `estudio`, `conexiones`, `perfil`.
  `api/` con `vapi/webhook`, `vapi/outbound`, `calls/[id]/recording`, `health`.
- `db/` — migraciones SQL (`migrations/NNNN_*.sql`), `init/00-roles.sh`.
- `scripts/` — migrate, seed, vapi-tools-sync, vapi-pull-catalog, vapi-sync,
  tunnel.{sh,ps1,mjs}.