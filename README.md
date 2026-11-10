# VoiceOps — Recepcionista telefónico con IA + CRM

Centralita inteligente + CRM **multi-negocio autoalojada** (Next.js 16, Postgres 18,
VAPI de voz). Pensada para **talleres mecánicos**; adaptar a otro nicho es tocar
`lib/nicho.ts` y los ejemplos del prompt (más abajo).

La reserva admite **dos modos por negocio** (Ajustes del Agente → Modo de reserva):
- **Por horas** (default): talleres, peluquerías, asesorías, médicos… franjas de minutos.
- **Por días**: hoteles, alquileres, casas rurales… la cita ocupa días completos y
  cada servicio define su estancia (`duration_days`, p. ej. «habitación doble · 2 noches»).
  El agente habla en fechas («del lunes 24 al martes 25») y la capacidad por día es
  el número de habitaciones/unidades simultáneas.

> Demo: al Registrarse se crea el negocio, el usuario y la configuración inicial
> del agente. Para probar sin registrar: `pnpm db:seed` deja
> **`demo@taller.es` / `demo1234`** (negocio «Agente Taller»), con contactos, una
> llamada transcrita y dos citas.

---

## Requisitos previos
- Docker (Postgres 18 se levanta en contenedor).
- Node.js 24+ y **pnpm 11** (`corepack enable && corepack prepare pnpm@11.0.4 --activate`).
- Cuenta de **VAPI** con una `VAPI_API_KEY` de servidor.
- (Dev) **Tailscale** instalado y con sesión iniciada, MagicDNS activado,
  certificados HTTPS habilitados y `funnel` en las ACL del tailnet (§15.1).

## Arranque en 8 pasos

```bash
# 1) Infra Solo Postgres + Adminer
docker compose up -d

# 2) Dependencias
pnpm install

# 3) Configura el entorno
cp .env.example .env        # rellena POSTGRES_PASSWORD, APP_DB_PASSWORD, etc.

# 4) Migra (crea esquema + RLS + índices) y semilla (negocio demo)
pnpm db:migrate
pnpm db:seed

# 5) Arranca la app
pnpm dev                    # http://localhost:3000  →  /login  (o /panel con la demo)

# 6) Expón el webhook a Internet con Tailscale Funnel (NO ngrok)
pnpm tunnel                 # imprime la URL pública con /api/vapi/webhook
#   Copia esa URL en APP_URL de .env  (si cambió) y reinicia `pnpm dev`.

# 7) Crea la Custom Credential en el dashboard de VAPI
#    Dashboard → Custom Credentials → nueva de tipo "Bearer Token".
#    El token que pongas ahí = VAPI_WEBHOOK_TOKEN. Guarda su ID en
#    VAPI_SERVER_CREDENTIAL_ID. Ambos van en .env. §7.

# 8) Verifica el stack de modelos por defecto (§10.1) y crea las tools:
pnpm vapi:tools:sync        # crea las 7 tools compartidas; necesita VAPI_API_KEY
```

A partir de aquí: entra en la app → **Conexiones** (provisiona el asistente y
vincula un número) → **Ajustes del Agente** → **Publicar**. El agente ya puede
recibir llamadas en el número configurado.

---

## Verificación del stack de modelos por defecto (§10.1)

Los identificadores se fijaron en `lib/vapi/defaults.ts` contrastándolos con el
**OpenAPI público de VAPI** (`api.vapi.ai/api-json`, agosto 2026):

| Pieza        | Proveedor  | id exacto (API)         |
|--------------|------------|-------------------------|
| Transcriptor | Deepgram   | `nova-3-general` + `language: "es"` |
| Modelo LLM   | OpenAI      | `gpt-5.6-luna` |
| Voz          | ElevenLabs  | motor `eleven_turbo_v2_5`, `voiceId` `UOIqAnmS11Reiei1Ytkc` (etiqueta «burt» en el panel; en NUESTRA interfaz se llama «Carolina») |

**Doble-check recomendado** antes de la primera publicación real: configura una
vez el asistente a mano en el dashboard de VAPI con esos tres modelos, haz
`GET /assistant/{id}` y comprueba que `transcriber`, `model` y `voice` devuelven
exactamente esos valores; si no cuadran, ajusta `lib/vapi/defaults.ts`. Si al
publicar sale «no se encuentra la voz», suele faltar conectar la credencial de
ElevenLabs en el panel de VAPI (Dashboard → Integrations).

---

## Cómo conseguir un número de teléfono en España (§14.3)

- Los **números gratuitos de VAPI son de EE. UU.**: no llaman a España y sirven
  solo para probar (desde EE. UU. o por llamada web). No son para producción.
- Para un número español real **importa uno propio** de **Twilio, Telnyx o
  Vonage**: compra el número en el operador y, en el dashboard de VAPI
  (Phone Numbers → Importar), pásalo con sus credenciales del operador. El `id`
  resultante (UUID de VAPI) se enlaza al asistente desde **Conexiones** o, por
  API, con `PATCH /phone-number/{id}` fijando `assistantId`.
- Ruta de prueba: número gratuito de VAPI llamando desde EE. UU. **o** llamada
  web con el Web SDK. Ruta de producción: número español importado.

---

## Publicar en GitHub (§17)

El repositorio NO viene commiteado a propósito (regla del brief). Cuando
 quieras versionar:

```bash
git add .
git commit -m "VoiceOps: recepcionista telefónico con IA + CRM"
git remote add origin git@github.com:<usuario>/<repositorio>.git
git branch -M main
git push -u origin main
```

Crea el repositorio **privado** en GitHub. En Dokploy, autoriza el acceso con la
GitHub App (recomendado: habilita Auto Deploy) o con una clave de despliegue.

> El `.gitignore` ya excluye `.env`, `pgdata/`, `.next/` y `node_modules/`.
> Comprueba que no hay secretos en el árbol (`git status`) antes del commit.

---

## Desplegar en Hostinger con Dokploy (§16)

1. VPS en Hostinger con **Ubuntu 24.04** + plantilla **Dokploy** (mín. 2 vCPU / 4 GB).
2. Apunta un registro **A** del dominio a la IP del VPS y espera propagación.
3. En Dokploy: **New Project → Compose**, conecta el repo y fija **Compose Path**
   a `./docker-compose.dokploy.yml`.
4. Variables en la pestaña *Environment* (incluidas `APP_DOMAIN` y
   `APP_URL=https://<dominio>`). Recuerda que Dokploy vuelca a `.env` pero NO
   inyecta en el contenedor: el compose lleva `env_file: [.env]` por eso.
5. **Deploy.** Traefik emite el certificado de Let's Encrypt solo.
6. Activa **Auto Deploy** para que cada `push` a `main` redespliegue.
7. En producción: `pnpm vapi:sync` y vuelve a **Ajustes del Agente → Publicar**
   para que el `server.url` (asistente **y** tools) apunte al dominio en vez
   de al Funnel de desarrollo.
8. Activa las copias de seguridad del volumen `pgdata` en Dokploy.

**Acceso a la BD de producción sin abrir puertos**: instala Tailscale en el VPS y
accede a Postgres *dentro del tailnet* (exponiendo el 5432 por `tailscale serve`,
nunca por `ports:` en el compose). Es la contrapartida natural del túnel de dev.

### Diario de despliegue (§16.5)

| Síntoma | Causa / arreglo |
|---|---Dominio da 404 | Falta la red `dokploy-network` (externa) o la etiqueta `traefik.docker.network=dokploy-network`. |
| La app arranca con variables vacías | Falta `env_file: [.env]` en el servicio. Dokploy no inyecta solas. |
| El certificado no se emite | DNS sin propagar o puerto 80 cerrado en el VPS. |
| Contenedor sano pero inalcanzable | Falta `ENV HOSTNAME=0.0.0.0` (el standalone escuchaba solo localhost). |
| Las migraciones no corren | `docker-entrypoint.sh` sin permisos de ejecución o mal copiado. |

---

## Diagnosticar el agente de VAPI (§14.6)

| Síntoma | Causa |
|---|---|
| El agente contesta pero **nunca agenda** | El `server.url` de las **tools** apunta a la URL vieja, aunque el del asistente esté bien. `pnpm vapi:sync`. |
| El agente dice «no puedo consultar la agenda» y VAPI muestra *«No result returned for call_…»*, el webhook responde 200 y NO registra evento de tool | Se leyó `toolCall.name` (undefined): el nombre real está en `toolCall.function.name` y los argumentos son un **string JSON** (§9.4). |
| Las llamadas se guardan **sin resumen ni transcripción** | Se leyó `message.summary` en vez de `message.analysis.summary` / `message.artifact.transcript`, o los artefactos están desactivados. |
| La transcripción **empieza con el prompt entero** y el agente no aparece | VAPI envía la voz del agente con `role:"bot"`, no `"assistant"`. Hay un mapeo explícito `bot→assistant` y se descarta `system` (§14.1). |
| El buscador de conversaciones da falsos positivos | Se está guardando el mensaje `system` (el prompt) como transcripción. |
| `message.analysis` llega **vacío** aunque enviaste `summaryPlan` | Falta `enabled: true` dentro de `summaryPlan`. Compruébalo con `GET /assistant/{id}`. |
| El reproductor aparece pero **no suena** | Se enlazó `artifact.recordingUrl` (privado, 400). Sírvelo por `/api/calls/:id/recording` (URL firmada fresca). |
| La grabación funcionó y **al día siguiente dejó de sonar** | Se guardó una URL firmada (caducan a ~30 min). Se guarda la cruda y se firma al reproducir. |
| El reproductor marca **`0:00` hasta pulsar play** | Falta `preload="metadata"`. |
| «async function with useActionState was called outside of a transition» al mover una cita | Envuelve la acción en `startTransition` o `isPending` no se actualiza. |
| Vista con SQL crudo revienta con ciertas fechas | `db.execute` devuelve `timestamptz` como string; pídelo convertido en SQL. |
| El webhook devuelve **401 a todo** | `VAPI_SERVER_CREDENTIAL_ID` y `VAPI_WEBHOOK_TOKEN` no son de la misma Custom Credential. |
| El coste/latencia se van muy lejos de $0,11/min y 1,610 ms | Algún campo de `transcriber`/`model`/`voice` no se aplicó y VAPI cayó a un default. |
| Error «no se encuentra la voz» al publicar | VoiceId incorrecto o falta conectar la credencial de ElevenLabs en VAPI. |
| Publicar falla justo tras elegir un proveedor poco común | Esa integración necesita su clave en Dashboard → Integrations. |
| El agente responde en español pero **transcribe fatal** | Falta `language: "es"` en el transcriptor. |
| El **CRM se llena de fichas duplicadas** | No se normalizó el teléfono a E.164 antes del *upsert*. |
| **Silencios largos** a mitad de conversación | Faltan los `messages` de tool (`request-start`) en las tools lentas. |
| Las transcripciones no se guardan aunque todo va | Se activó `compliancePlan.hipaaEnabled`. |

---

## Cómo adaptar la plantilla a otro nicho

El esquema, la API y la interfaz son neutrales (negocio, contacto, servicio,
cita). Para cambiar de sector:

1. `lib/nicho.ts`: `TIPO_NEGOCIO` y `DATOS_EXTRA`, y los valores por defecto
   (`DEFAULT_FIRST_MESSAGE`, `DEFAULT_HOURS`, `DEFAULT_SERVICES`, `slugify`).
   El `NICHO` del prompt está solo en la cabecera de este README y en el
   semillero; el motor no lo lee.
2. `lib/vapi/prompt.ts`: el **bloque de ejemplos** del system prompt menciona
   «matrícula y modelo del coche» (propio de talleres). Sustituye los ejemplos
   por los del nuevo nicho (mantén caso feliz, hueco ocupado y fallo de tool).
   Los ejemplos se adaptan SOLOS al modo de reserva (horas o días) al componer.
3. `scripts/seed.ts` (opcional): deja datos de demo propios del nuevo sector.
4. Si el sector reserva **por días** (hoteles, alquileres): en Ajustes del
   Agente pon el Modo de reserva en «Por días» y define la estancia de cada
   servicio (días). El horario semanal marca qué días está abierto, la
   capacidad es el nº de unidades simultáneas por día y los cierres siguen
   aplicando. No hay que tocar código.

No se toca ninguna migración ni el esquema de la base de datos.

---

## Derecho de supresión (RGPD) — dónde vive un número

Un teléfono no está solo en `contacts`: está en `calls.from_number`, en
`call_messages` y en los **payloads crudos de `webhook_events`**. Borrar la ficha
desde la interfaz **no** toca eso (las llamadas sobreviven a propósito, §8.3).

Supresión **completa** de un número: su `contacts` + sus `calls` (la transcripción
cae en cascada) + los `webhook_events` cuyo payload contenga el número. Y
recuerda: **VAPI conserva su propia copia** (registro, transcripción y grabación)
que hay que borrar aparte desde su dashboard o su API.

---

## Versiones realmente instaladas (frente a las del brief)

| Capa | Brief | Instalada | Nota |
|---|---|---|---|
| Next.js | 16.3.x | 16.3.1 | |
| React | 19.2.x | 19.2.8 | |
| TypeScript | 6.0.x | 6.0.3 | Fijado en TS 6 (TS 7 necesita `experimental.useTypeScriptCli` en Next; no se usa). |
| Tailwind | 4.3.x | 4.3.3 | |
| Zod | 4.4.x | 4.4.3 | API de Zod 4 (`z.email()`, `z.uuid()`, `z.iso.datetime()`). |
| Drizzle ORM / Kit | 0.45.x / 0.31.x | 0.45.2 / 0.31.10 | |
| pg | 8.22.x | 8.23.0 | minor no rupturista. |
| Luxon | 3.7.x | 3.7.2 | |
| Recharts | 3.10.x | 3.10.1 | |
| @vapi-ai/server-sdk | 1.2.x | 1.2.0 | Se publica por REST directamente; el SDK queda para futuros usos. |
| libphonenumber-js | 1.13.x | 1.13.11 | |
| bcryptjs | 3.0.x | 3.0.3 | |
| @phosphor-icons/react | 2.1.x | 2.1.10 | |
| ESLint | 9.x | 9.39.5 | Fijado en 9 (eslint-plugin-react aún no es compatible con ESLint 10). |
| Vitest | — | 4.1.10 | Añadido como dependencia de test (el brief no fijaba framework). |

## Desviaciones respecto al brief (§0.1)

- **Context7 no instalado** en este entorno (§0.2). Las versiones y las APIs se
  verificaron contra el **registro público de npm** y el **OpenAPI público de
  VAPI**, documentados en la sección «Verificación del stack».
- **Catálogo de modelos**: el generador encontró **13 transcriptores, 16 LLM y
  19 voces**, coincidiendo con la referencia del brief (13/16/19). Ampliarlo es
  regenerar `lib/vapi/catalog-data.generated.ts` con `pnpm vapi:pull-catalog`.
- **`analysisPlan` aparece marcado `deprecated`** en el OpenAPI actual de VAPI,
  aunque sigue presente y funcional. Se publica con `summaryPlan.enabled: true`
  explícito y se verifica con `GET /assistant/{id}` (§14.1).
- **`pg` 8.23.0** (el brief decía 8.22.x): minor no rupturista; se usa la nueva.
- **`db/init/00-roles.sh`** (no `.sql`) para poder leer `APP_DB_USER` /
  `APP_DB_PASSWORD` del entorno al crear el rol. La imagen oficial de Postgres
  admite `.sh` en `/docker-entrypoint-initdb.d`.
- **Postgres 18** monta el volumen en `/var/lib/postgresql` (no en `/data`),
  porque la imagen 18+ cambió el diseño del directorio de datos.
- **Arrastrar-citar en la agenda**: se implementa como vista semanal por días
  + ficha con cambio de estado y alta por formulario (en vez de DnD sobre
  rejilla). Mismo flujo de acciones de servidor y revalidación de horario.
- El commit inicial **lo hace el usuario** (no el agente): el árbol queda
  limpio y listo; ver «Publicar en GitHub».