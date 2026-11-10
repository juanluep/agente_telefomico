/**
 * Reserva de cita — vía transaccional anti-solapamiento (§5). Todo dentro de la
 * transacción de withTenant:
 *   1. pg_advisory_xact_lock por negocio — un SELECT FOR UPDATE no basta: dos
 *      inserciones simultáneas en un hueco vacío no se ven entre sí.
 *   2. recuento de citas solapadas no anuladas frente a slot_capacity.
 *   3. revalidación de horario/cierres/antelación con la MISMA lib que el agente.
 * Si el hueco se ocupó entre medias, NO se devuelve error: se devuelven
 * alternativas (§9.2), para que el agente se las ofrezca al cliente.
 */
import type { PoolClient } from "pg";
import { DateTime } from "luxon";

import { findSlots } from "./availability";
import { loadAvailabilityContext } from "./loader";
import type { AvailabilityContext, SlotOption } from "./availability";

export interface BookAppointmentInput {
  inicioIso: string; // UTC (modo horas: inicio exacto; modo días: primer día)
  serviceName: string;
  serviceId?: string | null;
  durationMinutes: number;
  durationDays?: number; // solo modo 'dias'
  contactId: string | null;
  callId?: string | null;
  notes?: string | null;
  createdVia: "agente_voz" | "panel";
}

export interface BookResult {
  ok: boolean;
  appointmentId?: string;
  startsAt?: string;
  endsAt?: string;
  alternatives: SlotOption[];
  reason?: string;
}

/** Revalida un hueco concreto contra el contexto. Devuelve true si cabe. */
export function validateSlot(
  ctx: AvailabilityContext,
  inicioIso: string,
  durationMinutes: number,
  durationDays?: number,
): { ok: boolean; reason?: string } {
  const tz = ctx.timezone || "Europe/Madrid";
  const start = DateTime.fromISO(inicioIso, { zone: tz });
  if (!start.isValid) return { ok: false, reason: "fecha inválida" };

  const now = DateTime.now().setZone(tz);
  const earliest = now.plus({ minutes: ctx.minNoticeMinutes });

  // ── Modo días: la cita ocupa días completos ────────────────────────────
  if (ctx.mode === "dias") {
    const days = Math.max(1, Math.round(durationDays ?? 1));
    const checkIn = start.startOf("day");
    if (checkIn < earliest) return { ok: false, reason: "antelación insuficiente" };
    if (checkIn > now.startOf("day").plus({ days: ctx.horizonDays }))
      return { ok: false, reason: "fuera del horizonte de reserva" };
    for (let i = 0; i < days; i++) {
      const day = checkIn.plus({ days: i });
      const weekday = day.weekday % 7;
      const open = ctx.hours.some((h) => h.weekday === weekday && !h.isClosed);
      if (!open) return { ok: false, reason: "día cerrado" };
      const sIso = day.toUTC().toISO()!;
      const eIso = day.plus({ days: 1 }).toUTC().toISO()!;
      if (ctx.closures.some((c) => sIso < c.endsAt && c.startsAt < eIso))
        return { ok: false, reason: "el negocio está cerrado ese día" };
      const overlaps = ctx.appointments.filter(
        (a) => a.status !== "anulada" && a.startsAt < eIso && sIso < a.endsAt,
      ).length;
      if (overlaps >= ctx.capacity) return { ok: false, reason: "día completo" };
    }
    return { ok: true };
  }

  // ── Modo horas: franja dentro del horario ──────────────────────────────
  const end = start.plus({ minutes: durationMinutes });
  if (start < earliest) return { ok: false, reason: "antelación insuficiente" };

  if (start.startOf("day") > now.startOf("day").plus({ days: ctx.horizonDays }))
    return { ok: false, reason: "fuera del horizonte de reserva" };

  const weekday = start.weekday % 7;
  const spans = ctx.hours.filter((h) => h.weekday === weekday && !h.isClosed);
  const spansOk = spans.some((s) => {
    const [oh, om] = s.opensAt.split(":").map(Number);
    const [ch, cm] = s.closesAt.split(":").map(Number);
    const open = start.set({ hour: oh ?? 0, minute: om ?? 0, second: 0, millisecond: 0 });
    const close = start.set({ hour: ch ?? 23, minute: cm ?? 59, second: 59 });
    return start >= open && end <= close.plus({ seconds: 1 });
  });
  if (!spansOk) return { ok: false, reason: "fuera de horario" };

  const tIso = start.toUTC().toISO()!;
  const eIso = end.toUTC().toISO()!;
  const inClosure = ctx.closures.some((c) => tIso < c.endsAt && c.startsAt < eIso);
  if (inClosure) return { ok: false, reason: "el negocio está cerrado" };

  const overlaps = ctx.appointments.filter(
    (a) => a.status !== "anulada" && a.startsAt < eIso && tIso < a.endsAt,
  ).length;
  if (overlaps >= ctx.capacity) return { ok: false, reason: "hueco ocupado" };

  return { ok: true };
}

export async function bookAppointment(
  client: PoolClient,
  businessId: string,
  input: BookAppointmentInput,
): Promise<BookResult> {
  // 1. serializa reservas de este negocio (transacción-local: se libera al COMMIT/ROLLBACK)
  await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1::uuid::text, 0))", [businessId]);

  // 2. contexto completo para revalidar
  const ctx = await loadAvailabilityContext(client, businessId);
  const validation = validateSlot(ctx, input.inicioIso, input.durationMinutes, input.durationDays);
  if (!validation.ok) {
    const alternatives = findSlots(ctx, {
      serviceDurationMinutes: input.durationMinutes,
      serviceDurationDays: input.durationDays,
      diasVista: 7,
      nowIso: new Date().toISOString(),
    });
    return { ok: false, alternatives, reason: validation.reason };
  }

  const start = DateTime.fromISO(input.inicioIso, { zone: ctx.timezone }).toUTC();
  const end =
    ctx.mode === "dias"
      ? start.plus({ days: Math.max(1, Math.round(input.durationDays ?? 1)) })
      : start.plus({ minutes: input.durationMinutes });
  const appt = await client.query(
    `INSERT INTO appointments (
       business_id, contact_id, call_id, service_id, service_name,
       starts_at, ends_at, status, created_via, notes)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'agendada', $8, $9)
     RETURNING id, starts_at, ends_at`,
    [
      businessId, input.contactId, input.callId ?? null, input.serviceId ?? null,
      input.serviceName, start.toISO(), end.toISO(), input.createdVia, input.notes ?? null,
    ],
  );
  return {
    ok: true,
    appointmentId: appt.rows[0].id,
    startsAt: appt.rows[0].starts_at instanceof Date ? appt.rows[0].starts_at.toISOString() : appt.rows[0].starts_at,
    endsAt: appt.rows[0].ends_at instanceof Date ? appt.rows[0].ends_at.toISOString() : appt.rows[0].ends_at,
    alternatives: [],
  };
}