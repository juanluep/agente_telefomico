/**
 * Pool de Postgres único, reutilizado entre hot reloads en desarrollo.
 * La aplicación se conecta como app_user (sin BYPASSRLS): el aislamiento lo
 * hace RLS (§5), no el nivel de privilegio.
 */
import pg from "pg";

import { appDatabaseUrl } from "../env";

const globalForPg = globalThis as unknown as { __voiceopsPgPool?: pg.Pool };

export const pool: pg.Pool =
  globalForPg.__voiceopsPgPool ??
  new pg.Pool({
    connectionString: appDatabaseUrl(),
    max: 10,
    idleTimeoutMillis: 30_000,
  });

if (process.env.NODE_ENV !== "production") {
  globalForPg.__voiceopsPgPool = pool;
}

pool.on("error", (err) => {
  console.error("Postgres pool error:", err.message);
});