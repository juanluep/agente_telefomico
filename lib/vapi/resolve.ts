/**
 * Resuelve a qué negocio pertenece una llamada del webhook (§4.5), usando la
 * función SECURITY DEFINER resolve_business que salta RLS (camino explícito y
 * auditado, §5). Si no se puede resolver → el webhook responde 404 sin tocar DB.
 */
import type { VapiMessage } from "./messages";
import { pool } from "../db/pool";

export async function resolveBusinessId(message: VapiMessage): Promise<string | null> {
  const call = message.call ?? {};
  const md = call.metadata ?? {};
  const businessId =
    typeof md.businessId === "string" ? md.businessId :
    typeof md.business_id === "string" ? md.business_id :
    null;

  const res = await pool.query("SELECT resolve_business($1, $2, $3, $4) AS bid", [
    businessId,
    call.assistantId ?? null,
    call.phoneNumberId ?? null,
    call.id ?? null,
  ]);
  return (res.rows[0]?.bid as string | undefined) ?? null;
}