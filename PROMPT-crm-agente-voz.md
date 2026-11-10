# Recepcionista telefónico con IA + CRM — plataforma multi‑negocio autoalojada

---

## 🎛️ PARÁMETRO DE NICHO — **cambia solo esta línea**

```
NICHO = "talleres mecánicos y centros de servicio del automóvil"
```

Todo el documento se construye sobre esa variable. Donde leas `{{NICHO}}` sustituye por el valor de arriba.
El esquema de datos, la API y la interfaz son **deliberadamente neutrales** (negocio, contacto, servicio, cita): cambiar de nicho no debe requerir tocar ni una migración, solo los **valores por defecto del semillero** y el **prompt base del agente**, que se derivan de `NICHO`.

**Ajustes secundarios opcionales** (déjalos así salvo que se indique lo contrario):

| Parámetro | Valor |
|---|---|
| Idioma de las llamadas | español de España |
| Zona horaria por defecto | `Europe/Madrid` |
| Stack de modelos | Por defecto fijo y obligatorio (§10.1); editable por negocio desde «Ajustes del Agente» contra el catálogo verificado (§10.4) |
| Moneda | EUR |

---

## 🗺️ Mapa del documento

Diecinueve secciones en cinco bloques. Las secciones se citan entre sí constantemente por número (§10.1, §14.1…): **no las renumeres** al editar este documento.

| Bloque | Secciones | Qué resuelven |
|---|---|---|
| **Método de trabajo** | §0 skills y reglas innegociables · §1 misión · §2 stack con versiones | Cómo se trabaja (las skills mandan sobre el brief, git, `CLAUDE.md`/`AGENTS.md`) y sobre qué se construye. |
| **Cimientos** | §3 Docker de desarrollo · §4 arquitectura multi‑negocio · §5 esquema y RLS · §6 autenticación · §7 seguridad | La base de datos con aislamiento por negocio y la entrada al sistema. |
| **Producto** | §8 CRM · §9 tools del agente · §10 asistente (stack por defecto, prompt, catálogo editable) · §11 rutas y scripts · §12 vistas (guía visual + vistas 0–7) · §13 variables de entorno | Lo que hace la aplicación: la mitad que habla y la mitad que recuerda. |
| **Integración y operación** | §14 notas técnicas de VAPI (payloads y fallos silenciosos) · §15 túnel Tailscale · §16 despliegue Dokploy · §17 repositorio | Cómo se conecta con el mundo real y cómo se despliega. |
| **Cierre** | §18 entregables · §19 criterios de calidad | La lista de control final. |

Orden de lectura recomendado: §0 completo antes de nada; después, en orden. §14 es material de consulta — vuelve a él desde §9/§10 cuando toque implementar cada pieza.

---

## 0. Antes de escribir una sola línea: consulta las skills

En este entorno tienes **skills especializadas instaladas**. Consultarlas no es opcional. Tu conocimiento interno está congelado en una fecha concreta y estas herramientas cambian cada pocas semanas: si programas de memoria, escribirás código que compila pero que llama a endpoints que ya no existen.

### 0.1 Skills de VAPI

Dispones de un **conjunto de skills de VAPI**. **Léelas todas antes de tocar nada relacionado con voz**, aunque las secciones §9, §10 y §14 parezcan describir la integración al detalle. Este documento define **qué** hay que construir; las skills contienen **cómo** se hace exactamente en la versión vigente de la API.

| Skill | Cuándo es obligatoria |
|---|---|
| `setup-api-key` | Antes de configurar credenciales de VAPI. |
| `setup-webhook` | **Antes de escribir una línea del webhook.** Colocación del `server`, prioridad, eventos, autenticación y forma de cada payload. |
| `create-tool` | Antes de declarar las tools de §9: tipos, JSON Schema, `messages` de tool, tools nativas frente a funciones. |
| `create-assistant` | Antes de componer el payload del asistente: modelo, voz, transcriptor, límites y validaciones. |
| `create-phone-number` | Antes de aprovisionar o vincular números. |
| `create-call` | Antes de implementar la llamada saliente del CRM (§8.3). |
| `vapi-prompt-builder` | **Para redactar el system prompt de §10.** No lo improvises: esa skill trae la estructura de secciones, las reglas de voz y el análisis de fronteras de confianza. |

> ⚠️ **Si algo de este documento contradice a las skills de VAPI, gana la skill.** No lo resuelvas en silencio: anótalo en el `README.md`, en una sección final **«Desviaciones respecto al brief»**, con qué decía el brief, qué dice la skill y qué has implementado.

**Regla dura, de la propia skill:** no inventes nombres de modelo, `voiceId`, IDs de tool, IDs de credencial ni formas de proveedor. Si no lo has verificado contra la skill, la API o el dashboard, **no lo escribas**. Trata los errores de validación de la API de VAPI como la fuente de verdad y corrige el payload en lugar de adivinar.

### 0.2 Skill de Context7

Tienes también la skill de **Context7**, que sirve documentación oficial actualizada y versionada de miles de librerías.

Úsala **antes de escribir el primer archivo de cada tecnología del stack**, y siempre que:

- Vayas a fijar una versión en el `package.json`.
- Uses una API que haya cambiado de forma reciente — y en este stack son casi todas: Next.js 16, React 19, Tailwind 4, Zod 4, Drizzle, TypeScript 6.
- Un patrón que tengas memorizado no compile o el linter lo marque como obsoleto.
- Necesites la sintaxis exacta de configuración (`next.config.ts`, flat config de ESLint, `@theme` de Tailwind, `drizzle.config.ts`).

**Reglas de uso combinado:**

1. Las versiones de §2 se verificaron en **agosto de 2026**. Antes de instalar, **contrástalas con Context7**: si hay una versión estable posterior sin cambios de ruptura, usa la nueva y déjalo escrito en el README. Si la posterior sí rompe, quédate en la fijada y explica por qué.
2. **Nunca inventes una firma de función ni un nombre de opción.** Si no lo has verificado con Context7 o con la skill correspondiente, búscalo. Es preferible una consulta de más que un `TypeError` en producción.
3. Deja constancia: en el README, una tabla de **versiones realmente instaladas** frente a las que pedía el brief.

### 0.3 Reglas de trabajo innegociables

Estas cuatro no se negocian, no se optimizan y no se saltan «solo esta vez».

#### 1 · Git: nunca por tu cuenta

**Jamás ejecutes `git add`, `git commit` ni `git push` si el usuario no te lo ha pedido explícitamente en la conversación.** Ni siquiera al terminar una tarea, ni siquiera para un cambio pequeño, ni siquiera con el argumento de «así queda guardado».

- Puedes ejecutar `git init` y crear el `.gitignore`, porque no publican ni congelan nada.
- El **commit inicial también es del usuario**. Deja el árbol de trabajo limpio y listo, dile qué hay preparado y **ofrécete** a commitear. Nada más.
- Tampoco crees repositorios remotos, ni configures `origin`, ni hagas `push` (§17).

Si crees que conviene un commit, dilo en una frase y sigue trabajando.

#### 2 · `CLAUDE.md` al terminar

Cuando la aplicación esté construida, **escribe un `CLAUDE.md` en la raíz** con lo que necesitaría saber otro agente que llegue al repositorio sin contexto. Piensa en lo que produciría un comando de inicialización, pero escrito a mano y bien.

Debe cubrir:

- **Qué es esto**, en dos o tres líneas.
- **Comandos** que se usan de verdad: `docker compose up -d`, `pnpm dev`, `db:migrate`, `db:seed`, `tunnel`, `vapi:tools:sync`, `vapi:sync`, `lint`, `build`, `test`. Con una nota de para qué sirve cada uno y cuál es el orden en un arranque desde cero.
- **Arquitectura y decisiones no evidentes**: que `withTenant()` es la única puerta a los datos de inquilino y por qué; que la disponibilidad tiene una sola fuente de verdad compartida entre agente y panel; el recorrido del webhook; que las tools de VAPI son recursos compartidos por `toolIds`; que el stack de modelos por defecto es fijo (§10.1) y los cambios por negocio pasan por el catálogo generado (§10.4).
- **Reglas duras del repositorio**, con su porqué en media línea: nunca consultar tablas de inquilino fuera de `withTenant`; nunca declarar el teléfono del llamante como parámetro de una tool; nunca inventar identificadores de VAPI (el catálogo de modelos solo crece regenerándolo con `pnpm vapi:pull-catalog`, §10.4); nunca cambiar el stack por defecto de §10.1; nunca pintar un valor interno crudo en pantalla — estados, orígenes, roles y `endedReason` salen siempre de `lib/labels.ts` (§12); nunca ejecutar comandos de git sin que lo pidan.
- **Trampas conocidas**: el `server.url` hay que actualizarlo en el asistente **y** en las tools; los campos del `end-of-call-report` viven en `analysis`/`artifact`; `db.execute` devuelve los `timestamptz` como string, no `Date` (§5); sin `HOSTNAME=0.0.0.0` el contenedor no es alcanzable; sin `dokploy-network` el dominio da 404; los teléfonos se normalizan a E.164 **antes** de tocar la base de datos.
- **Mapa breve de carpetas**: qué vive en `lib/`, `app/`, `db/`, `scripts/`.

Dos cosas que **no** debe tener: el árbol de ficheros volcado, y cualquier cosa que se lea igual de rápido abriendo el código. Un `CLAUDE.md` que repite lo obvio se deja de leer. Apunta a algo denso y corto, del orden de 100–150 líneas.

#### 3 · `AGENTS.md` idéntico y sincronizado

Crea también un **`AGENTS.md` en la raíz con exactamente el mismo contenido** que `CLAUDE.md`, para las herramientas que buscan ese nombre.

- Deben ser **idénticos byte a byte**. No los enlaces con un symlink: en Windows y en Git dan problemas.
- Añade al flujo de integración continua (§17) una comprobación que **falle si divergen** — comparar los hashes de los dos ficheros basta. Sin esa comprobación se desincronizan en la segunda semana, sin excepción.

#### 4 · Mantenerlos vivos

**Cada vez que hagas un cambio importante, actualiza los dos ficheros en la misma tanda de trabajo**, no «más adelante».

Cuenta como cambio importante: una migración o tabla nueva, una variable de entorno nueva o eliminada, un comando de `package.json` nuevo, un cambio en el recorrido del webhook o en las tools, un cambio en el stack de modelos, un cambio en el despliegue, o cualquier trampa nueva que descubras y que costaría media hora volver a descubrir.

La documentación desactualizada es peor que no tenerla, porque se cree.

---

## 1. Misión

Eres un **ingeniero full‑stack sénior**. Vas a entregar una aplicación web lista para producción que actúa como **centralita inteligente + CRM** para {{NICHO}}.

El producto tiene dos mitades que se alimentan la una a la otra:

**La mitad que habla.** Un agente de voz construido sobre VAPI atiende el teléfono del negocio en español. Resuelve las preguntas de siempre (horarios, dirección, precios orientativos, qué servicios se hacen) y, sobre todo, **cierra citas**: consulta huecos reales, reserva, reprograma y anula. Cada llamada queda registrada íntegra con su transcripción y su resumen.

**La mitad que recuerda.** Un CRM donde el negocio ve a sus clientes, su historial de llamadas y sus citas. La pieza clave: **cuando el agente cierra una cita por teléfono, la ficha del contacto se crea sola**. Si el número ya existía, se enriquece en vez de duplicarse. El dueño nunca teclea un contacto que llegó por llamada.

Es una plataforma **multi‑negocio**: cada dueño se registra, entra con sus credenciales y trabaja únicamente sobre los datos de su propio negocio, con aislamiento reforzado a nivel de base de datos. Además, tanto la personalidad del agente como la ficha del negocio se editan desde un panel y se propagan al asistente de VAPI correspondiente.

**No entregues solo la capa visual.** Implementa también las rutas de servidor (webhook de VAPI, sincronización con la API de VAPI, endpoints del CRM), el esquema de base de datos con sus políticas de seguridad a nivel de fila y el entorno Docker. **Código completo, compilable y ejecutable. Nada de pseudocódigo ni de `// TODO: implementar`.**

---

## 2. Stack obligatorio

Versiones verificadas en a fecha de hoy. Contrástalas con Context7 antes de instalar (§0.2).

| Capa | Tecnología | Versión | Notas |
|---|---|---|---|
| Framework | **Next.js** (App Router) | `16.3.x` | Turbopack por defecto. El middleware se llama **`proxy.ts`** (runtime `nodejs`) y `next lint` ya no existe: usa la CLI de ESLint con flat config. |
| Runtime | **Node.js 24 LTS** | `>=20.9` exigido por Next | Usa la LTS activa (24). Node 26 es *Current*, todavía no LTS: no lo uses de base en producción. |
| UI | **React / React DOM** | `19.2.x` | |
| Lenguaje | **TypeScript** en modo estricto | `6.0.x` | TS 6 es la **última rama basada en JavaScript** y la que Next 16 integra sin fricción. TS 7 (compilador nativo en Go) exige `experimental.useTypeScriptCli` en Next: **no lo uses aquí**. Ojo con las deprecaciones de TS 6: `moduleResolution: "node"` → usa `"bundler"`; nada de `baseUrl`, usa solo `paths`. `any` únicamente con comentario que lo justifique. |
| Estilos | **TailwindCSS** | `4.3.x` | Tailwind 4 es **configuración en CSS**: `@import "tailwindcss"` y bloque `@theme` en el CSS global. No generes `tailwind.config.js` salvo que lo necesites de verdad. El plugin de PostCSS es `@tailwindcss/postcss`. |
| Base de datos | **PostgreSQL** en Docker | `18.x` (`postgres:18-alpine`) | Postgres 18 trae **`uuidv7()` nativo**: úsalo como `DEFAULT` de todas las claves primarias en lugar de `gen_random_uuid()`. Los UUIDv7 son ordenables en el tiempo, así que los índices no se fragmentan. |
| Acceso a datos | **Drizzle ORM** sobre `pg` (node‑postgres) | `drizzle-orm 0.45.x`, `pg 8.22.x` | Existe una rama `1.0.0-rc`: **no la uses**, quédate en la estable. Pool único y reutilizado entre *hot reloads*. |
| Herramientas de esquema | **drizzle-kit** | `0.31.x` | Solo para introspección y tipos. Las migraciones las manda el SQL (ver fila siguiente). |
| Migraciones | **SQL plano versionado** en `db/migrations/NNNN_*.sql` | — | Ejecutadas por un runner idempotente propio (`pnpm db:migrate`) con su tabla `schema_migrations`, envueltas en transacción y con bloqueo consultivo (`pg_advisory_lock`) para que dos instancias no migren a la vez. Nada de migraciones generadas y opacas. |
| Autenticación | **Propia**, sin dependencias de terceros | `bcryptjs 3.0.x` | Sesiones opacas en base de datos + cookie `httpOnly`. Detalle en §6. |
| Iconografía | **Phosphor Icons** (`@phosphor-icons/react`) | `2.1.x` | En toda la interfaz, sin mezclar familias. |
| Voz | **VAPI** — SDK de servidor (`@vapi-ai/server-sdk`) | `1.2.x` | **Consulta las skills de VAPI antes de usarlo** (§0.1). La `VAPI_API_KEY` **jamás** llega al navegador. |
| Validación | **Zod** | `4.4.x` | Zod 4 cambió API respecto a la 3: los validadores de formato son funciones de primer nivel (`z.email()`, `z.uuid()`, `z.iso.datetime()`), no métodos encadenados. Verifícalo con Context7 antes de escribir el primer esquema. |
| Teléfonos | **libphonenumber-js** | `1.13.x` | Normalización a E.164. Es la pieza que sostiene el CRM (§8.1). |
| Fechas y zonas horarias | **Luxon** | `3.7.x` | Aritmética de huecos con zona horaria explícita. Nada de `Date` a pelo. |
| Gráficas | **Recharts** | `3.10.x` | Solo en el Panel de control. |
| Linter | **ESLint** con flat config | `9.x` (fijado) | `eslint.config.mjs`. Recuerda: `next lint` fue eliminado. **Quédate en la 9**: `eslint-plugin-react` aún no es compatible con ESLint 10. |
| Gestor de paquetes | **pnpm** | `11.x` | `pnpm install`, `pnpm add`, `pnpm dlx`, `pnpm run`. Fija la versión con el campo `packageManager` del `package.json`. |

> **Sin módulo de cifrado.** La plataforma es dueña de la cuenta de VAPI: hay **una** `VAPI_API_KEY` de servidor y la credencial del webhook vive **en VAPI**, no en nuestra base de datos. Por tanto no hay ningún secreto por negocio que guardar y **no existen** `lib/crypto.ts`, `ENCRYPTION_KEY` ni tabla de credenciales. Si alguna vez hiciera falta que cada negocio traiga su propia cuenta de VAPI, se añade entonces; hoy sería un subsistema entero sin nada que proteger.

El Postgres vive en un contenedor: en local, en la máquina del usuario; en producción, en el VPS (§16).

---

## 3. Entorno Docker (desarrollo)

El proyecto lleva **dos ficheros compose, con responsabilidades separadas**. No los mezcles ni intentes que uno sirva para todo:

| Fichero | Para qué | Qué levanta |
|---|---|---|
| `docker-compose.yml` | **Desarrollo local** | Solo la infraestructura: `db` + `adminer`. La aplicación corre fuera, con `pnpm dev`, para tener recarga en caliente. |
| `docker-compose.dokploy.yml` | **Producción en VPS** (§16) | La aplicación construida + `db`, con red y etiquetas de Traefik. |

### `docker-compose.yml` — desarrollo

- Servicio **`db`**: imagen `postgres:18-alpine`, variables `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` leídas del `.env`, puerto `5432` publicado, volumen nombrado `pgdata` y **`healthcheck`** con `pg_isready` para que el arranque sea determinista.
- Servicio **`adminer`** (imagen `adminer:5`) en el puerto `8080`, para poder enseñar las tablas por pantalla sin instalar clientes.
- Un `db/init/00-roles.sql` montado en `/docker-entrypoint-initdb.d/` que:
  - Cree el rol de aplicación **`app_user`** — sin `SUPERUSER` y **sin `BYPASSRLS`** — con permisos `SELECT/INSERT/UPDATE/DELETE` sobre el esquema.
  - Habilite las extensiones **`unaccent`** y **`pg_trgm`** (las dos hacen falta para el buscador del CRM, §5) y **`btree_gist`** (prevista para la estrategia anti‑solapamiento de §5).
  - No necesitas `pgcrypto`: en Postgres 18 tanto `gen_random_uuid()` como **`uuidv7()`** son funciones del núcleo.

La app se conecta como `app_user` en tiempo de ejecución; las migraciones corren con el rol propietario. Esta separación es lo que hace que el aislamiento de §5 sea real y no decorativo.

> Recuerda que este fichero de desarrollo **no debe** publicar el puerto 5432 al mundo en un servidor. Es exclusivamente para la máquina del usuario.

---

## 4. Arquitectura (multi‑negocio)

1. **El inquilino es el negocio.** Cada usuario pertenece a un negocio a través de una **membresía** con rol (`owner` / `staff`). Todo dato de la aplicación cuelga de `business_id`.
2. Cada negocio tiene **su propio asistente de VAPI** (`vapi_assistant_id`) y **su propio número** (`vapi_phone_number_id`).
3. **Flujo de una llamada entrante:** el cliente marca el número del negocio → VAPI enruta al asistente de ese negocio → el asistente conversa y, cuando detecta intención de agendar, invoca *tools* que apuntan a nuestro Server URL.
4. **Las tools son recursos compartidos, no copias por negocio.** Se crean **una sola vez** en VAPI (`POST /tool`) con nuestro `server.url`, y cada asistente las referencia por `model.toolIds`. Un script idempotente `pnpm vapi:tools:sync` las crea si no existen y las actualiza si cambian, guardando los IDs resultantes. Duplicar siete tools por cada negocio dado de alta sería insostenible y además dispersaría la URL del webhook por cientos de recursos.
5. **El webhook `POST /api/vapi/webhook`** es el corazón del sistema:
   - Verifica la autenticidad de la petición **antes de parsear nada útil** (§7).
   - Resuelve a qué negocio pertenece la llamada a partir del `assistantId` y/o `phoneNumberId` de `message.call`. Si no puede resolverlo, responde `404` y no toca la base de datos.
   - En eventos **`tool-calls`**, recorre `message.toolCallList`, ejecuta cada herramienta contra Postgres y responde con `{ results: [{ toolCallId, result }] }`, usando el `id` de cada tool call como `toolCallId`.
   - En **`end-of-call-report`**, persiste la llamada, su transcripción turno a turno, el resumen, la duración y el coste.
   - En **`status-update`**, actualiza el estado de la llamada en curso.
   - Es **idempotente**: registra cada evento procesado en `webhook_events` y descarta reentregas.
   - **Responde siempre `200` con un JSON**, incluso a eventos que no maneja. Un `500` o un cuerpo vacío en mitad de una llamada deja al agente callado.
6. **La disponibilidad se calcula en casa.** No hay calendario externo. Los huecos salen de: horario semanal del negocio + duración del servicio + citas ya existentes + cierres puntuales + capacidad simultánea (ej.: un taller con 3 elevadores atiende 3 citas a la vez). Toda cita creada a mano desde el panel **bloquea** automáticamente ese hueco para el agente, y viceversa. La sincronización es intrínseca porque hay una sola fuente de verdad.
7. **Al guardar la configuración** en el panel, la app compone `firstMessage` + system prompt (el personalizado del negocio si existe, o el compuesto desde la plantilla §10.3) + `toolIds` + los modelos elegidos en «Ajustes del Agente» (transcriptor, LLM y voz, con el stack §10.1 como respaldo) y los empuja a VAPI vía `assistants.update`, siempre desde el servidor.
8. **Toda cita cerrada por teléfono crea o enriquece un contacto en el CRM** (§8). Es un efecto no negociable de `reservarCita`.

---

## 5. Esquema de base de datos

Migraciones SQL con **Row Level Security activado y forzado** en todas las tablas de negocio.

Dos convenciones que aplican a todo el esquema: los identificadores son `uuid` con `DEFAULT uuidv7()` (función nativa de Postgres 18, ordenable en el tiempo, así que los índices no se fragmentan como con `gen_random_uuid()`), y las marcas de tiempo son siempre `timestamptz`.

### Cómo funciona el aislamiento

Sin Auth gestionado no existe `auth.uid()`. El aislamiento se implementa con **variables de sesión de Postgres**:

- Un helper `lib/db/tenant.ts` expone `withTenant(businessId, fn)`, que abre una transacción, fija el inquilino con `set_config('app.business_id', $1, true)` — **parametrizado**; `SET LOCAL` no admite parámetros y concatenar el valor sería inyectable — y corre dentro las consultas del usuario.
- Cada política RLS compara contra `current_setting('app.business_id', true)::uuid`.
- Todas las tablas llevan `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` **y** `FORCE ROW LEVEL SECURITY`, para que la protección aplique incluso al propietario.
- **Ninguna consulta de la aplicación se ejecuta fuera de `withTenant`**, salvo las de autenticación y las del webhook, que usan un camino explícito y auditado.

Documenta este mecanismo con un comentario de cabecera en la migración. Es el corazón de la seguridad del producto.

> ⚠️ **Drizzle: `db.execute` devuelve los valores de pg sin convertir.** Un `timestamptz` llega como **string**, no como `Date` — la conversión a `Date` la hace solo el select tipado sobre el esquema. Meter ese string en `DateTime.fromJSDate()` produce una fecha inválida que revienta la siguiente consulta parametrizada sin señalar al culpable. En SQL crudo, pide el dato ya convertido (`::int`, `to_char(…)`) o parsea el string a conciencia.

### Tablas

| Tabla | Contenido |
|---|---|
| `businesses` | Inquilino. `id`, `name`, `slug` (único), `timezone` (def. `Europe/Madrid`), `phone`, `email`, `website`, `address`, `created_at`, `updated_at`. Los datos de contacto se editan en «Ajustes del Agente» y alimentan el prompt (§10.3): el agente puede recitarlos. |
| `users` | `id`, `email` (único, normalizado a minúsculas), `password_hash`, `full_name`, `created_at`. |
| `memberships` | `user_id`, `business_id`, `role` (`owner` \| `staff`), PK compuesta. |
| `sessions` | `id`, `user_id`, `token_hash` (SHA‑256 del token opaco), `expires_at`, `user_agent`, `ip`, `created_at`. |
| `voice_agents` | 1:1 con el negocio. `business_id` (PK), `system_prompt` (lo último publicado), **`system_prompt_override`** (nullable — NULL = prompt automático recompuesto en cada publicación desde §10.3; con texto = prompt personalizado que se publica TAL CUAL, congelado), `first_message`, `tone` (def. «cercano y resolutivo»), `voice_provider`, `voice_id`, **`voice_model`** (motor TTS, p. ej. `eleven_turbo_v2_5`; NULL = el del proveedor por defecto o proveedor sin motor), **`voice_language`** (nullable — solo proveedores de voz cuyo esquema lleva idioma: vapi, cartesia, playht…), `language`, `model` (jsonb `{provider, model}`), `transcriber` (jsonb `{provider, model?, language?}` — sin `model` en proveedores que no lo exponen, como AssemblyAI o Azure), `handoff_number`, `handoff_message`, `slot_capacity` (int, def. 1), `min_notice_minutes`, `booking_horizon_days`, `vapi_assistant_id`, `vapi_phone_number_id`, `published_at`, `updated_at`. |
| `business_facts` | FAQ y datos que el agente recita. `id`, `business_id`, `question`, `answer`, `sort_order`. **Tabla real, no un jsonb**, para poder editarla fila a fila en el panel. |
| `services` | `id`, `business_id`, `name`, `duration_minutes`, `price_cents` (nullable), `description`, `is_active`, `sort_order`. |
| `business_hours` | `business_id`, `weekday` (0–6), `opens_at` (time), `closes_at` (time), `is_closed` (bool). Permite varios tramos por día (partido de mediodía). |
| `closures` | Cierres puntuales: `id`, `business_id`, `starts_at`, `ends_at`, `reason`. |
| `contacts` | **CRM.** `id`, `business_id`, `full_name`, `phone` (normalizado E.164), `email`, `company`, `notes`, `tags` (text[]), `status` (`lead` \| `cliente` \| `inactivo`, def. `lead`), `source` (`agente_voz` \| `manual` \| `importado`, def. `manual`), `custom_fields` (jsonb — aquí caben matrícula y modelo sin tocar el esquema), `outbound_consent` (bool, def. `false` — la casilla de consentimiento RGPD/LSSI que habilita las llamadas salientes, §14.4), `last_contacted_at`, `created_at`, `updated_at`. **Único parcial** sobre `(business_id, phone)` cuando `phone` no es nulo: es lo que hace que el agente no duplique fichas. |
| `contact_notes` | `id`, `business_id`, `contact_id`, `body`, `author_user_id` (nullable — nulo cuando lo escribe el agente), `created_at`. |
| `calls` | `id`, `business_id`, `contact_id` (nullable, `ON DELETE SET NULL` — §8.3), `vapi_call_id` (único), `direction` (`inbound` \| `outbound`), `from_number`, `started_at`, `ended_at`, `duration_seconds`, `status`, `ended_reason`, `summary`, `cost_cents` (**céntimos de USD** — VAPI factura en dólares; la UI lo etiqueta con $ aunque los precios de servicios sigan en €), `recording_url`, `needs_review` (bool — marcada para revisión, p. ej. handoff sin número configurado, §9.2), `created_at`. **`status` usa los seis estados reales de VAPI**: `scheduled`, `queued`, `ringing`, `in-progress`, `forwarding`, `ended` — la referencia de eventos de la skill documenta seis, no cuatro. No inventes los tuyos: llegan tal cual en `status-update`. |
| `call_messages` | Transcripción turno a turno: `id`, `business_id`, `call_id`, `role` (`assistant` \| `user` \| `system` \| `tool`), `content`, `seconds_from_start`, `sort_order`. **Estos son NUESTROS roles, no los de VAPI**: hay que traducirlos (`bot` → `assistant`) y **no guardar el mensaje `system`**, que es el prompt entero. Ver §14.1. |
| `appointments` | `id`, `business_id`, `contact_id` (FK nullable, `ON DELETE SET NULL` — §8.3), `call_id` (FK, nullable), `service_id` (FK, nullable), `service_name` (desnormalizado, por si el servicio se borra), `starts_at` (timestamptz), `ends_at`, `status` (`agendada` \| `confirmada` \| `completada` \| `anulada` \| `no_show`, def. `agendada`), `notes`, `created_via` (`agente_voz` \| `panel`), `created_at`, `updated_at`. |
| `webhook_events` | Idempotencia y auditoría: `id`, `business_id` (nullable), `provider` (`vapi`), `event_type`, `external_id` (único), `payload` (jsonb), `processed_at`, `error`. |
| `vapi_tools` | IDs de las tools compartidas creadas en VAPI (§4.4): `name` (PK), `vapi_tool_id`, `checksum` de la definición, `synced_at`. Sin `business_id`: es infraestructura de la plataforma, no de un inquilino, así que queda fuera de RLS. |

### Índices y restricciones que debes crear

- `UNIQUE (business_id, phone) WHERE phone IS NOT NULL` en `contacts`.
- **Anti‑solapamiento en `appointments` — decisión tomada: la vía transaccional, sin `EXCLUDE`.** Una restricción `EXCLUDE USING gist` sobre `tstzrange(starts_at, ends_at)` + `business_id` filtrada por `status <> 'anulada'` solo puede modelar capacidad 1, y `slot_capacity` es por negocio y puede ser mayor. Implementa en `lib/scheduling/booking.ts`, todo dentro de la transacción de `withTenant`: (1) `pg_advisory_xact_lock(hashtextextended(business_id::text, 0))` para serializar las reservas del negocio — un `SELECT … FOR UPDATE` solo no basta: dos inserciones simultáneas en un hueco vacío no se ven entre sí —, (2) recuento de citas solapadas no anuladas frente a `slot_capacity`, (3) revalidación de horario/cierres/antelación con la misma librería que usa el agente. `btree_gist` queda instalada por si un despliegue con capacidad fija 1 quiere añadir la `EXCLUDE` como cinturón extra; documenta la estrategia con un comentario en la migración.
- Índices por `(business_id, starts_at)` en `appointments`, `(business_id, started_at DESC)` en `calls`, y para el buscador del CRM un **GIN de trigramas sobre el nombre sin acentos**: `USING gin (f_unaccent(full_name) gin_trgm_ops)`. Ojo con la forma: un GIN «a secas» sobre `text` no existe (hace falta `gin_trgm_ops`, de `pg_trgm`), y `unaccent()` no es `IMMUTABLE`, así que el índice necesita un **wrapper `f_unaccent()` IMMUTABLE** (la forma de dos argumentos, con el diccionario explícito).
- `ON DELETE CASCADE` coherente en todo lo que cuelga de `businesses`.

### Automatismos

- Función `set_updated_at()` + trigger en toda tabla con `updated_at`.
- Función `slugify_business_name()` que garantice slug único al registrarse.
- **Registro atómico**: al crear una cuenta, una única transacción crea el `business`, el `user`, la `membership` con rol `owner`, el `voice_agent` con valores por defecto de {{NICHO}}, el horario semanal estándar y un catálogo inicial de servicios propios de {{NICHO}}. Si algo falla, no queda un negocio a medias.
- **Script de semillero** (`pnpm db:seed`) que deje un negocio de demostración con contactos, llamadas y citas de ejemplo, para poder abrir la app y que no esté vacía. Datos concretos: negocio **«Agente Taller»**, usuario **Josema Fernández** (`demo@taller.es` / `demo1234`). Idempotente: si el usuario ya existe, no hace nada. Documenta esas credenciales en el README, y recuerda que el nombre del negocio acaba siendo el `name` del asistente en VAPI y aparece en su mensaje de bienvenida.

---

## 6. Autenticación propia

- **Registro:** email + contraseña + nombre del negocio. Contraseña con `bcryptjs` (coste 12). Email normalizado y único.
- **Sesión:** token opaco de 32 bytes aleatorios en base64url. En base de datos se guarda **solo su SHA‑256**; el token viaje únicamente en la cookie. Cookie `httpOnly`, `secure` en producción, `sameSite=lax`, `path=/`, caducidad de 30 días con renovación deslizante.
- **Cierre de sesión:** borra la fila de `sessions`. Las sesiones son revocables de verdad, que es la ventaja de no usar JWT aquí.
- **Protección de rutas:** `proxy.ts` (el middleware renombrado en Next 16). La función exportada debe llamarse **`proxy`**, no `middleware`, y las opciones renombradas siguen el mismo patrón (`skipMiddlewareUrlNormalize` → `skipProxyUrlNormalize`). Comprueba la **presencia** de la cookie y redirige a `/login` si falta. La **validación real** contra base de datos ocurre en un helper `requireSession()` que se invoca en el layout del área privada y en cada Server Action. No confíes la seguridad al proxy.
- **Rate limiting** en `/login` y `/signup`: máximo de intentos por IP y por email en ventana deslizante, en memoria con `Map` (documenta que en despliegue multi‑instancia esto debe moverse a Postgres o Redis).

---

## 7. Seguridad

- La `VAPI_API_KEY` y la `DATABASE_URL` **solo existen en el servidor**. Ninguna variable sensible lleva el prefijo `NEXT_PUBLIC_`.
- **Autenticidad del webhook.** VAPI ya no lleva un secreto en línea: la autenticación se configura con una **Custom Credential** creada en su dashboard y referenciada por `credentialId` dentro del objeto `server`. VAPI inyecta entonces la cabecera que corresponda a esa credencial. Para este proyecto usa una credencial de tipo **Bearer Token**:
  - En el servidor, extrae el token de `Authorization: Bearer <token>` y compáralo con `VAPI_WEBHOOK_TOKEN` mediante `crypto.timingSafeEqual` sobre buffers de la misma longitud (nunca `===`, y nunca compares longitudes distintas sin normalizar antes con un hash).
  - Si no valida, responde `401` **sin** tocar la base de datos y sin revelar por qué.
  - **No implementes verificación HMAC con `x-vapi-signature`.** En el modelo de credenciales, el nombre de cabecera, el algoritmo y el formato del payload son configurables, así que dar por sentado un formato fijo produce código que valida mal o rechaza peticiones legítimas. Si el usuario prefiere HMAC, léelo primero en la skill `setup-webhook`.
  - Consulta esa skill **antes** de escribir esta parte: es la que más ha cambiado.
- **Frontera de confianza en las tools.** Lo que dicta el llamante por voz es un dato **no verificado**; lo que viene en el payload de la llamada es un dato **de servidor**. El número del llamante se toma **siempre** de `message.call.customer.number` y el negocio **siempre** del `assistantId`/`phoneNumberId`. Ninguno de los dos puede ser un parámetro que rellene el modelo (§9).
- Toda entrada del usuario y del webhook pasa por un esquema Zod antes de llegar a la base de datos.
- **Derecho de supresión (RGPD): saber dónde vive un número.** Un teléfono no está solo en `contacts`: está en `calls.from_number`, en la transcripción (`call_messages`) y —lo que siempre se olvida— en los **payloads crudos de `webhook_events`**, que guardan el informe de fin de llamada entero con número y transcripción tal como llegaron de VAPI. Borrar la ficha desde la interfaz no toca nada de eso (las llamadas sobreviven a propósito, §8.3). La supresión completa de un número es: su contacto + sus llamadas (la transcripción cae en cascada) + los `webhook_events` cuyo payload contenga el número. Documenta este procedimiento en el README, junto con el recordatorio de que **VAPI conserva su propia copia** (registro de llamada, transcripción y grabación) que hay que borrar aparte desde su dashboard o su API.
- Consultas parametrizadas siempre (Drizzle lo hace; si escribes SQL crudo, usa placeholders).
- Cabeceras de seguridad en `next.config.ts`: `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`.
- **Aislamiento estricto:** ninguna consulta debe poder devolver datos de otro negocio. Añade un test de integración que lo demuestre: dos negocios con datos, y verificar que el contexto del negocio A devuelve cero filas del B.

---

## 8. El CRM de contactos

Esta es la pieza nueva y central. Debe funcionar en las dos direcciones.

### 8.1 Alta automática desde una llamada

Cuando el webhook procesa `reservarCita` (o cuando llega `end-of-call-report` con datos de cliente):

1. **Normaliza el teléfono** a E.164 con prefijo del país del negocio (`lib/phone.ts`). Este paso es imprescindible: sin él, `600 123 456`, `+34600123456` y `0034600123456` crean tres fichas distintas.
2. **Upsert por `(business_id, phone)`**:
   - Si no existe → crea el contacto con `source = 'agente_voz'` y `status = 'lead'`.
   - Si existe → **no sobrescribe** lo que ya hay. Solo rellena los campos vacíos con lo nuevo (nombre, email), añade lo que venga en `custom_fields` y actualiza `last_contacted_at`.
3. **Vincula** la llamada (`calls.contact_id`) y la cita (`appointments.contact_id`) a esa ficha.
4. Deja una **nota automática** en `contact_notes` del estilo «Cita de {servicio} agendada por el agente de voz el {fecha}», con `author_user_id` nulo para distinguirla de las escritas por una persona.
5. Si el contacto tenía `status = 'lead'` y la cita se completa, promociónalo a `cliente`.

### 8.2 Reconocimiento del cliente que llama

El agente debe poder saludar por el nombre a quien ya está en la base de datos y no volver a pedirle datos que ya tenemos. La vía es la tool **`identificarLlamante`** (§9.2), que el agente invoca al principio de la conversación: **no lleva parámetros**, y el webhook resuelve el número desde `message.call.customer.number`.

Implementa **solo** ese camino. Existe además el evento `assistant-request`, que permite devolver una configuración de asistente distinta para cada llamada entrante y sería otra forma de personalizar el saludo, pero obliga a componer el asistente completo en cada llamada y a tenerlo respondiendo en milisegundos: mucho más frágil, y aquí no compensa. Si el agente que lo implemente prefiere esa vía, que lo justifique en el README.

Cuando el número no está en el CRM, la tool devuelve un resultado que el agente sepa manejar («no consta»), nunca un error.

### 8.3 Interfaz del CRM

**Listado** — tabla paginada del lado del servidor con:
- Buscador por nombre, teléfono o email (insensible a acentos y mayúsculas, vía `unaccent`), con *debounce*.
- Filtros por `status`, por `source` y por etiquetas.
- Orden por nombre, fecha de creación o último contacto.
- Columnas: nombre, teléfono, estado, origen, nº de citas, último contacto.
- Acciones rápidas por fila: ver, editar, eliminar.

**Alta y edición** — formulario en panel lateral (*drawer*) con validación Zod compartida entre cliente y servidor. El teléfono se normaliza al guardar y avisa si ya existe otra ficha con ese número.

**Ficha de detalle** — la vista más importante del CRM. Contiene:
- Datos de contacto y etiquetas editables en línea.
- **Cronología unificada** en orden inverso mezclando llamadas, citas y notas, con icono distinto por tipo.
- Sus citas: próximas y pasadas, con enlace al calendario.
- Sus llamadas, con acceso directo a la transcripción.
- Caja para añadir una nota manual.
- Botón **«Llamar con el agente»** que lanza una llamada saliente vía `calls.create` de VAPI usando el asistente del negocio (recordatorio de cita, seguimiento…). Es la vuelta completa: el CRM también origina conversaciones.

**Eliminación** — diálogo de confirmación que avisa explícitamente de qué se pierde. Decisión tomada (impleméntala así): las llamadas y citas del contacto **sobreviven** con `contact_id` a NULL — el historial del negocio no desaparece por borrar una ficha — y las notas de la ficha caen en cascada; el diálogo lo declara con esas palabras. Y que quede claro en la documentación: borrar la ficha **no** equivale a la supresión RGPD completa del número — ese procedimiento (llamadas, transcripciones y `webhook_events` incluidos) es el de §7.

---

## 9. Herramientas del agente de voz

Lee la skill `create-tool` antes de esta sección.

### 9.1 Regla de oro: qué puede rellenar el modelo y qué no

**El número de teléfono del llamante NUNCA es un parámetro de la tool.** Es un dato de servidor que viaja en `message.call.customer.number`, y el webhook lo lee de ahí. Si lo declaras como parámetro, el modelo lo rellena con lo que oiga, y entonces cualquiera que llame puede decir un número ajeno y **anular la cita de otra persona**. Lo mismo vale para el identificador del negocio: sale del `assistantId`/`phoneNumberId`, jamás de la conversación.

Como norma: **todo lo que deba ser verificado o no pueda falsificarse sale del payload; solo lo que el cliente elige libremente (servicio, fecha, nombre, notas) es un parámetro.**

Nombres de tool en ASCII, sin acentos ni `ñ`, para no chocar con el patrón que exige el esquema de funciones.

### 9.2 Tools de tipo `function` (resuelven contra nuestro webhook)

| Tool | Parámetros que rellena el modelo | Datos que el webhook toma del payload | Comportamiento |
|---|---|---|---|
| **`identificarLlamante`** | *(ninguno)* | número del llamante, negocio | Busca la ficha en el CRM. Devuelve nombre, si es recurrente y su próxima cita. Permite saludar por el nombre. |
| **`consultarHuecos`** | `servicio` (opcional), `fechaPreferida` (ISO 8601, opcional), `franja` (`manana` \| `tarde` \| `cualquiera`, opcional), `diasVista` (1–30, def. 7) | negocio | Calcula disponibilidad real: horario semanal, duración del servicio, capacidad simultánea, citas existentes, cierres y antelación mínima. Devuelve hasta **3 opciones**, cada una con `iso` (técnico) y `texto` (hablable: «el jueves 14 a las once y media»). |
| **`reservarCita`** | `inicioIso`, `servicio`, `nombre`, `email` (opcional), `notas` (opcional), `datosExtra` (objeto libre, opcional) | número del llamante, negocio, `callId` | En **una sola transacción**: revalida el hueco, crea o enriquece el contacto (§8.1), inserta la cita y devuelve confirmación hablable. Idempotente. Si el hueco se ocupó entre medias, **devuelve alternativas** en lugar de un error. |
| **`reprogramarCita`** | `nuevoInicioIso`, `citaId` (opcional) | número del llamante, negocio | Localiza la próxima cita **de ese número**, valida el nuevo hueco y la mueve. Conserva el histórico en las notas. |
| **`anularCita`** | `citaId` (opcional), `motivo` (opcional) | número del llamante, negocio | Marca `status = 'anulada'` **solo sobre citas de ese número**, libera el hueco y registra el motivo. |
| **`datosDelNegocio`** | `tema` (opcional) | negocio | Dirección, horarios, servicios con duración y precio orientativo, y entradas de `business_facts`. Alimenta las preguntas frecuentes. |
| **`registrarHandoff`** | `motivo` | negocio, `callId` | Solo **anota** que hizo falta una persona, para que salga en el panel. La transferencia en sí no es esto (ver 9.3). |

Si el negocio no tiene número de derivación configurado, `registrarHandoff` debe además dejar una nota en el contacto y marcar la llamada para revisión: es un aviso comercial, no un error.

### 9.3 Tools nativas de VAPI (no las implementes tú)

Estas **no** pasan por nuestro webhook. Son tipos de tool que VAPI ejecuta por su cuenta, y hay que declararlas como tales:

- **`transferCall`** con `destinations: [{ type: "number", number, message, description }]`, apuntando al `handoff_number` del negocio. Escribir una función propia para transferir no funciona: el corte de llamada lo tiene que hacer la plataforma.
- **`endCall`**, para que el agente pueda colgar limpiamente cuando la conversación termina, en lugar de quedarse en un silencio hasta el `maxDurationSeconds`.

Ambas necesitan una `description` explícita que diga **cuándo** usarlas y **cuándo no**.

### 9.4 Formato de respuesta

VAPI envía las invocaciones en `message.toolCallList`. La respuesta debe emparejar cada resultado con el `id` recibido:

```json
{ "results": [ { "toolCallId": "<el id de la tool call>", "result": "<texto que el agente verbalizará>" } ] }
```

> 🚨 **El nombre de la tool NO viene suelto: viene dentro de `function`.** Este es el error más caro de todo el documento porque no rompe nada visiblemente.
>
> El esquema real (`ToolCall` del OpenAPI de VAPI, `required: id, type, function`) es:
>
> ```jsonc
> {
>   "id": "call_mlQ2OK3KlvhB1uKMuxOMQKms",
>   "type": "function",
>   "function": {
>     "name": "consultar_huecos",
>     "arguments": "{\"servicio\":\"cambio de aceite\"}"   // ← string JSON, NO objeto
>   }
> }
> ```
>
> Muchos ejemplos de la documentación enseñan la forma plana `{ id, name, parameters }`. **Acepta las dos**, con una función de extracción única:
>
> ```ts
> const name = tc.function?.name ?? tc.name ?? null;
> let args = tc.function?.arguments ?? tc.parameters ?? tc.arguments ?? {};
> if (typeof args === 'string') args = JSON.parse(args);   // VAPI los manda serializados
> ```
>
> **Por qué importa tanto:** si solo lees `toolCall.name`, en una llamada real es `undefined`. Si tu bucle hace `if (!toolCall.name) continue`, se salta TODAS las invocaciones y devuelves `200 OK` con `{"results": []}`. No hay error, no hay traza, no hay fila en tu tabla de eventos. VAPI registra *«No result returned for call_…»* y el agente dice **«ahora mismo no puedo consultar la agenda»**. Parece un fallo de base de datos y no lo es.
>
> Escribe un test con el formato REAL (`function.name` + `arguments` como string), no solo con el plano de los ejemplos: es lo único que detecta esto antes de una llamada de verdad.

### 9.5 Relleno de silencios: `messages` de tool

Consultar huecos contra Postgres tarda cientos de milisegundos, y por teléfono ese silencio es eterno. Cada tool lenta debe declarar sus `messages`:

```json
"messages": [
  { "type": "request-start",            "content": "Déjame mirar la agenda un segundo." },
  { "type": "request-failed",           "content": "Ahora mismo no puedo consultar la agenda. ¿Te llamamos nosotros?" },
  { "type": "request-response-delayed", "content": "Sigo mirando, un momento.", "timingMilliseconds": 3000 }
]
```

Es el detalle que separa un agente que parece vivo de uno que parece colgado. Aplícalo como mínimo a `consultarHuecos`, `reservarCita`, `reprogramarCita` y `anularCita`.

### 9.6 Reglas de implementación

- El `result` va **redactado para leerse en voz alta**. Nada de objetos crudos ni de ISO 8601 sin traducir: fechas y horas en español natural.
- El `result` debe ser **corto y solo con los campos que el modelo necesita**. Un volcado de la fila entera invita al agente a recitar datos internos.
- Cada tool valida sus argumentos con Zod. Si llegan mal, devuelve un `result` que el agente pueda decir («No he entendido la fecha, ¿me la repites?»), **nunca una traza de error**.
- La `description` de cada tool dice cuándo llamarla, cuándo no y en qué formato van los parámetros. Ese texto lo lee el modelo en cada turno: es parte del producto, no documentación.
- Presupuesto de tiempo: si una consulta se pasa de lo razonable, devuelve algo verbalizable antes de que VAPI corte por su propio timeout.

---

## 10. Configuración del asistente en VAPI

Lee la skill `create-assistant` antes de componer el payload, y `vapi-prompt-builder` antes de redactar el system prompt. Los valores de abajo son el punto de partida; **la skill y la respuesta de validación de la API mandan sobre este documento**.

### 10.1 Stack de modelos por defecto — obligatorio como punto de partida

**Estos tres modelos son requisito, no sugerencia.** Todo asistente que cree la aplicación —el que se genera al registrarse un negocio— sale con esta combinación, y es el respaldo cuando el negocio no ha elegido nada. No la sustituyas por «defaults seguros» ni por lo que venga de fábrica en ningún ejemplo. (El negocio puede después cambiar cada pieza desde «Ajustes del Agente» contra el catálogo verificado de §10.4.)

| Pieza | Proveedor | Modelo | Referencia observada |
|---|---|---|---|
| **Transcriptor** | Deepgram | **Nova 3 General**, idioma español | 320 ms · $0,01/min · 2,7 % WER |
| **Modelo** | OpenAI | **GPT 5.6 Luna** | 800 ms · $0,01/min · inteligencia 27 |
| **Voz** | ElevenLabs (`11labs` en VAPI) | `voiceId` **`UOIqAnmS11Reiei1Ytkc`** (aparece como «burt» en el panel), modelo **Eleven Turbo v2.5** | 490 ms · $0,036/min · naturalidad 74 |

Presupuesto de referencia de la combinación: **≈ $0,11/min y ≈ 1.610 ms de latencia**. Úsalo como comprobación de cordura: si tras publicar el asistente el panel de VAPI enseña cifras muy distintas, es que algún campo no se aplicó y cayó a un valor por defecto.

Forma aproximada del payload:

```jsonc
"transcriber": { "provider": "deepgram", "model": "nova-3-general", "language": "es" },
"model":       { "provider": "openai",   "model": "<id exacto de GPT 5.6 Luna>", "toolIds": [...],
                 "messages": [{ "role": "system", "content": "<prompt compuesto>" }] },
"voice":       { "provider": "11labs",   "voiceId": "UOIqAnmS11Reiei1Ytkc", "model": "eleven_turbo_v2_5" }
```

El `voiceId` de la voz **es ese identificador literal de ElevenLabs**, no la etiqueta «burt» que enseña el panel de VAPI. Ponlo tal cual, sin traducirlo a un nombre. En NUESTRA interfaz esa voz por defecto se presenta con la marca **«Carolina»** (primera opción, recomendada, del selector de voces de ElevenLabs): el usuario ve «Carolina», la base de datos y VAPI ven el id literal.

> ⚠️ **Los identificadores de API no siempre coinciden con lo que muestra el panel** — la voz es justo el ejemplo. «Nova 3 General» y «GPT 5.6 Luna» son también nombres de interfaz. **No los transcribas a ojo.** Antes de escribir el código:
> 1. Configura una vez el asistente a mano en el dashboard de VAPI con exactamente estos tres modelos.
> 2. Haz `GET /assistant/{id}` y **copia literalmente** los valores de `transcriber`, `model` y `voice` que devuelva.
> 3. Fíjalos en `lib/vapi/defaults.ts` como constantes tipadas, con un comentario que diga de dónde salieron y en qué fecha.
>
> Es la única forma de no inventarse un identificador, que es exactamente lo que prohíbe la skill `create-assistant`. Si por lo que sea no puedes hacer esa comprobación, **déjalo escrito en el README** en lugar de adivinar.

También verifica si la voz de ElevenLabs requiere conectar una credencial propia en la cuenta de VAPI. Si al publicar aparece un error del tipo «no se encuentra la voz», es eso: no es un fallo del código.

### 10.2 Resto del payload

| Campo | Valor | Advertencia |
|---|---|---|
| `name` | `{nombre del negocio}` | **Máximo 40 caracteres**, lo impone la API. `«Taller Ruiz — Asistente virtual»` ya se pasa. |
| `model.toolIds` | IDs de las tools compartidas | Se enganchan por **`toolIds`**, no en línea (§4.4). |
| `firstMessage` | Editable por negocio. Para {{NICHO}}: «Taller Ruiz, buenas. Soy el asistente virtual, ¿en qué te puedo ayudar?» | |
| `server` | `{ url: "<APP_URL>/api/vapi/webhook", credentialId: <VAPI_SERVER_CREDENTIAL_ID> }` | **Es un objeto `server`, no los campos sueltos `serverUrl` / `serverUrlSecret`**, que ya no existen (§7). |
| `serverMessages` | Al menos `tool-calls`, `end-of-call-report` y `status-update` | |
| `endCallMessage`, `maxDurationSeconds` | Configurables | Sin `maxDurationSeconds`, una llamada colgada consume saldo hasta que alguien lo note. |
| `compliancePlan.hipaaEnabled` | **`false` / ausente** | Es de pago y **desactiva el almacenamiento de grabaciones y transcripciones**, que es justo lo que este producto necesita guardar. |

En **«Ajustes del Agente»** el usuario puede cambiar transcriptor, modelo de IA y voz completos (§10.4 y §12 · vista 5), pero el formulario arranca **siempre** con este stack y muestra el coste y la latencia estimados de lo que tenga seleccionado, para que se vea el impacto antes de guardar.

**Prioridad del Server URL en VAPI:** tool > asistente > número > organización. Como nuestras tools son recursos compartidos con su propio `server.url`, ese es el que gana para las tool calls; el `server` del asistente es el que recibe `end-of-call-report` y `status-update`. Configura **los dos** apuntando a la misma ruta.

### 10.3 System prompt — plantilla exacta

Esta es la plantilla que compone `lib/vapi/prompt.ts` y que viaja en `model.messages[0].content`. **Impleméntala tal cual**, no una versión resumida.

Los `[corchetes]` son huecos que se rellenan **en tiempo de ejecución** desde la configuración del negocio. Lo único que se resuelve al escribir el código es el sustantivo del nicho: para `NICHO = "talleres mecánicos"`, `[TIPO_NEGOCIO]` es «taller mecánico» y `[DATOS_EXTRA]` es «matrícula y marca y modelo del vehículo». **Cambiar de nicho es cambiar esas dos constantes**, nada más.

```text
# Identidad
Eres el asistente virtual de [NOMBRE_NEGOCIO], un [TIPO_NEGOCIO] en [CIUDAD].
Coges el teléfono cuando el equipo está trabajando y no puede atenderlo.
Tu único objetivo es resolver la llamada: informar o cerrar una cita.

# Cómo hablas
- Español de España. Tono: [TONO]. Cercano y resolutivo, nunca ceremonioso.
- Una o dos frases por turno. Jamás sueltes un párrafo.
- Una sola pregunta cada vez, y espera la respuesta antes de seguir.
- Hablas, no escribes. Nada de listas, viñetas, guiones ni símbolos.
- Di las cosas como se dicen: "el jueves catorce a las diez y media", "cuarenta
  y cinco euros", "una hora y media". Las matrículas, letra por letra.
- Si te interrumpen, para de hablar y escucha.
- Si no entiendes algo, pide que te lo repitan. No adivines.

# Lo que sabes
Hoy es [FECHA_HOY] y son las [HORA_AHORA] en [ZONA_HORARIA].
Dirección: [DIRECCION]
[DATOS_CONTACTO]
Horario: [HORARIO_SEMANAL]
Servicios que se hacen aquí, con su duración y precio orientativo:
[CATALOGO_SERVICIOS]
Otra información del negocio:
[PREGUNTAS_FRECUENTES]

# Reglas que no puedes saltarte
- No inventes precios, plazos, servicios ni disponibilidad. Si algo no está
  arriba, di que no lo sabes y ofrece que te devuelvan la llamada.
- No confirmes ninguna hora sin haberla comprobado antes con la agenda.
- Ya sabes desde qué número llaman. No lo pidas. Solo pide un teléfono si el
  cliente quiere dar otro distinto para el aviso.
- Nunca pidas datos bancarios, de tarjeta ni de pago. Si insisten, deriva.
- No des información de otros clientes ni de otras citas.
- Si te piden algo que no tiene que ver con [TIPO_NEGOCIO], reconduce con
  amabilidad en una frase.

# Cómo llevas la llamada
1. Al empezar, comprueba si quien llama ya está fichado. Si lo está, salúdale
   por su nombre y no vuelvas a pedirle lo que ya tienes.
2. Averigua para qué llama. Si es una duda, respóndela y ofrece cita.
3. Si quiere cita, necesitas tres cosas: qué servicio, cuándo le viene bien y
   [DATOS_EXTRA]. Pregúntalas de una en una.
4. Consulta la agenda y ofrécele como mucho dos opciones. Más opciones por
   teléfono confunden.
5. Cuando elija, repite en voz alta servicio, día, hora y [DATOS_EXTRA], y
   pide confirmación explícita.
6. Solo entonces reserva.
7. Confirma que está hecho, di si hay que traer algo y despídete.

# Herramientas
- Antes de proponer cualquier hora, consulta la disponibilidad. Siempre.
- Reserva solo después de que el cliente haya dicho que sí a una hora concreta.
- Para cambiar o anular una cita, usa la herramienta correspondiente; nunca
  digas que está hecho sin haberla llamado.
- Si te preguntan por dirección, horarios, precios o servicios y no lo tienes
  arriba, consulta la información del negocio antes de responder.
- Mientras esperas una herramienta, di algo breve para no dejar silencio.

# Cuando algo va mal
- Si el hueco que quería ya no está libre: dilo sin dramatizar y ofrece las
  alternativas que te devuelva la agenda.
- Si una herramienta falla: "Ahora mismo no puedo entrar en la agenda. ¿Te
  parece que te llamemos nosotros en cuanto podamos?" Y recoge el motivo.
- Si no entiendes al cliente dos veces seguidas, ofrece pasarle con una persona.
- Nunca leas un error técnico en voz alta.

# Cuándo pasar con una persona
Pasa la llamada si: lo pide, está enfadado, es una avería urgente o en
carretera, hay una reclamación, o el asunto se sale de lo que sabes hacer.
Antes de transferir, di qué vas a hacer. Si no hay nadie disponible, toma nota
del motivo y promete que le devolverán la llamada.

# Ejemplos

Cliente: Hola, quería una cita para cambiar el aceite.
Tú: Claro. El cambio de aceite nos lleva una hora. ¿Qué día te viene bien?
Cliente: El jueves por la mañana si puede ser.
Tú: Déjame mirar la agenda un segundo.
[consultas disponibilidad]
Tú: El jueves tengo a las nueve y media o a las once. ¿Cuál prefieres?
Cliente: A las once.
Tú: Perfecto. ¿Me dices la matrícula y el modelo del coche?
Cliente: Es un Golf, 1234 FGH.
Tú: Y tu nombre, por favor.
Cliente: Javier Ruiz.
Tú: Vale Javier. Cambio de aceite, el jueves catorce a las once, para el Golf
con matrícula 1234 FGH. ¿Lo confirmo?
Cliente: Sí.
[reservas la cita]
Tú: Hecho. Te esperamos el jueves a las once. Hasta luego, Javier.

Cliente: ¿Puede ser mañana a las nueve?
Tú: Un momento que lo miro.
[consultas disponibilidad]
Tú: A las nueve justo lo tengo cogido, pero mañana me queda a las diez y media
o a las cinco de la tarde. ¿Te sirve alguna?

Cliente: Pues el martes a las cuatro.
Tú: Déjame verlo.
[la consulta falla]
Tú: Ahora mismo no consigo entrar en la agenda. ¿Prefieres que te llamemos
nosotros en cuanto se arregle, o pruebas más tarde?
```

Notas de implementación:

- **`[DATOS_CONTACTO]`** son líneas opcionales que salen de la ficha del negocio (§12 · vista 5, apartado 1): «Teléfono del negocio: …», «Correo del negocio: …» y «Página web: … (deletréala solo si te la piden)». Solo se incluyen las rellenadas; si no hay ninguna, la línea desaparece entera (sin dejar un hueco en blanco).
- El **editor del prompt** de «Ajustes del Agente» (§12, vista 5) enseña exactamente este texto ya relleno **y es editable** con dos modos explícitos:
  - **Automático** (`system_prompt_override` NULL): el prompt se recompone solo en cada publicación con los datos vivos del negocio (información, horarios, servicios, FAQ). Es el modo normal.
  - **Personalizado** (`system_prompt_override` con texto): lo que el usuario guardó se publica **tal cual, congelado** — los cambios de horarios/servicios/FAQ ya no se incorporan solos, y la interfaz lo avisa con claridad. Un botón «Volver al automático» limpia el override. Detalle obligatorio: si el usuario guarda un texto idéntico al compuesto, se queda en automático (no hay personalización real).
- El bloque de ejemplos **no es opcional ni recortable**. Son datos de comportamiento en línea y es lo que más sube la fiabilidad de un agente de voz. Los tres cubren caso feliz, hueco ocupado y fallo de herramienta.
- Los nombres literales de las tools **no aparecen en el prompt**: se describen por capacidad («consulta la agenda»), y las llamadas se marcan entre corchetes en los ejemplos. El modelo ya recibe los nombres exactos por el esquema de las tools; repetirlos en prosa hace que el agente los diga en voz alta.
- En cada publicación, guarda el prompt efectivo (el personalizado si existe, o el recompuesto) en `voice_agents.system_prompt`: es el registro de qué recibió el modelo la última vez.

### 10.4 Catálogo de modelos editable (todos los proveedores de VAPI)

El negocio elige transcriptor, modelo de IA y voz desde «Ajustes del Agente» (§12 · vista 5). El catálogo se construye en **dos capas**, y esta separación es la regla central:

**Capa 1 — datos generados, nunca escritos a mano.** Un script `pnpm vapi:pull-catalog` (`scripts/vapi-pull-catalog.ts`, sin API key: el OpenAPI de VAPI es público) descarga `https://api.vapi.ai/api-json` y vuelca a `lib/vapi/catalog-data.generated.ts` los enums reales:

- **Descubre los proveedores automáticamente** del esquema `CreateAssistantDTO` (los `oneOf` de `transcriber`, `model` y `voice`), excluyendo solo los pseudo-proveedores `Custom*` (que son «trae tu propio servidor», no proveedores). Al regenerar, los proveedores nuevos de VAPI aparecen solos. Referencia de agosto de 2026: 13 transcriptores, 16 LLM y 19 voces.
- De cada proveedor extrae: enum de modelos (filtrando las **variantes regionales** tipo `gpt-4o…:westus`, que son ruido operativo), enum de idiomas, enum de voces preset, y dos banderas leídas del propio esquema: `modelsFree` (el campo `model` acepta texto libre — OpenRouter, Together AI, Anyscale, DeepInfra…) y `voiceIdFree` (el `voiceId` acepta texto libre — Cartesia, PlayHT, Hume…).
- El fichero generado lleva cabecera «NO EDITAR A MANO» y se versiona. **Ampliar el catálogo = regenerarlo**, jamás añadir un id a mano (§0.1). Única excepción documentada: las voces `es-*` de Azure (Elvira, Álvaro, Dalia, Elena…), porque su `voiceId` es texto libre y los nombres son los documentados estables de Microsoft.

**Capa 2 — metadatos curados** en `lib/vapi/model-catalog.ts` (módulo puro, importable de servidor y cliente): etiquetas legibles («GPT 5.6 Luna», «Claude Haiku 4.5»), proveedores y modelos **recomendados** (transcriptor Deepgram, LLM OpenAI, voz ElevenLabs — con los del stack §10.1 marcados dentro), notas de una línea en lenguaje de negocio, y **estimaciones orientativas de coste ($/min) y latencia (ms) por familias de modelos** (reglas por prefijo con base por proveedor), coherentes con la línea base §10.1 (320+800+490 ms, ≈$0,11/min con los $0,05/min de cuota de plataforma). No son precios contractuales y la interfaz lo dice.

Reglas de comportamiento:

- **Validación en el servidor (lista blanca).** La Server Action de guardado revalida cada selección contra el catálogo. El **texto libre solo se acepta exactamente donde el esquema de VAPI lo acepta** (`modelsFree` / `voiceIdFree`); en enums cerrados (p. ej. las voces del proveedor `vapi`), un id fuera de lista se rechaza. Excepción: conservar la voz **ya guardada** del mismo proveedor aunque no esté listada (una voz de librería de ElevenLabs) — motor e idioma se validan siempre.
- **Campos que no existen no se envían.** Proveedores sin `model` en su esquema (AssemblyAI, Azure STT; Azure voice sin motor) guardan `''`/NULL y la publicación **omite el campo**; mandarlo provocaría un error de validación. Lo mismo con `language`.
- **Idioma de la voz.** Los proveedores de voz cuyo esquema lleva `language` (vapi, cartesia, playht, rime-ai, lmnt…) lo guardan en `voice_agents.voice_language` y lo muestran como desplegable; sin él, la voz puede salir en inglés. Preselección siempre en la variante española disponible (`es`, `es-ES`…).
- **Idiomas con etiqueta en español.** Los códigos ISO se etiquetan con `Intl.DisplayNames('es')`; los enums con nombres en inglés (Google STT usa «Spanish») llevan un mapa propio; `multi`/`Multilingual` se muestran como «Multilingüe (detecta solo)». Variantes españolas y `multi` aparecen arriba como recomendadas.
- **La estimación nunca se queda sin datos**: una selección fuera de catálogo (un stack traído con `vapi:pull-defaults`, un id libre tecleado) cae a la opción recomendada de su proveedor o a la base del proveedor, y en último término a la línea base §10.1.
- Aviso honesto en la interfaz: algunos proveedores poco comunes pueden requerir conectar su clave en el panel de VAPI (Dashboard → Integrations); los recomendados funcionan con las claves de la casa.

---

## 11. Rutas y scripts de servidor

| Ruta | Función |
|---|---|
| `POST /api/vapi/webhook` | Verifica firma/secreto, resuelve negocio, despacha `tool-calls`, persiste `end-of-call-report` y `status-update`, garantiza idempotencia vía `webhook_events`. |
| `POST /api/auth/signup` · `POST /api/auth/login` · `POST /api/auth/logout` | Autenticación propia (§6). Preferible como Server Actions; si usas rutas, protégelas igual. |
| Server Actions del CRM | `crearContacto`, `actualizarContacto`, `eliminarContacto`, `añadirNota`. Todas dentro de `withTenant`. |
| Server Actions de citas | `crearCita`, `moverCita`, `cambiarEstadoCita`, `anularCita` desde el panel. Comparten la **misma lógica de disponibilidad** que el agente — extráela a `lib/scheduling/availability.ts` y úsala desde ambos lados. Que no haya dos verdades. |
| Server Action de publicación | Crea o actualiza el asistente en VAPI (`assistants.create` / `assistants.update`), fija el objeto `server` (`url` + `credentialId`), engancha las tools por `toolIds` y vincula el número (`phoneNumbers.update`). |
| `pnpm vapi:tools:sync` | Script idempotente que crea o actualiza en VAPI las tools compartidas de §9 y guarda sus IDs en `vapi_tools`. Se ejecuta al desplegar y cada vez que cambia la definición de una tool. |
| `pnpm vapi:pull-catalog` | Regenera `lib/vapi/catalog-data.generated.ts` con los proveedores/modelos/idiomas/voces del OpenAPI público de VAPI (§10.4). No necesita API key. Es la única vía legítima de ampliar el catálogo. |
| `POST /api/vapi/outbound` | Lanza la llamada saliente desde la ficha del CRM. |
| `GET /api/health` | Sonda de salud: `SELECT 1` contra Postgres y `{ status, db, version, uptime }`. La usan el `healthcheck` del contenedor y Dokploy (§16.3). **Pública y sin datos sensibles.** |
| `GET /dev/webhooks` · `POST /dev/webhooks/:id/replay` | Inspector y reprocesado de webhooks. Solo fuera de producción y con sesión válida (§15.5). |

Las vistas leen de Postgres mediante **Server Components** dentro del contexto de inquilino. Nada de exponer la base de datos al navegador.

---

## 12. Vistas de la aplicación

Diseño responsive, barra lateral colapsable con Phosphor Icons, soporte de tema claro y oscuro. **Cada vista debe tener sus tres estados resueltos: cargando, vacío y error.** Los estados vacíos deben explicar qué hacer, no limitarse a decir «sin datos». Y cada mensaje de error nombra **su** vista («No se pudo cargar la agenda…»), nada de copiar la misma frase en todas.

**Ni una palabra de máquina en pantalla.** Los valores internos — estados de llamada de VAPI (`queued`, `in-progress`, `ended`…), estados de cita (`no_show`), estados/orígenes de contacto (`lead`, `agente_voz`), roles (`owner`) y los `endedReason` de VAPI — **nunca se pintan crudos**. Todas las etiquetas salen de un único módulo `lib/labels.ts`, tipado contra los enums del esquema (`Record<CallStatus, string>`: añadir un estado sin etiqueta no compila) y con prueba de regresión (`tests/labels.test.ts`). Esto aplica a insignias, filtros, títulos de cronología y cualquier texto visible.

### Guía visual — «naranja piedra»

El objetivo es un aspecto de SaaS profesional y diferencial: página en gris piedra cálido, tarjetas blancas muy redondeadas y un único color de acento vivo. Todo lo de abajo es obligatorio, no orientativo.

- **Superficies**: fondo de página gris cálido (`#F2F1EE`), tarjetas blancas con **radio grande (1.25rem)** y borde fino (`#E1DED9`), **sin sombra** — el borde ya separa. La sombra queda reservada a capas flotantes (diálogos, drawers, popovers, tooltips), que van a `rounded-2xl`.
- **Acento naranja vivo** (`#E8490C`, rampa completa 50–950): navegación activa (fondo tintado + **barrita indicadora** en el borde izquierdo del ítem), enlaces, foco de campos, iconos de métrica y los datos (gráficas, bloques de cita de la agenda). **Nunca para botones sólidos.**
- **Botones**: la acción sólida es **tinta casi negra** (`#201E1C`, texto blanco; en tema oscuro se invierte a botón blanco), el secundario blanco con borde, el sutil solo hover, y el rojo sólido únicamente para confirmaciones destructivas. Radio `0.75rem`.
- **Campos de formulario**: borde fino, radio `0.75rem`, anillo de foco naranja. Conmutadores de vista/rango/pestañas como **control segmentado en píldora** (contenedor `rounded-full` gris con el activo en blanco).
- **Badges pastel** `rounded-full`: fondo suave del tono al ~15 % + texto del mismo tono oscurecido (verde/ámbar/rojo/naranja/gris). El texto siempre nombra el estado: color solo, jamás.
- **Trama diagonal** decorativa (rayas finas a 45°) en estados vacíos, bloques de carga y celdas cerradas/fuera de horario de la agenda. Impleméntala con una CSS var para el color de la raya (no `currentColor`): si no, tiñe el texto de los hijos.
- **Sistema centralizado**: todos los colores son tokens de `@theme` en `globals.css` (`brand-*`, `surface-*`, `ok/warn/danger-*`) y los patrones repetidos son clases de componente (`.btn` + variantes, `.field`, `.seg`, `.texture-stripes`). **Prohibido esparcir hex por las vistas**: cambiar la marca debe ser tocar una rampa en un solo fichero.
- **Tipografía**: Inter cargada con `next/font` (declararla solo en `font-family` no la carga: se cae a la del sistema sin que nadie lo note).
- **Gráficas**: paleta **validada por script** (simulación de daltonismo + contraste ≥ 3:1 contra la superficie de la tarjeta, en claro **y** en oscuro — cada tema con sus propios valores, no una inversión automática). Referencia validada de 2 series: claro `#E8490C`/`#3D5FA8`, oscuro `#F0561D`/`#6781D9`; para la gráfica de coste del Panel (una sola serie) el teal validado como var `--chart-cost`: claro `#0D9488`, oscuro `#2FA8A8`. Para las **barras apiladas de coste/latencia** de Ajustes del Agente, paleta categórica de 3 validada: claro azul `#3D5FA8` / naranja `#E8490C` / teal `#0D9488`, oscuro `#6781D9`/`#F0561D`/`#2FA8A8`, publicada como CSS vars por tema (`--stack-stt`, `--stack-llm`, `--stack-tts`) más un gris neutro para el tramo «Plataforma» (`--stack-fee` — neutro a propósito: no es una categoría). Tramos con hueco de 2 px y extremos redondeados; el valor siempre en la leyenda, nunca solo en el color. Tooltip oscuro redondeado sin borde; leyenda siempre presente con dos o más series.
- **Desplegables con buscador** (`components/ui/search-select.tsx`): patrón único para proveedor/modelo/idioma/voz/zona horaria. Botón con aspecto de `.field` + panel con campo de filtrado (insensible a acentos vía NFD), grupos «Recomendados»/«Todos», metadato alineado a la derecha por opción, marca de selección y teclado (flechas, Enter, Escape). No uses `<select>` nativos para listas largas ni componentes distintos por pantalla.
- **Tema oscuro**: cada estilo tiene su versión oscura explícita (variante `dark:` o var por tema).

> ⚠️ **Tailwind 4 no avisa de tokens inexistentes.** Una clase como `border-surface-300` con una rampa que solo define 0/50/100/200/700–950 no da error ni warning: la utilidad no se genera y el borde cae a `currentColor` (casi negro) o el elemento simplemente no se pinta. Pasó con el punto indicador del hablante y dos bordes de burbuja en Conversaciones. Usa solo pasos declarados en `@theme` y, si dudas, grep de `(surface|brand)-\d+` contra la rampa declarada.

### 0 · Acceso
Login y registro. El registro pide nombre del negocio y crea todo el andamiaje (§5). Rutas privadas protegidas por `proxy.ts` + `requireSession()`.

### 1 · Panel de control

Un dashboard **completo y minimalista** gobernado por **un único selector de periodo** en la cabecera (control segmentado: **7 días · 30 días · 12 meses · Años**) que condiciona a la vez todas las tarjetas y gráficas. La granularidad de las gráficas acompaña al periodo — tramos por día, por mes o por año — y la vista «Años» arranca en el primer dato registrado. El periodo viaja en la URL (`?periodo=`), sin estado de cliente: el selector son enlaces.

- **Seis tarjetas de métrica del periodo elegido**, cada una con su dato secundario en pequeño: llamadas (con las de hoy), **coste de llamadas en USD** (suma de `cost_cents`, con el coste medio por llamada debajo), citas por teléfono (con las próximas en la agenda), **tasa de conversión** (llamadas que acaban en cita), duración media y contactos nuevos captados por el agente.
- **Dos gráficas lado a lado**: llamadas frente a citas (líneas, Recharts) y **coste por tramo** (barras, en el teal validado `--chart-cost` por tema — una sola serie: el título de la tarjeta la nombra y no lleva leyenda; eje Y y tooltip formateados en $). Ambas rellenan a cero los tramos sin datos: los días sin llamadas existen igualmente.
- Lista de últimas llamadas con su **coste individual** junto a la fecha y acceso a la transcripción en un clic.
- **Panel de estado del sistema**: conexión con Postgres, asistente de VAPI provisionado o pendiente, número vinculado, última publicación de configuración. Con enlace directo a lo que falte.

### 2 · Agenda
- Vista mensual y semanal de las citas, alimentada exclusivamente por `appointments`.
- **Crear cita arrastrando** sobre un hueco libre, con los huecos ocupados y las horas fuera de horario claramente marcados.
- Al pulsar una cita se abre su ficha. **Que sea una ficha, no una frase**: los datos en filas etiquetadas (estado, cliente, origen, llamada), no todos seguidos separados por puntos. Estructura que funciona:
  - **Cabecera destacada con la fecha**: el día en grande y legible («viernes 7 de agosto»), y debajo el rango horario y la **duración ya calculada** («10:00 – 11:00 · 1 h»), que si no hay que restarla mentalmente.
  - Filas de datos con la etiqueta a un lado y el valor al otro: **estado** (con distintivo de color y nombre legible — «No presentado», nunca el `no_show` de la base de datos), **cliente** enlazado a su ficha, **origen** (cerrada por teléfono con el agente / creada a mano), y enlace a la llamada que la generó.
  - **Notas** en su propio bloque etiquetado, respetando los saltos de línea.
- **Cambiar fecha y hora desde la propia ficha**, con dos desplegables (día y hora) que solo ofrezcan tramos **dentro del horario del negocio**. Arrastrar en la rejilla se mantiene como alternativa, no como única vía: obliga a cerrar la ficha y buscar el hueco a ojo. Las dos caminos llaman a la misma acción de servidor, que revalida horario y solapes y devuelve alternativas si choca.
- Cambiar estado (confirmada, completada, no presentado, anulada) desde el propio detalle, con la acción destructiva (anular) visualmente diferenciada y con confirmación.

> ⚠️ **React: `useActionState` fuera de un `<form>` necesita `startTransition`.** Mover una cita pulsando una celda de la rejilla no es un envío de formulario, así que la acción se invoca a mano. Si se llama directa (`moveAction(fd)`), React avisa por consola —«*An async function with useActionState was called outside of a transition*»— y, lo importante, **el flag `isPending` no se actualiza**: la interfaz no puede bloquearse mientras el servidor revalida y se encadenan dos movimientos con un doble clic. Envuélvela: `startTransition(() => moveAction(fd))`.

### 3 · Contactos (CRM)
Todo lo descrito en §8.3.

### 4 · Conversaciones
- Listado de llamadas con buscador **por contenido de la transcripción** y filtros por fecha, duración, resultado (terminó en cita o no) y estado.
- Detalle con la conversación turno a turno, diferenciando visualmente agente y cliente, con marcas de tiempo. **Solo se pinta lo que se dijo en voz alta**: el system prompt y el trasiego de herramientas son configuración interna y no aparecen (ver §14.1 — VAPI los manda en la misma lista que el diálogo). Que la diferencia no dependa solo del color: lado distinto, etiqueta «Agente»/«Cliente» y algún indicador de forma.
- **Resumen generado por la IA de VAPI** (`analysisPlan.summaryPlan`, §14.1): no hay que montar una segunda llamada a un modelo, VAPI lo produce al colgar y llega en el informe de fin de llamada. Se pinta junto a la transcripción. Cuando falte —porque la llamada es anterior a activarlo, y **no se puede recuperar**— dilo con una frase en vez de dejar el hueco en blanco.
- Metadatos (duración, número, coste, motivo de fin) y reproductor de la grabación si está disponible. El **motivo de fin se traduce a una frase entendible** («El cliente colgó», «Se cortó tras un silencio prolongado»…): los códigos habituales de VAPI uno a uno y los desconocidos por familias (`…error…` → error técnico; `twilio|vonage|telnyx|sip` → incidencia de operadora), con el código original conservado en el atributo `title` para diagnóstico. **El `src` del reproductor NO es la URL de VAPI**: apunta a una ruta propia (`/api/calls/:id/recording`) que valida sesión y pertenencia y firma el enlace al vuelo. Y lleva `preload="metadata"`, o el control marcará `0:00` hasta que se pulse play — ver §14.1.
- Enlace a la ficha del contacto y a la cita resultante.

### 5 · Ajustes del Agente

Se llama **«Ajustes del Agente»** en el menú y en el título (la ruta interna sigue siendo `/estudio`). Es la pantalla de configuración completa, organizada en este orden exacto — primero lo que define al negocio, luego cómo habla, luego con qué modelos, y por último su agenda y conocimiento:

**1 · Información del negocio.** Nombre, **zona horaria** (desplegable con buscador sobre las zonas del sistema — `Intl.supportedValuesOf('timeZone')` —, con `Europe/Madrid` y `Atlantic/Canary` recomendadas y validación real en el servidor), teléfono (normalizado a E.164 al guardar, con error claro si no parece válido), correo, sitio web y dirección. Estos datos alimentan `[DIRECCION]` y `[DATOS_CONTACTO]` del prompt (§10.3): la pantalla lo dice («el agente los usa para responder»). Renombrar el negocio refresca la barra lateral.

**2 · Personalidad del agente.** Tono, mensaje de bienvenida, despedida y derivación, número de derivación, idioma, capacidad simultánea, antelación mínima, horizonte de reserva y duración máxima de llamada — y, en el mismo apartado, el **editor del prompt** con contador de caracteres y los dos modos Automático/Personalizado de §10.3 (chip de estado visible, aviso de congelación cuando es personalizado, botón «Volver al automático»).

**3 · Modelos del agente.** Tres cajas — **Modelo de transcripción** («convierte en texto lo que dice el cliente»), **Modelo de IA** («decide qué responder y cuándo dar cita») y **Modelo de voz** («la voz que oye el cliente») — cada una con su icono en el color de su serie de la gráfica. Todo son **desplegables con buscador** (combobox): botón que abre un panel con campo de filtrado (insensible a acentos), grupo «Recomendados» arriba y «Todos» debajo, navegable con teclado. Dentro de cada caja:
  - **Proveedor** (todos los del catálogo §10.4), **Modelo** (con «≈$/min · ms» alineado a la derecha en cada opción y distintivo «Recomendado»), **Idioma** cuando el proveedor lo expone, y en la voz además **Motor** y **Voz** (con «Carolina» primera y recomendada en ElevenLabs).
  - Donde el esquema de VAPI acepta texto libre (§10.4), el desplegable correspondiente se sustituye por un **campo de texto** monoespaciado («id exacto del proveedor»).
  - Pie de caja con las cifras de la elección actual.
  - **Estimación en vivo**: bloque final con dos **barras apiladas** — coste $/min (Transcripción + IA + Voz + el tramo neutro «Plataforma») y tiempo de respuesta en ms (tres tramos) — que se recalculan al instante con cada cambio, cada una con su total grande, leyenda con valores y transición suave. Cuando la selección difiere de la guardada, una línea discreta compara («Guardado ahora: …»). Nota al pie: cifras orientativas, no incluyen la telefonía.
  - «Guardar modelos» no toca el teléfono: activa «cambios sin publicar» (la pantalla lo explica).
- Gestión del **catálogo de servicios**: alta, edición, orden, duración, precio, activar/desactivar.
- **Horario semanal** con tramos por día, incluido el partido de mediodía.
- **Cierres puntuales** (vacaciones, festivos).
- **Preguntas frecuentes** (`business_facts`) editables una a una.
- Botón **«Publicar»**: sincroniza con VAPI, muestra un diff de lo que cambia (incluidos `transcriber`, `model` y `voice`) y confirma el resultado. Indicador visible de «cambios sin publicar».
- **Sin banco de pruebas.** No incluyas ningún botón/chat «Probar»: se descartó a propósito (no aporta frente a una llamada real y añade una superficie más que mantener).

### 6 · Conexiones
- Estado del asistente y del número de VAPI, con sus identificadores.
- Botón para provisionar el asistente si aún no existe.
- Selector para vincular un número de teléfono al asistente.
- Prueba de conectividad del webhook (ping desde la app y resultado).
- **Comparador de `server.url`**: muestra el que tienen configurado el asistente **y las tools compartidas** en VAPI frente al que se deriva de `APP_URL`. Si divergen, aviso llamativo y botón para realinearlos. Es exactamente lo que pasa al saltar del túnel de desarrollo al dominio de producción, y sin este aviso te comes una tarde buscando por qué el agente contesta pero no agenda.
- Estado de las **tools compartidas**: cuáles están creadas en VAPI, su `checksum` y si el asistente de este negocio las tiene enganchadas por `toolIds`.
- **Aquí no se gestionan claves.** La `VAPI_API_KEY` es de la plataforma y vive en el entorno del servidor; la credencial del webhook vive en el dashboard de VAPI. Esta vista solo muestra estado y ofrece acciones, nunca campos de secreto.

### 7 · Mi perfil

Vista **sencilla y de solo lectura** con los datos de la cuenta que ha iniciado sesión, con su propia entrada «Mi perfil» al final del menú lateral (ruta `/perfil`). Contenido: avatar con las iniciales, nombre completo y correo; y en filas etiquetadas el **rol** en el negocio (insignia: «Propietario»/«Empleado», nunca `owner`/`staff`), el **negocio**, la **fecha de alta** y las **sesiones abiertas** (sesiones sin caducar ≈ dispositivos). Nada de edición ni gestión de usuarios: deliberadamente mínima. Los datos de `users`/`sessions` se leen a través de un helper en `lib/auth/*` (son las tablas sin RLS del §5; ningún otro módulo las toca).

---

## 13. Variables de entorno

Documéntalas en `.env.example` con comentarios. **Ningún valor real.**

**Criterio: en el entorno solo van secretos y cosas que cambian entre máquinas.** Todo lo demás — modelos, voces, transcriptores, tonos por defecto — es **código**, y vive tipado y versionado en `lib/vapi/defaults.ts`. Una variable de entorno para elegir el modelo del LLM no aporta flexibilidad: aporta una vía silenciosa de romper producción con una errata que nadie revisa. Y en este producto esos valores además son **editables por negocio desde el panel**, así que la variable de entorno sería un tercer sitio donde puede vivir la verdad.

```bash
# ── Base de datos ───────────────────────────────────────────────
# Estas tres las consume docker-compose para inicializar el motor.
POSTGRES_USER=voiceops
POSTGRES_PASSWORD=
POSTGRES_DB=voiceops

# Las URLs las compone lib/env.ts a partir de las piezas de arriba más
# DB_HOST, para no repetir la contraseña en tres sitios y que se
# desincronicen. En desarrollo DB_HOST=localhost; en Dokploy, DB_HOST=db.
DB_HOST=localhost
DB_PORT=5432
APP_DB_USER=app_user       # rol sin BYPASSRLS con el que corre la aplicación
APP_DB_PASSWORD=

# ── Aplicación ──────────────────────────────────────────────────
# En desarrollo: la URL del Funnel de Tailscale (§15), porque de ella se
# compone el server.url que se envía a VAPI. En producción: https://<tu-dominio>
APP_URL=https://<equipo>.<tailnet>.ts.net
APP_DOMAIN=                # Solo producción: dominio sin protocolo, para Traefik (§16)

# ── VAPI ────────────────────────────────────────────────────────
VAPI_API_KEY=              # Clave privada de servidor. Nunca en el cliente.
VAPI_SERVER_CREDENTIAL_ID= # ID de la Custom Credential creada en el dashboard de VAPI
VAPI_WEBHOOK_TOKEN=        # El mismo token Bearer que guarda esa credencial

# ── Localización ────────────────────────────────────────────────
DEFAULT_TIMEZONE=Europe/Madrid
DEFAULT_COUNTRY_CODE=ES    # Lo usa libphonenumber-js para normalizar a E.164
```

Notas que deben quedar escritas:

- **No existe un `VAPI_ASSISTANT_ID` global.** El `vapi_assistant_id` y el `vapi_phone_number_id` viven **por negocio** en `voice_agents`.
- `VAPI_WEBHOOK_TOKEN` **no es un secreto HMAC**: es el token Bearer que VAPI inyecta según la Custom Credential referenciada por `VAPI_SERVER_CREDENTIAL_ID`. Los dos valores deben corresponder a la misma credencial, o el webhook rechazará todo (§7).
- `APP_DOMAIN` es redundante con `APP_URL` a nivel de aplicación, pero **hace falta igualmente**: las etiquetas de Traefik se evalúan en el fichero compose, donde no se puede derivar el host de una URL. Valida en el arranque que uno es el host del otro y falla si no coinciden.

Valida todo al arrancar con un esquema Zod en `lib/env.ts`, de forma que un despliegue mal configurado falle de inmediato y con un mensaje claro, en lugar de romperse a mitad de una llamada.

---

## 14. Notas técnicas de VAPI que debes respetar

Todo lo de abajo está sujeto a §0.1: **las skills mandan sobre este documento.**

### 14.1 Forma de los payloads

- Las tool calls llegan en **`message.toolCallList`**, y cada elemento es `{ id, type, function: { name, arguments } }` — **el nombre va dentro de `function` y los argumentos son un string JSON**, no un objeto. Ver §9.4: leer solo `toolCall.name` deja el agente sin herramientas sin que falle nada. Responde con `{ results: [{ toolCallId: <el id>, result: "..." }] }`.
- El **`end-of-call-report`** no trae los datos en la raíz del mensaje. Están repartidos: `message.analysis.summary` (resumen), `message.artifact.transcript` y `message.artifact.messages` (transcripción turno a turno), `message.artifact.recordingUrl` (grabación), `message.cost`, `message.endedReason`, `message.startedAt` / `message.endedAt`. **Mapea cada campo desde su sitio real**; buscar `message.summary` devuelve `undefined` y te deja las llamadas sin resumen sin que nada falle.
- Los artefactos aparecen solo si están habilitados en el asistente. Si la transcripción llega vacía, revisa esa configuración antes de tocar el código.

> 🚨 **VAPI NO dice «assistant»: dice `bot`.** Los roles reales de `artifact.messages` son exactamente estos cinco:
>
> | `role` de VAPI | Qué es | Cómo guardarlo |
> |---|---|---|
> | `bot` | **lo que dice el agente en voz alta** | `assistant` |
> | `user` | lo que dice el cliente | `user` |
> | `system` | **el system prompt entero** (miles de caracteres) | **no guardarlo** |
> | `tool_calls` | invocación de herramienta (sin texto hablado) | `tool` (o descartar) |
> | `tool_call_result` | resultado de la herramienta; el texto va en `result`, **no en `message`** | `tool` (o descartar) |
>
> Escribe un mapeo **explícito**. El anti-patrón que hay que evitar es este:
>
> ```ts
> // ❌ MAL: 'bot' no está en la lista, así que TODA la voz del agente cae en 'system'
> role: ['assistant','user','system','tool'].includes(m.role) ? m.role : 'system'
> ```
>
> Con ese código la transcripción queda inservible y de una forma que no parece un error: el agente **no aparece por ninguna parte** (cero filas `assistant`), y sus frases salen mezcladas con el prompt bajo la misma etiqueta. Al pintarlo, el usuario ve un muro de 5.000 caracteres de configuración interna seguido de un diálogo en el que solo se distingue al cliente.
>
> **El mensaje `system` no se persiste.** No es conversación, es configuración: guardarlo mete el prompt en la base de datos, lo enseña en pantalla y contamina el buscador por contenido de transcripción con falsos positivos de palabras que solo están en el prompt.
>
> Si ya has guardado transcripciones con el mapeo mal, **no hace falta adivinar nada para arreglarlas**: el payload íntegro sigue en `webhook_events`, así que se reprocesan llamando al handler con `skipIdempotency` (el mismo mecanismo del reprocesado de `/dev/webhooks`, §15.5). Hazlo entrando por `withTenant` negocio a negocio — `webhook_events` está bajo RLS y una consulta sin inquilino devuelve cero filas.

> 🚨 **`analysisPlan.summaryPlan` hay que ENCENDERLO.** Mandar el plan con sus `messages` no basta: si no incluyes `enabled: true`, VAPI acepta el payload, te lo devuelve como `"enabled": false` y **`message.analysis` llega vacío en todos los informes**. El histórico se queda sin resumen para siempre y no hay ningún error que lo delate. Lo mismo aplica a `successEvaluationPlan` si lo usas.
>
> ```jsonc
> "analysisPlan": {
>   "summaryPlan": { "enabled": true, "messages": [ /* … */ ] }
> }
> ```
>
> Ojo con el matiz: el OpenAPI documenta `@default true`, pero un asistente publicado sin el campo explícito **vuelve como `enabled: false`**. No te fíes del valor por defecto — mándalo siempre.
>
> Tras publicar, haz `GET /assistant/{id}` y **comprueba que la respuesta dice `enabled: true`**.
>
> **El resumen NO se puede recuperar a posteriori.** Se genera una sola vez, al colgar. `/call/{id}` solo admite `get`, `patch` y `delete`: no hay ningún endpoint para re-analizar una llamada terminada. Las llamadas hechas con el plan apagado se quedan sin resumen para siempre. Por eso la comprobación de arriba se hace en la primera publicación, no cuando alguien echa en falta los resúmenes.
>
> Consecuencia para la interfaz: la ficha de la conversación debe distinguir «aún no ha terminado» de «terminó y no hay resumen», y en el segundo caso **explicar por qué** en vez de dejar un hueco mudo — si no, parece un fallo de la aplicación.

> 🚨 **La URL de grabación que llega en el webhook NO se puede reproducir.** `artifact.recordingUrl`, `artifact.stereoRecordingUrl` y `artifact.recording.*` apuntan al almacenamiento privado de VAPI (Cloudflare R2) y **devuelven `HTTP 400 «Authorization»`** si las metes en un `<audio src>`. El reproductor aparece en pantalla y no suena, sin ningún error en consola.
>
> Las reproducibles son las firmadas — `artifact.presignedMonoUrl`, `presignedStereoUrl`, `presignedCustomerUrl` — **pero caducan** (mira `artifact.presignedUrlsExpiresAt`: ~30 minutos). Guardarlas en base de datos no sirve: mañana el reproductor vuelve a fallar.
>
> **Solución correcta:** guarda la URL cruda como identificador estable y sirve el audio por una ruta propia (`GET /api/calls/:id/recording`) que, en el momento de reproducir: (1) exija sesión, (2) resuelva la llamada dentro de `withTenant` para confirmar que es de ese negocio, (3) pida un enlace firmado fresco, y (4) responda `302` hacia él. El `302` evita que los megas pasen por tu servidor y deja que el navegador use peticiones por rangos (avanzar y retroceder en el reproductor) sin código extra. Como efecto secundario, la grabación deja de ser una URL pública incrustada en el HTML: escuchar una llamada pasa a exigir sesión y pertenencia al inquilino.
>
> Para el paso (3) usa el **endpoint dedicado `GET /call/{id}/mono-recording`**, que responde `302` hacia una URL recién firmada. Es más estable que rebuscar en los campos `presigned…` del artifact, que pueden renombrarse; déjalos como respaldo. (Existen también `/stereo-recording`, `/customer-recording` y `/assistant-recording` si algún día quieres las pistas separadas.)
>
> **En el `<audio>`, `preload="metadata"` — no `"none"`.** Con `"none"` el navegador no lee la cabecera del fichero y el reproductor marca **0:00** hasta que el usuario pulsa play; parece que la grabación está vacía. Con `"metadata"` se descargan unos pocos bytes (la cabecera RIFF ya lleva la duración) y el control aparece con el tiempo correcto, sin traerse los megas del audio.
>
> **Cachea el enlace firmado en memoria (~20 min).** Es la consecuencia directa de lo anterior: con `preload="metadata"`, CADA carga de la página pasa por tu ruta, y luego otra vez al pulsar play y otra por cada salto en la barra. Sin caché son varias llamadas a la API de VAPI por audio escuchado. 20 minutos deja margen sobre los 30 de la firma (`X-Amz-Expires=1800`). Un `Map` de proceso basta, con el mismo criterio que el rate limit: con varias réplicas cada una tendrá el suyo y solo significa alguna llamada de más.
>
> Detalle que despista al depurar: las URLs firmadas **rechazan `HEAD` con `403`** y solo responden a `GET`. Si compruebas con `curl -I` creerás que están rotas cuando funcionan.

### 14.2 Configuración

- **El `server` es un objeto** `{ url, credentialId }` — los campos sueltos `serverUrl` y `serverUrlSecret` pertenecen a una versión anterior de la API — y su **prioridad** es tool > asistente > número > organización (§10.2: configura asistente y tools apuntando a la misma ruta).
- **Multi‑negocio:** identifica el inquilino por el `assistantId` (o `phoneNumberId`) de `message.call`. En las llamadas salientes, además, mete `businessId` y `contactId` en **`metadata`** al crear la llamada, y léelos de vuelta en el webhook: es determinista y te ahorra adivinar.
- **Vincular el número al asistente:** fija el `assistantId` del número con `phoneNumbers.update(phoneNumberId, { assistantId })`. Sin `assistantId`, VAPI contesta con un mensaje genérico. El identificador es el **UUID del número en VAPI**, no el `+34…`.

### 14.3 Números de teléfono en España

Esto condiciona el producto y hay que decírselo al usuario en el README, no descubrirlo el día de la demo:

- Los **números gratuitos de VAPI son de Estados Unidos**, no hacen llamadas internacionales y tienen límite diario. Sirven para probar, no para un taller de Albacete.
- Para un número español real hay que **importar uno de Twilio, Telnyx o Vonage** y pasar sus credenciales al crear el `phone-number` en VAPI.
- Documenta las dos rutas: la de prueba (número gratuito de VAPI, llamando desde EE. UU. o por llamada web) y la de producción (número propio importado).

### 14.4 Llamadas salientes

- `calls.create({ assistantId, phoneNumberId, customer: { number }, metadata })`. Ciclo habitual: `queued` → `ringing` → `in-progress` → `ended` (existen además `scheduled` y `forwarding` — §5 · `calls`).
- Para los recordatorios de cita, `schedulePlan` con `earliestAt` / `latestAt` permite programarlas sin montar un cron propio.
- **Consentimiento:** llamar de forma automatizada a alguien que no lo ha autorizado tiene consecuencias legales. En España aplican el RGPD y la LSSI, no el marco estadounidense que citan los ejemplos de VAPI. Restringe las llamadas salientes a contactos que ya son clientes del negocio y añade una casilla de consentimiento en la ficha del CRM.

### 14.5 Desarrollo local

- El webhook se expone con **Tailscale Funnel** (§15).
- Si alguien quiere usar además la CLI (`vapi listen`), ojo: **la CLI escucha en el puerto 4242 y no crea la URL pública por sí sola**. Habría que tunelar el 4242, no el 3000. En este proyecto **saltamos la CLI** y apuntamos el Funnel directamente a la aplicación, que es un elemento menos que puede fallar.
- Usa siempre el **SDK de servidor** (`@vapi-ai/server-sdk`). La `VAPI_API_KEY` no sale del backend.

### 14.6 Fallos silenciosos: llévalos al README

Todos estos dejan el sistema aparentemente funcionando. Recógelos en una tabla de diagnóstico:

| Síntoma | Causa |
|---|---|
| El agente contesta pero nunca agenda | El `server.url` **de las tools** apunta a la URL vieja, aunque el del asistente esté bien. |
| El agente dice «ahora mismo no puedo consultar la agenda» y en VAPI aparece **«No result returned for call_…»**, pero tu webhook responde `200` y no registra ningún evento de tool | Estás leyendo `toolCall.name`, que es `undefined`: el nombre real está en `toolCall.function.name` y los argumentos son un **string JSON** (§9.4). El bucle se salta todas las invocaciones y devuelve `{"results": []}`. |
| Las llamadas se guardan sin resumen ni transcripción | Se leyó `message.summary` en vez de `message.analysis.summary` / `message.artifact.transcript`, o los artefactos están desactivados en el asistente. |
| La transcripción **empieza con el prompt entero** y el agente no aparece por ningún lado (solo se distingue al cliente) | VAPI manda la voz del agente con `role: "bot"`, no `"assistant"`. Un mapeo que envía lo desconocido a `system` mete el diálogo del agente en el mismo saco que el prompt (§14.1). |
| El buscador de conversaciones devuelve llamadas que no contienen lo buscado | Se está guardando el mensaje `system` (el prompt) como parte de la transcripción, y el texto del prompt hace de coincidencia falsa. |
| `message.analysis` llega **vacío** en todos los informes, aunque enviaste `summaryPlan` con sus `messages` | Falta `enabled: true` dentro de `summaryPlan`. VAPI acepta el plan y lo deja apagado. Compruébalo con `GET /assistant/{id}` (§14.1). |
| El reproductor de la grabación aparece pero **no suena**, sin error en consola | Se enlazó `artifact.recordingUrl` directamente: es almacenamiento privado y responde `400 Authorization`. Hay que servir el audio por una ruta propia que pida una URL firmada fresca (§14.1). |
| La grabación funcionaba y **al día siguiente dejó de sonar** | Se guardó en base de datos una URL firmada (`presigned…`), y caducan a la media hora. Guarda la cruda y firma en el momento de reproducir. |
| El reproductor marca **`0:00` hasta que le das al play**, y entonces sí muestra la duración | El `<audio>` lleva `preload="none"`: el navegador no lee la cabecera y no sabe cuánto dura. Usa `preload="metadata"` (§14.1). |
| Muchas llamadas a la API de VAPI solo por abrir la ficha de una conversación | Falta cachear el enlace firmado. Con `preload="metadata"` cada carga de página pide uno nuevo (§14.1). |
| Aviso en consola «*async function with useActionState was called outside of a transition*» al mover una cita en la rejilla | La acción se invocó a mano fuera de un `<form>`. Envuélvela en `startTransition` o `isPending` no funcionará (§12 · Agenda). |
| Una vista con SQL crudo (`db.execute`) revienta solo con ciertos filtros o fechas | Los `timestamptz` de `db.execute` llegan como **string**, no `Date` (la conversión es del select tipado de Drizzle, §5). `DateTime.fromJSDate(string)` da fecha inválida y la siguiente consulta parametrizada falla. Pide el dato ya convertido en SQL (`::int`, `to_char`). |
| El webhook devuelve 401 a todo | `VAPI_SERVER_CREDENTIAL_ID` y `VAPI_WEBHOOK_TOKEN` no pertenecen a la misma Custom Credential. |
| El coste o la latencia se van muy lejos de $0,11/min y 1.610 ms | Algún campo de `transcriber`/`model`/`voice` no se aplicó y VAPI cayó a un valor por defecto. Compara con §10.1. |
| Error «no se encuentra la voz» al publicar | El identificador de la voz de ElevenLabs no es el correcto, o la cuenta necesita conectar su propia credencial de ElevenLabs. |
| Publicar falla justo después de elegir un proveedor poco común en Ajustes del Agente | Esa integración necesita conectar la clave del proveedor en el panel de VAPI (Dashboard → Integrations). Vuelve a un recomendado o conecta la credencial (§10.4). |
| El agente responde en español pero transcribe fatal | Falta `language: "es"` en el transcriptor, o se quedó en el modelo en inglés. |
| Al crear el asistente salta un error de validación en `name` | Se pasó de 40 caracteres. |
| El número suena pero contesta un mensaje genérico | Al número le falta el `assistantId`. |
| El CRM se llena de fichas duplicadas | No se normalizó el teléfono a E.164 antes del *upsert*. |
| Silencios largos a mitad de conversación | Faltan los `messages` de tool (`request-start`) en las tools lentas. |
| Las transcripciones no se guardan aunque todo lo demás va | Se activó `compliancePlan.hipaaEnabled`. |

---

## 15. Túnel de desarrollo: Tailscale (no ngrok)

VAPI necesita alcanzar nuestro webhook con una **URL pública y con HTTPS válido**. En local no la hay. La solución de este proyecto es **Tailscale Funnel**, y no ngrok ni cloudflared.

**Por qué Tailscale y no ngrok:** la URL de Funnel es la **MagicDNS del equipo** (`https://<equipo>.<tailnet>.ts.net`) y **no cambia entre reinicios**. Eso significa que el `server.url` del asistente y de las tools se configura **una vez** y deja de ser un problema. Con ngrok gratuito, cada reinicio da una URL nueva y hay que volver a publicar el asistente. Además, el mismo tailnet nos sirve luego para llegar al Postgres del VPS sin abrir un solo puerto al exterior (§16).

### 15.1 Requisitos previos (documéntalos en el README, no los ejecutes tú)

1. Tailscale instalado y con sesión iniciada en la máquina de desarrollo.
2. **MagicDNS** activado en el tailnet.
3. **Certificados HTTPS** habilitados en los ajustes del tailnet.
4. El atributo de nodo **`funnel`** presente en el fichero de políticas (ACL) del tailnet. La primera ejecución de `tailscale funnel` guía por web para concederlo.

### 15.2 Comandos

Levantar el túnel en segundo plano apuntando al servidor de desarrollo:

```bash
tailscale funnel --bg 3000
```

Ver el estado y la URL pública asignada:

```bash
tailscale funnel status
```

Apagarlo:

```bash
tailscale funnel --bg off
```

Notas que debes recoger en el README: Funnel solo escucha públicamente en los puertos **443, 8443 y 10000** (por defecto 443, que es lo que queremos); el destino local sí puede ser cualquier puerto, en nuestro caso el 3000.

### 15.3 Qué tienes que entregar

- **Scripts multiplataforma** `scripts/tunnel.ps1` (Windows/PowerShell) y `scripts/tunnel.sh` (Linux/macOS), expuestos como `pnpm tunnel`, que levanten el Funnel, **lean la URL pública resultante** y la impriman con la ruta ya montada y lista para pegar: `https://<host>.ts.net/api/vapi/webhook`.
- Un script `pnpm vapi:sync` que reescriba el `server.url` **del asistente y de todas las tools compartidas** a partir de `APP_URL`. Si solo actualizas el asistente, las tool calls siguen yendo a la URL vieja y el agente contesta pero no agenda — que es el fallo más desconcertante de todos, porque la llamada funciona.
- `APP_URL` en `.env.local` debe contener **la URL del Funnel** durante el desarrollo, porque de ella se compone el `server.url` que se envía a VAPI.

### 15.4 Seguridad del túnel

Funnel abre ese puerto **a Internet entero**. Con ngrok pasa lo mismo, pero conviene decirlo alto: a partir de ese momento, **lo único que separa tu base de datos de un desconocido es la verificación del secreto del webhook de §7**. Por tanto:

- La verificación del secreto se hace **siempre**, también en desarrollo. Nada de saltársela con un `if (dev) return true`.
- **Expón únicamente la aplicación.** Nunca pongas Adminer ni el 5432 detrás de un Funnel. Si necesitas compartir algo dentro del equipo, usa `tailscale serve`, que es privado al tailnet, en vez de `funnel`.
- Las rutas de desarrollo del punto siguiente deben estar tapiadas con `NODE_ENV !== 'production'` **y** con sesión válida.

### 15.5 Inspector de webhooks propio

Tailscale no trae el inspector de peticiones que ngrok sirve en el `:4040`, así que **lo construimos nosotros**, que además es mejor porque queda en el producto:

- Una ruta de desarrollo `/dev/webhooks` que liste los últimos registros de `webhook_events` con su `payload` crudo formateado, el tipo de evento, el negocio resuelto y el error si lo hubo.
- Un botón **«Reprocesar»** que vuelva a lanzar ese payload contra el manejador, saltándose el control de idempotencia. Depurar una tool call sin tener que llamar por teléfono cuarenta veces vale su peso en oro.
- Visible solo fuera de producción y con sesión iniciada.

---

## 16. Despliegue en VPS de Hostinger con Dokploy

El objetivo es que el usuario **no tenga que tocar el servidor**: conecta el repositorio en Dokploy, rellena las variables, pulsa desplegar y funciona. Todo lo que haga falta para eso va dentro del repositorio.

### 16.1 `Dockerfile` de la aplicación

Multietapa, y **compilado en modo `standalone`** para que la imagen final sea pequeña:

- Activa `output: "standalone"` en `next.config.ts`.
- Base `node:24-alpine` en todas las etapas. Habilita pnpm con `corepack enable`.
- **Etapa `deps`**: copia solo `package.json` + `pnpm-lock.yaml` e instala con `pnpm install --frozen-lockfile`. Así la caché de capas sobrevive a los cambios de código.
- **Etapa `builder`**: copia el código y ejecuta `pnpm build`.
- **Etapa `runner`**: copia `.next/standalone`, `.next/static` y `public`. Usuario **no root** (`nextjs`, uid 1001). `ENV HOSTNAME=0.0.0.0` y `PORT=3000` — sin `HOSTNAME=0.0.0.0` el servidor standalone escucha solo en localhost y Traefik no lo alcanza, que es el fallo más habitual y el más difícil de diagnosticar.
- `ENTRYPOINT` a un `docker-entrypoint.sh` que **ejecute las migraciones y luego arranque el servidor**. Las migraciones toman `pg_advisory_lock`, así que aunque haya varias réplicas solo una migra y las demás esperan.
- Entrega también un `.dockerignore` que excluya `node_modules`, `.next`, `.git`, `.env*`, `pgdata`, `*.md`.

### 16.2 `docker-compose.dokploy.yml`

Este es el fichero que Dokploy va a ejecutar. Reglas que **debes** respetar, porque son las que hacen que funcione a la primera:

- **Nada de `ports:` en la aplicación.** Usa `expose: [3000]`. Quien publica al exterior es Traefik, no Docker. Publicar puertos en un servidor con Dokploy es un agujero, no una comodidad.
- **La base de datos no publica ningún puerto.** Vive solo en la red interna del proyecto. Si el usuario necesita entrar a mirar, se hace por Tailscale (§16.6), no abriendo el 5432.
- El servicio de la aplicación debe estar **en dos redes**: la interna del proyecto (para hablar con la base de datos) y **`dokploy-network`** (para que Traefik lo vea). Si falta la segunda, el dominio devuelve 404 y no hay forma de adivinar por qué.
- Declara `dokploy-network` como **externa** en la sección `networks` de la raíz.
- **Etiquetas de Traefik** en el servicio de la aplicación, con nombres de router y de servicio **prefijados con el nombre del proyecto** (Traefik es único para todo el servidor: dos proyectos con un router llamado `app` se pisan):

```yaml
labels:
  - traefik.enable=true
  - traefik.docker.network=dokploy-network
  - traefik.http.routers.voiceops-web.rule=Host(`${APP_DOMAIN}`)
  - traefik.http.routers.voiceops-web.entrypoints=websecure
  - traefik.http.routers.voiceops-web.tls.certresolver=letsencrypt
  - traefik.http.services.voiceops-web.loadbalancer.server.port=3000
```

- **Variables de entorno:** las que el usuario escriba en la interfaz de Dokploy se vuelcan a un `.env` pero **no se inyectan solas en los contenedores**. Añade `env_file: [.env]` en los servicios que las necesiten. Es la causa número uno de despliegues que arrancan con la configuración vacía.
- **Volúmenes:** usa un **volumen con nombre** (`pgdata`) para la base de datos, nunca una ruta absoluta del host — Dokploy limpia esas rutas al redesplegar y te llevas la base de datos por delante. Los volúmenes con nombre además entran en la copia de seguridad automática de Dokploy.
- `depends_on` con `condition: service_healthy` sobre el `healthcheck` de la base de datos, y `restart: unless-stopped` en ambos servicios.
- El servicio `db` usa `postgres:18-alpine` y monta el mismo `db/init/00-roles.sql` que en desarrollo, para que el rol `app_user` y las extensiones existan también en producción.

### 16.3 Comprobación de salud

Crea `GET /api/health` que haga un `SELECT 1` contra Postgres y devuelva `{ status, db, version, uptime }`. Sirve para el `healthcheck` del contenedor, para que Dokploy no dé por bueno un despliegue roto y para diagnosticar en dos segundos desde el móvil.

### 16.4 Pasos del usuario (escríbelos en el README, no los ejecutes)

1. Contratar un VPS en Hostinger con **Ubuntu 24.04** y la plantilla de **Dokploy** (o instalarlo con el script oficial). Mínimo recomendado: 2 vCPU y 4 GB de RAM.
2. Apuntar un registro **A** del dominio a la IP del VPS y esperar la propagación.
3. En Dokploy: **New Project → Compose**, conectar el repositorio de GitHub (§17) y fijar el **Compose Path** a `./docker-compose.dokploy.yml`.
4. Rellenar las variables de entorno en la pestaña *Environment*, incluidas `APP_DOMAIN` y `APP_URL=https://<dominio>`.
5. **Deploy.** Traefik emite el certificado de Let's Encrypt solo.
6. Activar **Auto Deploy** para que cada `push` a `main` redespliegue.
7. Ejecutar `pnpm vapi:sync` y volver a **«Ajustes del Agente»** a pulsar **Publicar**, para que el `server.url` del asistente **y el de las tools compartidas** apunten al dominio de producción en lugar de al Funnel de desarrollo.
8. Activar las **copias de seguridad del volumen `pgdata`** en Dokploy.

### 16.5 Tabla de diagnóstico

Inclúyela en el README, con al menos estos casos: dominio que devuelve 404 (falta `dokploy-network` o la etiqueta `traefik.docker.network`), aplicación que arranca sin variables (falta `env_file`), certificado que no se emite (DNS sin propagar o puerto 80 cerrado), contenedor sano pero inalcanzable (falta `HOSTNAME=0.0.0.0`), y migraciones que no corren (entrypoint mal enlazado o sin permisos de ejecución).

### 16.6 Acceso a la base de datos de producción

Sin abrir puertos: instala Tailscale en el VPS y accede al Postgres **dentro del tailnet**. Documenta el procedimiento en el README como paso opcional. Es la contrapartida natural a §15 y evita el clásico 5432 abierto a Internet con contraseña de cuatro caracteres.

---

## 17. Repositorio y conexión con GitHub

El repositorio se prepara entero, pero **el usuario lo versiona y lo conecta a GitHub a mano**. Aplica aquí la regla de git de §0.3 sin excepciones.

**Lo que haces tú:**

- `git init` con rama por defecto `main`. Nada más de git.
- Un **`.gitignore`** que cubra como mínimo: `node_modules/`, `.next/`, `out/`, `build/`, `.env`, `.env.local`, `.env.*.local`, `pgdata/`, `*.log`, `coverage/`, `.DS_Store`, `Thumbs.db`, `.turbo/`. Con la excepción explícita `!.env.example`.
- **Comprueba que no hay secretos en el árbol de trabajo** y dilo en el resumen final. Si existe un `.env` con valores reales, avisa de que está ignorado y de que no debe subirse.
- `.env.example` completo y comentado, este sí pensado para versionarse.
- Un flujo de integración continua **ligero** en `.github/workflows/ci.yml`: en cada `push` y `pull_request` sobre `main`, instalar con pnpm cacheado, `pnpm lint`, comprobación de tipos, `pnpm build` y la **comprobación de que `CLAUDE.md` y `AGENTS.md` siguen siendo idénticos** (§0.3). Que no dependa de secretos ni bloquee el despliegue de Dokploy — es una red de seguridad, no una aduana.
- Un `README.md` con la sección **«Publicar en GitHub»** y los comandos exactos, con marcadores para que el usuario sustituya:

```bash
git add .
git commit -m "VoiceOps: recepcionista telefónico con IA + CRM"
git remote add origin git@github.com:<usuario>/<repositorio>.git
git branch -M main
git push -u origin main
```

**Lo que NO haces:**

- **No ejecutas `git add`, `git commit` ni `git push`.** Tampoco el commit inicial: el árbol se queda sin versionar y el usuario decide cuándo. Puedes ofrecerlo; no puedes hacerlo por tu cuenta.
- No crees el repositorio remoto ni configures el `origin` con un valor inventado.
- No pidas al usuario su token de GitHub ni ninguna otra credencial. Todo va por `.env.example` y por el README.

**Lo que documentas para que lo haga el usuario:** crear el repositorio **privado** en GitHub, ejecutar los comandos de arriba y, en Dokploy, autorizar el acceso mediante la GitHub App (recomendado, porque habilita el redespliegue automático) o mediante una clave de despliegue.

---

## 18. Entregables

1. **Proyecto Next.js funcional** con autenticación propia y las siete vistas (Panel, Agenda, Contactos, Conversaciones, Ajustes del Agente, Conexiones, Mi perfil) navegables y operativas, con **todos los estados y textos visibles en español** vía `lib/labels.ts` (§12).
2. **`docker-compose.yml`** de desarrollo con Postgres 18 + Adminer, healthcheck, volumen persistente y script de inicialización de roles y extensiones.
3. **Migraciones SQL versionadas** con RLS activado y forzado, políticas por `business_id`, restricción anti‑solapamiento de citas, triggers y registro atómico de negocio.
4. **Runner de migraciones** (`pnpm db:migrate`) y **semillero** (`pnpm db:seed`) con datos de demostración.
5. **Webhook de VAPI operativo**: las siete tools de función, `end-of-call-report` con los campos mapeados desde `analysis`/`artifact`, verificación por token Bearer, enrutado por negocio e idempotencia.
6. **Tools compartidas en VAPI**: script idempotente `pnpm vapi:tools:sync` que las crea/actualiza con sus `messages` de relleno y guarda los IDs en `vapi_tools`.
7. **CRM completo**: listado con búsqueda y filtros, alta, edición, borrado, ficha con cronología, y **creación automática de contactos desde las citas telefónicas**.
8. **Sincronización con VAPI** al publicar: crear/actualizar asistente con el **stack por defecto de §10.1** o con los modelos elegidos por el negocio, engancharle los `toolIds` y vincular número. Los identificadores por defecto, verificados contra la API, viven como constantes tipadas en `lib/vapi/defaults.ts`; el **catálogo completo de modelos** (§10.4) vive en `lib/vapi/catalog-data.generated.ts` (regenerado con `pnpm vapi:pull-catalog`) + `lib/vapi/model-catalog.ts` (metadatos y estimaciones), con su selector de desplegables con buscador y su gráfica de coste/latencia en «Ajustes del Agente».
9. **Compositor del system prompt** (`lib/vapi/prompt.ts`) que genera la plantilla completa de §10.3 —ejemplos y datos de contacto incluidos— a partir de la configuración del negocio, con su **editor Automático/Personalizado** (`system_prompt_override`) en «Ajustes del Agente».
10. **Llamada saliente** desde la ficha de contacto, con `metadata` para resolver el inquilino.
11. **Túnel de desarrollo con Tailscale**: scripts `pnpm tunnel` (PowerShell y shell), `pnpm vapi:sync` e **inspector de webhooks** en `/dev/webhooks` con reprocesado (§15).
12. **Paquete de despliegue**: `Dockerfile` multietapa en modo `standalone`, `.dockerignore`, `docker-entrypoint.sh` que migra antes de arrancar, `docker-compose.dokploy.yml` con `dokploy-network` y etiquetas de Traefik, y ruta `GET /api/health` (§16).
13. **Repositorio preparado**: `git init`, `.gitignore` sin secretos y `.github/workflows/ci.yml` con lint, tipos, build y la comprobación de que `CLAUDE.md` y `AGENTS.md` no han divergido. **Sin `git add`, sin commit, sin remoto y sin `push`** (§0.3, §17).
14. **`CLAUDE.md` y `AGENTS.md`** en la raíz, idénticos byte a byte, con el contenido que describe §0.3.
15. **`.env.example`** completo y comentado, **sin variables decorativas** (§13).
16. **`README.md`** con esta estructura: requisitos previos → `docker compose up -d` → `pnpm install` → configurar `.env` → `pnpm db:migrate` → `pnpm db:seed` → `pnpm dev` → **levantar el túnel de Tailscale** → **crear la Custom Credential en el dashboard de VAPI** → **verificar los identificadores del stack de modelos** (§10.1) → `pnpm vapi:tools:sync` → crear el asistente y el número → **publicar en GitHub** → **desplegar en Hostinger con Dokploy** → **cómo adaptar la plantilla a otro nicho** (qué fichero tocar exactamente, incluidos `[TIPO_NEGOCIO]` y `[DATOS_EXTRA]` de §10.3). Debe explicar con claridad **cómo conseguir un número español** (§14.3). Cierra con la tabla de diagnóstico de §16.5, la de fallos de VAPI de §14.6, la tabla de **versiones realmente instaladas** y la sección **«Desviaciones respecto al brief»** de §0.1.

---

## 19. Criterios de calidad

- **Compila y arranca.** `pnpm build` sin errores de TypeScript ni de ESLint. Si algo no puede funcionar sin una credencial real, degrada con elegancia y dilo por pantalla; no lo dejes reventando.
- **Una sola fuente de verdad para la disponibilidad**, compartida entre el agente y el panel.
- **Zonas horarias tratadas en serio**: almacena en `timestamptz` (UTC), presenta en la zona del negocio. Ningún cálculo de huecos puede depender de la zona del servidor.
- **Teléfonos siempre normalizados** antes de tocar la base de datos. Es lo que sostiene todo el CRM.
- Código modular: la lógica de negocio en `lib/`, no dentro de los componentes. Comentarios donde aporten contexto, no donde repitan el código.
- Interfaz limpia y coherente: una sola familia de iconos, una sola escala de espaciados, estados de carga y de error tratados en serio.
- Sin secretos en el cliente. Sin pseudocódigo. Sin dependencias no listadas salvo justificación escrita.
- **Nada de APIs inventadas.** Toda llamada a VAPI se contrasta con sus skills (§0.1) y toda API de librería con Context7 (§0.2). Si no lo has verificado, no lo escribas.
- **Un solo `pnpm build` y un solo `docker compose -f docker-compose.dokploy.yml build` deben funcionar sin tocar nada.** Si el despliegue exige un paso manual, es que falta escribirlo en el repositorio.
- **Paridad entre desarrollo y producción**: misma versión de Postgres, mismas extensiones, mismo script de roles. Lo único que cambia es dónde corre la aplicación y quién termina el TLS.
- `.gitignore` cubriendo `.env`, `.env.local`, `pgdata/`, `.next/` y `node_modules/`. Comprueba que no queda ningún secreto en el árbol de trabajo.
- **`CLAUDE.md` y `AGENTS.md` escritos, idénticos y al día** (§0.3). Si al terminar has tocado el esquema, las variables o el despliegue, deben reflejarlo ya.
- **Cero comandos de git ejecutados** más allá de `git init` (§0.3).
- **No pidas credenciales al usuario en ningún momento.** Crea el `.env.example` y explica en el README cómo obtener cada valor.
- Usa **pnpm**, no npm.

Al terminar, entrega un resumen breve con: qué has construido, **qué versiones has instalado realmente** frente a las del brief, qué te han corregido las skills de VAPI o Context7, y los pasos manuales que le quedan al usuario — versionar y publicar en GitHub, desplegar en Dokploy y provisionar el número en VAPI. Recuérdale que el proyecto está **sin commitear a propósito** y ofrécete a hacerlo si te lo pide.
