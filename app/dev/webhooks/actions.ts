"use server";

import { redirect } from "next/navigation";

import { withTenant } from "../../../lib/db/tenant";
import { requireSession } from "../../../lib/auth/context";
import { processVapiMessage } from "../../../lib/vapi/handler";
import type { VapiMessage } from "../../../lib/vapi/messages";

export async function replayAction(eventId: string): Promise<{ ok: boolean; detail: string }> {
  const ctx = await requireSession();

  // Solo fuera de producción (§15.4).
  if (process.env.NODE_ENV === "production") {
    return { ok: false, detail: "El inspector no está disponible en producción." };
  }

  const row = await withTenant(ctx.businessId, (c) =>
    c.query<{ payload: VapiMessage; event_type: string }>(
      "SELECT payload, event_type FROM webhook_events WHERE id = $1",
      [eventId],
    ),
  );
  const ev = row.rows[0];
  if (!ev) return { ok: false, detail: "Evento no encontrado." };

  try {
    const payload = typeof ev.payload === "string" ? (JSON.parse(ev.payload) as VapiMessage) : (ev.payload as VapiMessage);
    const res = await processVapiMessage(payload, { skipIdempotency: true });
    return { ok: true, detail: `Reprocesado: HTTP ${res.status}` };
  } catch (err) {
    return { ok: false, detail: err instanceof Error ? err.message : "error" };
  }
}

export async function ensureDev(): Promise<void> {
  if (process.env.NODE_ENV === "production") redirect("/panel");
}