import { NextResponse, type NextRequest } from "next/server";

import { requireSession } from "../../../../lib/auth/context";
import { withTenant } from "../../../../lib/db/tenant";
import { env } from "../../../../lib/env";
import { normalizePhone } from "../../../../lib/phone";

export async function POST(request: NextRequest): Promise<NextResponse> {
  const { contactId } = (await request.json().catch(() => ({}))) as { contactId?: string };
  if (!contactId) return NextResponse.json({ error: "Falta contactId." }, { status: 400 });

  const ctx = await requireSession();
  const e = env();
  if (!e.VAPI_API_KEY) return NextResponse.json({ error: "VAPI no está configurado." }, { status: 503 });

  return withTenant(ctx.businessId, async (client) => {
    const contact = (
      await client.query<{ phone: string | null; outbound_consent: boolean; full_name: string | null }>(
        "SELECT phone, outbound_consent, full_name FROM contacts WHERE id = $1 AND business_id = $2",
        [contactId, ctx.businessId],
      )
    ).rows[0];
    if (!contact) return NextResponse.json({ error: "Contacto no encontrado." }, { status: 404 });
    if (!contact.phone) return NextResponse.json({ error: "El contacto no tiene teléfono." }, { status: 400 });
    // Consentimiento RGPD/LSSI (§14.4): no llamar a quien no lo haya autorizado.
    if (!contact.outbound_consent) {
      return NextResponse.json({ error: "El contacto no ha consentido llamadas salientes." }, { status: 400 });
    }

    const va = (
      await client.query<{ vapi_assistant_id: string | null; vapi_phone_number_id: string | null }>(
        "SELECT vapi_assistant_id, vapi_phone_number_id FROM voice_agents WHERE business_id = $1",
        [ctx.businessId],
      )
    ).rows[0];
    if (!va?.vapi_assistant_id) {
      return NextResponse.json({ error: "Publica el asistente en Conexiones antes de llamar." }, { status: 400 });
    }
    if (!va.vapi_phone_number_id) {
      return NextResponse.json({ error: "Vincula un número de teléfono en Conexiones antes de llamar." }, { status: 400 });
    }

    const number = normalizePhone(contact.phone) ?? contact.phone;
    const res = await fetch("https://api.vapi.ai/call", {
      method: "POST",
      headers: { Authorization: `Bearer ${e.VAPI_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        assistantId: va.vapi_assistant_id,
        phoneNumberId: va.vapi_phone_number_id,
        customer: { number, name: contact.full_name ?? undefined },
        // metadata determinista para resolver el inquilino al volver el webhook (§14.2)
        metadata: { businessId: ctx.businessId, contactId },
      }),
    });
    if (!res.ok) {
      return NextResponse.json({ error: `VAPI rechazó la llamada: ${res.status} ${await res.text()}` }, { status: 502 });
    }
    const created = (await res.json()) as { id: string };
    return NextResponse.json({ ok: true, callId: created.id });
  });
}