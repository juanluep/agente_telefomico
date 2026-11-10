/**
 * Runner de migraciones SQL plano (§2). Idempotente: tabla schema_migrations,
 * cada fichero NNNN_*.sql envuelto en transacción, bloqueo consultivo para que
 * dos instancias no migren a la vez (relevantes en Dokploy con varias réplicas).
 *
 * Corre con el rol PROPIETARIO (superuser), que salta RLS. La app, en cambio,
 * se conecta como app_user y RLS la aisla. Esta separación es lo que hace que
 * el aislamiento por negocio sea real (§5).
 */
process.loadEnvFile?.();

import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

import { ownerDatabaseUrl } from "../lib/env";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(__dirname, "..", "db", "migrations");

async function main() {
  const { Pool } = pg;
  const pool = new Pool({ connectionString: ownerDatabaseUrl() });
  const client = await pool.connect();

  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id       text PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT now()
      );
    `);

    // Bloqueo consultivo de sesión: serializa migraciones en este proceso.
    await client.query("SELECT pg_advisory_lock(hashtextextended('voiceops-migrations', 0))");

    const applied = new Set<string>(
      (await client.query("SELECT id FROM schema_migrations")).rows.map((r: { id: string }) => r.id),
    );

    const files = (await readdir(MIGRATIONS_DIR))
      .filter((f) => /^\d+_.+\.sql$/.test(f))
      .sort();

    let count = 0;
    for (const file of files) {
      const id = file.replace(/\.sql$/, "");
      if (applied.has(id)) continue;

      const sql = await readFile(join(MIGRATIONS_DIR, file), "utf8");
      try {
        await client.query("BEGIN");
        await client.query(sql);
        await client.query("INSERT INTO schema_migrations (id) VALUES ($1)", [id]);
        await client.query("COMMIT");
        count++;
        console.log(`  ✓ ${id}`);
      } catch (err) {
        await client.query("ROLLBACK");
        console.error(`  ✗ ${id} falló:`, err instanceof Error ? err.message : err);
        throw err;
      }
    }
    console.log(count === 0 ? "No hay migraciones pendientes." : `Aplicadas ${count} migración(es).`);
  } finally {
    await client.query("SELECT pg_advisory_unlock(hashtextextended('voiceops-migrations', 0))").catch(() => {});
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});