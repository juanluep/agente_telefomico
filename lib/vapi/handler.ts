/**
 * Núcleo del webhook (§4.5). Verificación, resolución de inquilino, idempotencia
 * y despacho a tools / persistencia. El route HTTP está en app/api/vapi/webhook.
 * Este módulo se exporta también para que el inspector /dev/webhooks pueda
 * reprocesar un payload saltándose la idempotencia (§15.5).
 */
import { withTenant } from "../db/tenant";
import { resolveBusinessId } from "./resolve";
import { handleToolCalls } from "./tools";
import { ensureCallRow, persistEndOfCall, updateCallStatus } from "./calls";
import { normalizePhone } from "../phone";
import { env } from "../env";
import type { VapiMessage } from "./messages";

export interface ProcessResult {
  status: number;
  body: unknown;
}

function externalId(message: VapiMessage): string {
  const callId = message.call?.id ?? "unknown";
  switch (message.type) {
    case "tool-calls":
      return `tc:${callId}:${(message.toolCallList ?? []).map((t) => t.id).sort().join(",")}`;
    case "status-update":
      return `su:${callId}:${message.status ?? "?"}`;
    case "end-of-call-report":
      return `eocr:${callId}`;
    default:
      return `${message.type}:${callId}`;
  }
}

async function markEvent(
  client: Parameters<Parameters<typeof withTenant>[1]>[0],
  businessId: string,
  external: string,
  eventType: string,
  payload: VapiMessage,
): Promise<boolean> {
  // true si esta instancia debe procesar; false si ya estaba procesado.
  const res = await client.query(
    `INSERT INTO webhook_events (business_id, provider, event_type, external_id, payload)
     VALUES ($1, 'vapi', $2, $3, $4)
     ON CONFLICT (external_id) DO NOTHING
     RETURNING id, processed_at`,
    [businessId, eventType, external, JSON.stringify(payload)],
  );
  if (res.rowCount && res.rowCount > 0) return true; // nuevo
  // ya existía: solo reprocesamos si NO estaba marcado como procesado.
  const existing = await client.query<{ processed_at: Date | string | null }>(
    "SELECT processed_at FROM webhook_events WHERE external_id = $1",
    [external],
  );
  return !existing.rows[0]?.processed_at;
}

export async function processVapiMessage(
  message: VapiMessage,
  opts: { skipIdempotency?: boolean } = {},
): Promise<ProcessResult> {
  // Resolver inquilino (fuera de withTenant, vía función SECURITY DEFINER).
  const businessId = await resolveBusinessId(message);
  if (!businessId) return { status: 404, body: { error: "unknown-business" } };

  const extId = externalId(message);
  const customerNumber = normalizePhone(message.call?.customer?.number, env().DEFAULT_COUNTRY_CODE);
  const callId = message.call?.id ?? null;

  return withTenant(businessId, async (client) => {
    if (!opts.skipIdempotency) {
      const should = await markEvent(client, businessId, extId, message.type, message);
      if (!should) return { status: 200, body: {} }; // ya procesado
    }

    try {
      switch (message.type) {
        case "tool-calls": {
          const out = await handleToolCalls(client, businessId, callId ?? "", customerNumber, message.toolCallList ?? []);
          return { status: 200, body: out };
        }
        case "status-update": {
          if (callId) {
            await ensureCallRow(client, businessId, { vapiCallId: callId, fromNumber: customerNumber, status: message.status ?? "queued" });
            if (message.status) await updateCallStatus(client, callId, message.status);
          }
          return { status: 200, body: {} };
        }
        case "end-of-call-report": {
          if (callId) {
            await ensureCallRow(client, businessId, { vapiCallId: callId, fromNumber: customerNumber, status: "ended", startedAt: message.startedAt });
            await persistEndOfCall(client, businessId, message, callId);
          }
          return { status: 200, body: {} };
        }
        default:
          return { status: 200, body: {} };
      }
    } catch (err) {
      console.error(`[vapi] ${message.type} falló:`, err);
      await client
        .query("UPDATE webhook_events SET error = $2 WHERE external_id = $1", [extId, err instanceof Error ? err.message : "error"])
        .catch(() => {});
      // En tool-calls, responder con resultados verbales; en el resto, 200 vacío.
      if (message.type === "tool-calls") {
        const results = (message.toolCallList ?? []).map((t) => ({
          toolCallId: t.id,
          result: "Ahora mismo no puedo consultar la agenda. ¿Te llamamos nosotros en cuanto podamos?",
        }));
        return { status: 200, body: { results } };
      }
      return { status: 200, body: {} };
    } finally {
      if (!opts.skipIdempotency) {
        await client
          .query("UPDATE webhook_events SET processed_at = now() WHERE external_id = $1", [extId])
          .catch(() => {});
      }
    }
  });
}