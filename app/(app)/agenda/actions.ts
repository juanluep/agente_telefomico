"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { requireSession } from "../../../lib/auth/context";
import { withTenant } from "../../../lib/db/tenant";
import { bookAppointment } from "../../../lib/scheduling/booking";

const isoDatetime = z.string().datetime({ offset: true, local: true });

const crearSchema = z.object({
  serviceId: z.uuid(),
  inicioIso: isoDatetime,
  contactId: z.uuid().optional(),
  notes: z.string().optional(),
});

export async function crearCitaAction(_prev: unknown, formData: FormData) {
  const ctx = await requireSession();
  const rawInicio = String(formData.get("inicioIso") ?? "");
  // El input type="date" envía "2026-08-24" sin hora: se interpreta como
  // inicio de día en la zona del negocio (modo 'dias').
  const inicioIso = /^\d{4}-\d{2}-\d{2}$/.test(rawInicio) ? `${rawInicio}T00:00` : rawInicio;
  const parsed = crearSchema.safeParse({
    serviceId: String(formData.get("serviceId") ?? ""),
    inicioIso,
    contactId: formData.get("contactId") ? String(formData.get("contactId")) : undefined,
    notes: String(formData.get("notes") ?? "") || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." };

  const res = await withTenant(ctx.businessId, async (c) => {
    const va = (await c.query<{ booking_mode: "horas" | "dias" }>("SELECT booking_mode FROM voice_agents WHERE business_id=$1", [ctx.businessId])).rows[0];
    const svc = (await c.query<{ name: string; duration_minutes: number; duration_days: number | null }>(
      "SELECT name, duration_minutes, duration_days FROM services WHERE id = $1 AND business_id = $2",
      [parsed.data!.serviceId, ctx.businessId],
    )).rows[0];
    if (!svc) return { ok: false, alternatives: [], reason: " Servicio no encontrado." };
    const isDias = va?.booking_mode === "dias";
    return bookAppointment(c, ctx.businessId, {
      inicioIso: parsed.data!.inicioIso,
      serviceName: svc.name,
      serviceId: parsed.data!.serviceId,
      durationMinutes: svc.duration_minutes,
      durationDays: isDias ? (svc.duration_days ?? 1) : undefined,
      contactId: parsed.data!.contactId ?? null,
      createdVia: "panel",
      notes: parsed.data!.notes ?? null,
    });
  });
  // Si la reserva falla, mostramos alternativas; si ok, redirect.
  if (typeof (res as { ok?: boolean }).ok === "boolean" && !(res as { ok: boolean }).ok) {
    return { error: "Ese hueco no está libre. Prueba otro." };
  }
  redirect("/agenda");
}

const moverSchema = z.object({ id: z.uuid(), inicioIso: isoDatetime });

export async function moverCitaAction(_prev: unknown, formData: FormData) {
  const ctx = await requireSession();
  const parsed = moverSchema.safeParse({ id: String(formData.get("id") ?? ""), inicioIso: String(formData.get("inicioIso") ?? "") });
  if (!parsed.success) return { error: "Datos inválidos." };
  return withTenant(ctx.businessId, async (c) => {
    const appt = (await c.query<{ service_name: string; contact_id: string | null; service_id: string | null; duration_minutes: number | null }>(
      "SELECT a.service_name, a.contact_id, a.service_id, s.duration_minutes FROM appointments a LEFT JOIN services s ON s.id = a.service_id WHERE a.id = $1 AND a.business_id = $2",
      [parsed.data.id, ctx.businessId],
    )).rows[0];
    if (!appt) return { error: "Cita no encontrada." };
    const duration = appt.duration_minutes ?? 60;
    const booked = await bookAppointment(c, ctx.businessId, {
      inicioIso: parsed.data.inicioIso,
      serviceName: appt.service_name,
      serviceId: appt.service_id,
      durationMinutes: duration,
      contactId: appt.contact_id ?? null,
      createdVia: "panel",
    });
    if (!booked.ok) return { error: "Ese hueco no está libre." };
    await c.query("UPDATE appointments SET status = 'anulada', notes = COALESCE(notes,'') || ' · Movida desde aquí' WHERE id = $1", [parsed.data.id]);
    return { ok: true };
  });
}

export async function cambiarEstadoCitaAction(_prev: unknown, formData: FormData) {
  const ctx = await requireSession();
  const id = String(formData.get("id") ?? "");
  const status = String(formData.get("status") ?? "");
  if (!/^[0-9a-f-]{36}$/.test(id)) return { error: "Cita inválida." };
  if (!["agendada", "confirmada", "completada", "anulada", "no_show"].includes(status)) return { error: "Estado inválido." };
  await withTenant(ctx.businessId, (c) => c.query("UPDATE appointments SET status = $1 WHERE id = $2 AND business_id = $3", [status, id, ctx.businessId]));
  redirect("/agenda");
}