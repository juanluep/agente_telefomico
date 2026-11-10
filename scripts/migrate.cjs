// Runner de migraciones para el contenedor (§16.1). Lógica equivalente a
// scripts/migrate.ts pero en JS plano (sin tsx/zod) para correr en la imagen
// standalone con `node scripts/migrate.cjs`. Usa el rol PROPIETARIO
// (superuser, sin RLS) y pg_advisory_lock para serializar entre réplicas.
const pg = require("pg");
const fs = require("fs");
const path = require("path");

function ownerUrl() {
  const u = process.env.POSTGRES_USER;
  const p = process.env.POSTGRES_PASSWORD;
  const db = process.env.POSTGRES_DB;
  const host = process.env.DB_HOST || "db";
  const port = process.env.DB_PORT || 5432;
  return `postgresql://${encodeURIComponent(u)}:${encodeURIComponent(p)}@${host}:${port}/${encodeURIComponent(db)}?sslmode=disable`;
}

async function main() {
  const pool = new pg.Pool({ connectionString: ownerUrl() });
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id text PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT now()
      );
    `);
    await client.query("SELECT pg_advisory_lock(hashtextextended('voiceops-migrations', 0))");

    const applied = new Set((await client.query("SELECT id FROM schema_migrations")).rows.map((r) => r.id));
    const dir = path.join(__dirname, "..", "db", "migrations");
    const files = fs.readdirSync(dir).filter((f) => /^\d+_.+\.sql$/.test(f)).sort();

    let count = 0;
    for (const file of files) {
      const id = file.replace(/\.sql$/, "");
      if (applied.has(id)) continue;
      const sql = fs.readFileSync(path.join(dir, file), "utf8");
      try {
        await client.query("BEGIN");
        await client.query(sql);
        await client.query("INSERT INTO schema_migrations (id) VALUES ($1)", [id]);
        await client.query("COMMIT");
        count++;
        console.log("  ✓ " + id);
      } catch (err) {
        await client.query("ROLLBACK");
        console.error("  ✗ " + id + " falló: " + err.message);
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

main().catch((e) => {
  console.error(e);
  process.exit(1);
});