/**
 * Tools del agente de voz que resuelven contra nuestro webhook (§9). La
 * frontera de confianza (§9.1): el número del llamante y el negocio salen del
 * payload (message.call.customer.number / resolve_business), NUNCA como
 * parámetro que rellene el modelo. Solo lo que el cliente elige libremente
 * (servicio, fecha, nombre, notas) es un parámetro validado con Zod.
 *
 * El result va redactado para leerse en voz alta (§9.6): fechas y horas en
 * español natural, corto, sin objetos crudos ni ISO sin traducir. Si los
 * argumentos vienen mal, se devuelve algo que el agente pueda decir — nunca
 * una traza de error.
 */
import { z } from "zod";
import type { PoolClient } from "pg";

import { extractToolArgs, extractToolName, type ToolCallItem } from "../messages";
import { loadAvailabilityContext, resolveServiceDuration, resolveServiceDurationDays } from "../../scheduling/loader";
import { findSlots } from "../../scheduling/availability";
import { bookAppointment } from "../../scheduling/booking";
import {
  upsertContactForCall,
  addAgentContactNote,
} from "../../crm/upsert-contact";
import { ensureCallRow } from "../calls";
import { dayRangeSpoken, spokenDateTime } from "../../format";
import { env } from "../../env";

export interface ToolContext {
  businessId: string;
  callId: string;
  customerNumber: string | null; // de message.call.customer.number (servidor)
  timezone: string;
}

type Handler = (client: PoolClient, ctx: ToolContext, args: Record<string, unknown>) => Promise<string>;

// ── Schemas de cada tool ───────────────────────────────────────────

const isoDatetime = z.string().datetime({ offset: true, local: true });

const sHuecos = z.object({
  servicio: z.string().optional(),
  fechaPreferida: isoDatetime.optional(),
  franja: z.enum(["manana", "tarde", "cualquiera"]).optional(),
  diasVista: z.number().int().min(1).max(30).optional(),
  duracionDias: z.number().int().min(1).max(30).optional(),
});

const sReservar = z.object({
  inicioIso: isoDatetime,
  servicio: z.string().min(1),
  nombre: z.string().min(1),
  email: z.email().optional(),
  notas: z.string().optional(),
  duracionDias: z.number().int().min(1).max(30).optional(),
  datosExtra: z.record(z.string(), z.unknown()).optional(),
});

const sReprogramar = z.object({
  nuevoInicioIso: isoDatetime,
  citaId: z.uuid().optional(),
});

const sAnular = z.object({
  citaId: z.uuid().optional(),
  motivo: z.string().optional(),
});

const sHandoff = z.object({ motivo: z.string().min(1) });

// ── Handlers ──────────────────────────────────────────────────────

const identificarLlamante: Handler = async (client, ctx) => {
  if (!ctx.customerNumber) return "No nos ha llegado el número. ¿Puedes repetir cómo te llamas?";
  const c = await client.query<{ id: string; full_name: string }>(
    "SELECT id, full_name FROM contacts WHERE business_id = $1 AND phone = $2 LIMIT 1",
    [ctx.businessId, ctx.customerNumber],
  );
  const row = c.rows[0];
  if (!row) return "Persona nueva. Pide su nombre y por qué llama, y le ofrezco cita si quiere.";
  const next = await client.query<{ service_name: string }>(
    `SELECT service_name FROM appointments
     WHERE business_id = $1 AND contact_id = $2 AND status IN ('agendada','confirmada') AND starts_at >= now()
     ORDER BY starts_at LIMIT 1`,
    [ctx.businessId, row.id],
  );
  const n = next.rows[0];
  return n
    ? `Es ${row.full_name}, cliente recurrente. Tiene una cita próxima de ${n.service_name}. Salúdalo por el nombre y no vuelvas a pedirle datos.`
    : `Es ${row.full_name}. Salúdalo por el nombre y no vuelvas a pedirle lo que ya tienes.`;
};

const consultarHuecos: Handler = async (client, ctx, args) => {
  const parsed = sHuecos.safeParse(args);
  if (!parsed.success) return "No he entendido lo de la fecha. ¿Me la repites?";
  const { servicio, fechaPreferida, franja, diasVista, duracionDias } = parsed.data;
  const av = await loadAvailabilityContext(client, ctx.businessId);
  if (av.mode === "dias") {
    const serviceDays = servicio ? (await resolveServiceDurationDays(client, ctx.businessId, servicio)) : null;
    const days = duracionDias ?? serviceDays ?? 1;
    const slots = findSlots(av, { serviceDurationMinutes: 60, serviceDurationDays: days, fechaPreferida, diasVista });
    if (slots.length === 0) return "No tengo días libres en esas fechas. ¿Te viene bien buscar otra semana?";
    const partes = slots.map((s) => s.texto).join(", ");
    return `Tengo ${slots.length === 1 ? "un día libre" : "varios días libres"}: ${partes}. ¿Cuál te viene mejor?`;
  }
  const duration = (servicio ? await resolveServiceDuration(client, ctx.businessId, servicio) : null) ?? 60;
  const slots = findSlots(av, { serviceDurationMinutes: duration, fechaPreferida, franja, diasVista });
  if (slots.length === 0) return "No tengo huecos en esos días. ¿Te viene bien buscar otra semana?";
  const partes = slots.map((s) => s.texto).join(", ");
  return `Tengo ${slots.length === 1 ? "un hueco" : "varios huecos"}: ${partes}. ¿Cuál te viene mejor?`;
};

const reservarCita: Handler = async (client, ctx, args) => {
  const parsed = sReservar.safeParse(args);
  if (!parsed.success) return "No he entendido algún dato de la reserva. ¿Puedes repetir día, servicio y nombre?";
  const { inicioIso, servicio, nombre, email, notas, duracionDias, datosExtra } = parsed.data;
  const av = await loadAvailabilityContext(client, ctx.businessId);
  // Duración del servicio (si lo encontramos) — revalida dentro de bookAppointment.
  let duration = 60;
  let durationDays: number | undefined;
  if (av.mode === "dias") {
    const serviceDays = servicio ? (await resolveServiceDurationDays(client, ctx.businessId, servicio)) : null;
    durationDays = duracionDias ?? serviceDays ?? 1;
    duration = durationDays * 24 * 60;
  } else {
    duration = (await resolveServiceDuration(client, ctx.businessId, servicio)) ?? 60;
  }
  const phone = ctx.customerNumber;
  const upsert = await upsertContactForCall(client, ctx.businessId, {
    phone,
    fullName: nombre,
    email: email ?? null,
    customFields: datosExtra ?? null,
  });
  const booked = await bookAppointment(client, ctx.businessId, {
    inicioIso,
    serviceName: servicio,
    durationMinutes: duration,
    durationDays,
    contactId: upsert.contactId,
    callId: ctx.callId,
    notes: [notas, datosExtra ? `Extra: ${JSON.stringify(datosExtra)}` : null].filter(Boolean).join("  · ") || null,
    createdVia: "agente_voz",
  });
  if (!booked.ok) {
    if (booked.alternatives.length) {
      return `Esas fechas ya no están libres. ${booked.alternatives.map((s) => s.texto).join(", ")}. ¿Te sirve alguna?`;
    }
    return "Ahora mismo no puedo reservar esa fecha. ¿Te llamamos nosotros en cuanto podamos?";
  }
  const texto = av.mode === "dias"
    ? dayRangeSpoken(booked.startsAt!, booked.endsAt!, ctx.timezone, durationDays ?? 1)
    : spokenDateTime(inicioIso, ctx.timezone);
  await addAgentContactNote(client, ctx.businessId, upsert.contactId, `Reserva de ${servicio} agendada por el agente de voz para ${texto}.`);
  return `Hecho. ${servicio} reservado para ${texto}. Te esperamos.`;
};

const reprogramarCita: Handler = async (client, ctx, args) => {
  const parsed = sReprogramar.safeParse(args);
  if (!parsed.success) return "No he entendido la nueva fecha. ¿Me la repites?";
  const { nuevoInicioIso } = parsed.data;
  // Localiza la próxima cita DE ESE NÚMERO (no por id que diga el modelo).
  if (!ctx.customerNumber) return "No tengo el número para localizar tu cita. ¿Puedes decírmelo?";
  const appt = await client.query<{ id: string; contact_id: string | null; service_name: string }>(
    `SELECT a.id, a.contact_id, a.service_name FROM appointments a
     JOIN contacts c ON c.id = a.contact_id
     WHERE a.business_id = $1 AND c.phone = $2
       AND a.status IN ('agendada','confirmada') AND a.starts_at >= now()
     ORDER BY a.starts_at LIMIT 1`,
    [ctx.businessId, ctx.customerNumber],
  );
  const row = appt.rows[0];
  if (!row) return "No tengo ninguna reserva próxima con tu número. ¿Quieres que agendemos una nueva?";
  const av = await loadAvailabilityContext(client, ctx.businessId);
  const svc = (await client.query<{ duration_minutes: number; duration_days: number | null }>(
    "SELECT duration_minutes, duration_days FROM services WHERE business_id=$1 AND name ILIKE $2", [ctx.businessId, row.service_name],
  )).rows[0];
  const duration = svc?.duration_minutes ?? 60;
  const durationDays = av.mode === "dias" ? (svc?.duration_days ?? 1) : undefined;
  const booked = await bookAppointment(client, ctx.businessId, {
    inicioIso: nuevoInicioIso,
    serviceName: row.service_name,
    durationMinutes: duration,
    durationDays,
    contactId: row.contact_id ?? null,
    createdVia: "agente_voz",
  });
  if (!booked.ok) return "Esa nueva fecha no está libre. ¿Te ofrezco otras?";
  await client.query(
    "UPDATE appointments SET status='anulada', notes=COALESCE(notes,'') || $2 WHERE id=$1",
    [row.id, ` · Reprogramada a ${av.mode === "dias" ? dayRangeSpoken(nuevoInicioIso, nuevoInicioIso, ctx.timezone, durationDays ?? 1) : spokenDateTime(nuevoInicioIso, ctx.timezone)}`],
  );
  return `Hecho. He movido tu reserva de ${row.service_name} para ${av.mode === "dias" ? dayRangeSpoken(nuevoInicioIso, nuevoInicioIso, ctx.timezone, durationDays ?? 1) : spokenDateTime(nuevoInicioIso, ctx.timezone)}.`;
};

const anularCita: Handler = async (client, ctx, args) => {
  const parsed = sAnular.safeParse(args);
  if (!parsed.success) return "No he entendido el motivo. ¿Puedes repetirlo?";
  const { motivo } = parsed.data;
  if (!ctx.customerNumber) return "No tengo el número para localizar tu cita. ¿Puedes decírmelo?";
  const appt = await client.query<{ id: string; service_name: string }>(
    `SELECT a.id, a.service_name FROM appointments a
     JOIN contacts c ON c.id = a.contact_id
     WHERE a.business_id = $1 AND c.phone = $2
       AND a.status IN ('agendada','confirmada') AND a.starts_at >= now()
     ORDER BY a.starts_at LIMIT 1`,
    [ctx.businessId, ctx.customerNumber],
  );
  const row = appt.rows[0];
  if (!row) return "No tengo ninguna cita próxima con tu número. Si quieres, agendamos una nueva.";
  await client.query("UPDATE appointments SET status='anulada', notes=COALESCE(notes,'')||$2 WHERE id=$1", [row.id, motivo ? ` · Anulada: ${motivo}` : " · Anulada"]);
  return `Hecho. He anulado tu cita de ${row.service_name}. Si quieres otra, dímelo.`;
};

const datosDelNegocio: Handler = async (client, ctx, _args) => {
  const b = await client.query("SELECT name, address, phone, email, website FROM businesses WHERE id=$1", [ctx.businessId]);
  const hours = await client.query("SELECT weekday, opens_at, closes_at, is_closed FROM business_hours WHERE business_id=$1 ORDER BY weekday, opens_at", [ctx.businessId]);
  const services = await client.query("SELECT name, duration_minutes, price_cents FROM services WHERE business_id=$1 AND is_active ORDER BY sort_order", [ctx.businessId]);
  const facts = await client.query("SELECT question, answer FROM business_facts WHERE business_id=$1 ORDER BY sort_order", [ctx.businessId]);
  const bz = b.rows[0];
  const parts: string[] = [];
  if (bz?.address) parts.push(`Dirección: ${bz.address}.`);
  if (hours.rows.length) {
    const txt = hours.rows.map((h: { weekday: number; opens_at: string; closes_at: string; is_closed: boolean }) =>
      h.is_closed ? `cierra` : `${h.opens_at.slice(0,5)} a ${h.closes_at.slice(0,5)}`).join(", ");
    parts.push(`Horario: ${txt}.`);
  }
  if (services.rows.length) {
    parts.push("Servicios: " + services.rows.map((s: { name: string; duration_minutes: number; price_cents: number | null }) =>
      `${s.name} (${s.duration_minutes} min${s.price_cents ? `, ${Math.round(s.price_cents/100)} euros` : ""})`).join("; ") + ".");
  }
  if (facts.rows.length) parts.push("Preguntas frecuentes: " + facts.rows.map((f: { question: string; answer: string }) => `${f.question}: ${f.answer}`).join("; ") + ".");
  return parts.join(" ") || "No tengo la ficha del negocio rellena.";
};

const registrarHandoff: Handler = async (client, ctx, args) => {
  const parsed = sHandoff.safeParse(args);
  if (!parsed.success) return "No he entendido el motivo para derivar. ¿Puedes repetirlo?";
  const va = await client.query("SELECT handoff_number FROM voice_agents WHERE business_id=$1", [ctx.businessId]);
  const hasHandoff = Boolean(va.rows[0]?.handoff_number);
  await client.query("UPDATE calls SET needs_review = true WHERE id=$1", [ctx.callId]);
  if (ctx.customerNumber) {
    const c = await client.query("SELECT id FROM contacts WHERE business_id=$1 AND phone=$2", [ctx.businessId, ctx.customerNumber]);
    if (c.rows[0]) {
      await addAgentContactNote(client, ctx.businessId, c.rows[0].id, `Derivación pedida: ${parsed.data.motivo}.${hasHandoff ? "" : " Sin número de derivación configurado; revisar."}`);
    }
  }
  return hasHandoff
    ? "Anotado. Ahora te paso con una persona."
    : "Anotado. No hay número de derivación configurado; les decimos que devolveremos la llamada en cuanto podamos.";
};

const HANDLERS: Record<string, Handler> = {
  identificarLlamante,
  consultarHuecos,
  reservarCita,
  reprogramarCita,
  anularCita,
  datosDelNegocio,
  registrarHandoff,
};

/** Despacha un evento tool-calls y empareja resultados por toolCallId. */
export async function handleToolCalls(
  client: PoolClient,
  businessId: string,
  vapiCallId: string,
  customerNumber: string | null,
  toolCallList: ToolCallItem[],
): Promise<{ results: { toolCallId: string; result: string }[] }> {
  // Asegura la fila de llamada para poder enlazar la cita y needs_review.
  const callId = await ensureCallRow(client, businessId, { vapiCallId, fromNumber: customerNumber, status: "in-progress" });
  const tzRes = await client.query("SELECT timezone FROM businesses WHERE id=$1", [businessId]);
  const ctx: ToolContext = {
    businessId,
    callId,
    customerNumber,
    timezone: tzRes.rows[0]?.timezone ?? env().DEFAULT_TIMEZONE,
  };

  const results: { toolCallId: string; result: string }[] = [];
  for (const tc of toolCallList) {
    const name = extractToolName(tc);
    if (!name || !HANDLERS[name]) {
      results.push({ toolCallId: tc.id, result: "No tengo esa herramienta disponible." });
      continue;
    }
    const args = extractToolArgs(tc);
    try {
      const result = await HANDLERS[name]!(client, ctx, args);
      results.push({ toolCallId: tc.id, result });
    } catch (err) {
      console.error(`tool ${name} falló:`, err);
      results.push({ toolCallId: tc.id, result: "Ahora mismo no puedoconsultar la agenda. ¿Te llamamos nosotros en cuanto podamos?" });
    }
  }
  return { results };
}