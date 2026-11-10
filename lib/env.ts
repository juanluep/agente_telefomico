import { z } from "zod";

/**
 * Validación de entorno al arrancar. Un despliegue mal configurado debe
 * fallar aquí, con un mensaje claro, en lugar de romperse a mitad de una
 * llamada. Criterio (§13): aquí solo secretos y cosas que cambian entre
 * máquinas; el resto (modelos, voces, tonos por defecto) es código en
 * lib/vapi/defaults.ts.
 *
 * Context7 no está disponible en este entorno (ver README, «Desviaciones»);
 * la forma de zod se verificó contra el registro público de npm y los docs
 * de Zod 4.
 */

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),

  // ── Base de datos ──
  POSTGRES_USER: z.string().min(1),
  POSTGRES_PASSWORD: z.string().min(1),
  POSTGRES_DB: z.string().min(1),
  DB_HOST: z.string().min(1).default("localhost"),
  DB_PORT: z.coerce.number().int().min(1).max(65535).default(5432),
  APP_DB_USER: z.string().min(1),
  APP_DB_PASSWORD: z.string().min(1),

  // ── Aplicación ──
  APP_URL: z.url(),
  APP_DOMAIN: z.string().optional().default(""),

  // ── VAPI ──
  VAPI_API_KEY: z.string().optional().default(""),
  VAPI_SERVER_CREDENTIAL_ID: z.string().optional().default(""),
  VAPI_WEBHOOK_TOKEN: z.string().optional().default(""),

  // ── Localización ──
  DEFAULT_TIMEZONE: z.string().min(1).default("Europe/Madrid"),
  DEFAULT_COUNTRY_CODE: z.string().min(1).max(4).default("ES"),
});

export type Env = z.infer<typeof envSchema>;

function buildEnv(): Env {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const flat = parsed.error.issues
      .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`Configuración de entorno inválida:\n${flat}`);
  }
  const env = parsed.data;

  // APP_DOMAIN debe ser el host de APP_URL (solo importa en producción, pero
  // se valida siempre para detectar errores temprano).
  if (env.APP_DOMAIN) {
    const host = (() => {
      try {
        return new URL(env.APP_URL).host;
      } catch {
        return "";
      }
    })();
    if (host && host !== env.APP_DOMAIN) {
      throw new Error(
        `APP_DOMAIN ("${env.APP_DOMAIN}") no coincide con el host de APP_URL ("${host}").`,
      );
    }
  }

  return env;
}

let cached: Env | null = null;

/** Entorno validado y cacheado. Lanza de inmediato si algo falta. */
export function env(): Env {
  if (!cached) cached = buildEnv();
  return cached;
}

/** URL de conexión para el rol propietario (migraciones): voz total. */
export function ownerDatabaseUrl(): string {
  const e = env();
  return `postgresql://${encodeURIComponent(e.POSTGRES_USER)}:${encodeURIComponent(
    e.POSTGRES_PASSWORD,
  )}@${e.DB_HOST}:${e.DB_PORT}/${encodeURIComponent(e.POSTGRES_DB)}?sslmode=disable`;
}

/** URL de conexión para la aplicación: rol app_user sin BYPASSRLS. */
export function appDatabaseUrl(): string {
  const e = env();
  return `postgresql://${encodeURIComponent(e.APP_DB_USER)}:${encodeURIComponent(
    e.APP_DB_PASSWORD,
  )}@${e.DB_HOST}:${e.DB_PORT}/${encodeURIComponent(e.POSTGRES_DB)}?sslmode=disable`;
}

/** La ruta pública del webhook, compuesta desde APP_URL. */
export function webhookUrl(): string {
  return `${env().APP_URL.replace(/\/$/, "")}/api/vapi/webhook`;
}

/** true cuando VAPI tiene todo lo que hace falta para publicar. */
export function vapiConfigured(): boolean {
  const e = env();
  return Boolean(e.VAPI_API_KEY && e.VAPI_SERVER_CREDENTIAL_ID && e.VAPI_WEBHOOK_TOKEN);
}