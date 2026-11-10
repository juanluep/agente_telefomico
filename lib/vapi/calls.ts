/**
 * Persistencia de llamadas y transcripción (§5, §14.1).
 *
 * Mapeo EXPLÍCITO de roles de VAPI a los nuestros:
 *   bot → assistant (lo que dice el agente en voz alta)
 *   user → user
 *   system → NO se persiste (es el system prompt entero; meterlo contamina el
 *            buscador y saca el prompt en pantalla)
 *   tool_calls / tool_call_result → tool (texto en `result`, no `message`)
 *
 * El anti-patrón `role desconocido → 'system'` mete TODA la voz del agente en
 * 'system' porque 'bot' no está en la lista, y la transcripción queda
 * inservible (§14.1). Aquí se hace bien.
 */
import type { PoolClient } from "pg";

import type { VapiMessage, ArtifactMessage } from "./messages";
import { normalizePhone } from "../phone";
import { env } from "../env";

type MsgRole = "assistant" | "user" | "tool";

function mapRole(role: string): MsgRole | null {
  switch (role) {
    case "bot": return "assistant";
    case "user": return "user";
    case "tool_calls":
    case "tool_call_result":
      return "tool";
    default: return null; // system y otros desconocidos se descartan
  }
}

function messageText(m: ArtifactMessage): string | null {
  if (m.role === "tool_call_result") {
    return (m as unknown as { result?: string }).result ?? m.content ?? null;
  }
  return m.message ?? m.content ?? m.transcript ?? null;
}

/** Inserta la llamada si no existe y devuelve su id. Idempotente por vapi_call_id. */
export async function ensureCallRow(
  client: PoolClient,
  businessId: string,
  input: { vapiCallId: string; direction?: string; fromNumber?: string | null; startedAt?: string | null; status?: string },
): Promise<string> {
  const existing = await client.query("SELECT id FROM calls WHERE vapi_call_id = $1", [input.vapiCallId]);
  if (existing.rowCount && existing.rowCount > 0) return existing.rows[0].id;
  const res = await client.query(
    `INSERT INTO calls (business_id, vapi_call_id, direction, from_number, started_at, status)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (vapi_call_id) DO UPDATE SET status = EXCLUDED.status
     RETURNING id`,
    [businessId, input.vapiCallId, input.direction ?? "inbound", input.fromNumber ?? null, input.startedAt ?? null, input.status ?? "queued"],
  );
  return res.rows[0].id;
}

export async function updateCallStatus(client: PoolClient, vapiCallId: string, status: string): Promise<void> {
  await client.query("UPDATE calls SET status = $1 WHERE vapi_call_id = $2", [status, vapiCallId]);
}

/** Marca la llamada como finalizada + transcripción + resumen + coste + grabación. */
export async function persistEndOfCall(
  client: PoolClient,
  businessId: string,
  message: VapiMessage,
  vapiCallId: string,
): Promise<void> {
  const country = env().DEFAULT_COUNTRY_CODE;
  const customerNumber = normalizePhone(message.call?.customer?.number, country) ?? null;

  // Vincular contacto si el número existe en el CRM.
  let contactId: string | null = null;
  if (customerNumber) {
    const c = await client.query("SELECT id FROM contacts WHERE business_id = $1 AND phone = $2", [businessId, customerNumber]);
    contactId = c.rows[0]?.id ?? null;
  }

  const summary = message.analysis?.summary ?? null;
  const costCents = typeof message.cost === "number" ? Math.round(message.cost * 100) : null;
  const recordingUrl = message.artifact?.recordingUrl ?? null;

  await client.query(
    `UPDATE calls SET
       contact_id = COALESCE(contact_id, $2),
       status = 'ended',
       ended_reason = $3,
       summary = $4,
       cost_cents = COALESCE(cost_cents, $5),
       recording_url = COALESCE(recording_url, $6),
       started_at = COALESCE(started_at, $7),
       ended_at = COALESCE(ended_at, $8)
     WHERE vapi_call_id = $1`,
    [
      vapiCallId, contactId, message.endedReason ?? null,
      summary, costCents, recordingUrl,
      message.startedAt ?? null, message.endedAt ?? null,
    ],
  );

  // Transcripción turno a turno (mapeo explícito de roles; sin 'system').
  const messages = message.artifact?.messages ?? [];
  let order = 0;
  let secs = 0;
  for (const m of messages) {
    const role = mapRole(m.role);
    if (!role) continue; // descarta system y otros
    const content = messageText(m);
    if (!content) continue;
    secs = typeof m.secondsFromStart === "number" ? Math.round(m.secondsFromStart) : secs;
    await client.query(
      `INSERT INTO call_messages (business_id, call_id, role, content, seconds_from_start, sort_order)
       VALUES ($1, (SELECT id FROM calls WHERE vapi_call_id = $2), $3, $4, $5, $6)`,
      [businessId, vapiCallId, role, content, secs, order],
    );
    order += 1;
  }
}