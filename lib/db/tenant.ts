/**
 * withTenant — la ÚNICA puerta a los datos de un inquilino (§5, §7).
 *
 * Abre una transacción, fija el negocio con set_config('app.business_id', $1,
 * true) — PARAMETRIZADO: SET LOCAL no admite parámetros y concatenar el valor
 * sería inyectable — y ejecuta dentro las consultas. Cada política RLS
 * compara contra current_setting('app.business_id', true)::uuid.
 *
 * Regla dura (CLAUDE.md): ninguna consulta de la aplicación se ejecuta fuera
 * de withTenant, salvo auth y el webhook (camino explícito y auditado).
 */
import type { PoolClient, QueryResult, QueryResultRow } from "pg";

import { pool } from "./pool";

export async function withTenant<T>(
  businessId: string,
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // set_config con is_local=true ≡ SET LOCAL, pero admite parámetro ($1).
    await client.query("SELECT set_config('app.business_id', $1, true)", [businessId]);
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

/** Ejecuta una sola sentencia bajo contexto de inquilino. */
export async function tenantQuery<R extends QueryResultRow = QueryResultRow>(
  businessId: string,
  text: string,
  params: unknown[] = [],
): Promise<QueryResult<R>> {
  return withTenant(businessId, (c) => c.query<R>(text, params));
}