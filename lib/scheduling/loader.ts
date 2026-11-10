/**
 * Carga el AvailabilityContext desde Postgres. Se ejecuta DENTRO de withTenant
 * (la única puerta a datos de inquilino). Es lo que usan, por igual, las tools
 * del agente y las acciones del panel — no hay dos verdades (§11).
 */
import type { PoolClient } from "pg";

import type { AvailabilityContext, BusinessHour, Closure, ExistingAppointment } from "./availability";

function dateToIso(v: unknown): string {
  if (v == null) return "";
  if (v instanceof Date) return v.toISOString();
  return String(v);
}

export async function loadAvailabilityContext(
  client: PoolClient,
  businessId: string,
): Promise<AvailabilityContext> {
  const cfg = await client.query<{
    timezone: string;
    slot_capacity: number;
    min_notice_minutes: number;
    booking_horizon_days: number;
    booking_mode: "horas" | "dias";
  }>(
    `SELECT b.timezone, va.slot_capacity, va.min_notice_minutes, va.booking_horizon_days, va.booking_mode
     FROM businesses b
     JOIN voice_agents va ON va.business_id = b.id
     WHERE b.id = $1`,
    [businessId],
  );
  const row = cfg.rows[0];
  if (!row) throw new Error("No se encontró la configuración de agente del negocio");

  const hoursRes = await client.query<BusinessHour>(
    `SELECT weekday, opens_at::text AS opensat, closes_at::text AS closesat, is_closed
     FROM business_hours WHERE business_id = $1`,
    [businessId],
  );
  // normaliza nombres a camelCase del interface
  const hours: BusinessHour[] = hoursRes.rows.map((r) => ({
    weekday: r.weekday,
    opensAt: (r as unknown as { opensat: string }).opensat,
    closesAt: (r as unknown as { closesat: string }).closesat,
    isClosed: r.isClosed,
  }));

  const closuresRes = await client.query("SELECT starts_at, ends_at FROM closures WHERE business_id = $1", [
    businessId,
  ]);
  const closures: Closure[] = closuresRes.rows.map((r: { starts_at: unknown; ends_at: unknown }) => ({
    startsAt: dateToIso(r.starts_at),
    endsAt: dateToIso(r.ends_at),
  }));

  const apptsRes = await client.query(
    `SELECT starts_at, ends_at, status FROM appointments
     WHERE business_id = $1 AND status <> 'anulada' AND ends_at > now() - interval '1 day'`,
    [businessId],
  );
  const appointments: ExistingAppointment[] = apptsRes.rows.map(
    (r: { starts_at: unknown; ends_at: unknown; status: string }) => ({
      startsAt: dateToIso(r.starts_at),
      endsAt: dateToIso(r.ends_at),
      status: r.status,
    }),
  );

  return {
    timezone: row.timezone,
    mode: row.booking_mode === "dias" ? "dias" : "horas",
    hours,
    closures,
    capacity: row.slot_capacity,
    minNoticeMinutes: row.min_notice_minutes,
    horizonDays: row.booking_horizon_days,
    appointments,
  };
}

/** Duración de un servicio por nombre o id (para resolver consultarHuecos). */
export async function resolveServiceDuration(
  client: PoolClient,
  businessId: string,
  serviceName: string | null | undefined,
): Promise<number | null> {
  if (!serviceName) return null;
  const res = await client.query(
    `SELECT duration_minutes FROM services
     WHERE business_id = $1 AND is_active AND name ILIKE $2
     ORDER BY sort_order LIMIT 1`,
    [businessId, serviceName],
  );
  return res.rows[0]?.duration_minutes ?? null;
}

/** Estancia en días de un servicio (modo 'dias'); NULL si no existe o es horario. */
export async function resolveServiceDurationDays(
  client: PoolClient,
  businessId: string,
  serviceName: string | null | undefined,
): Promise<number | null> {
  if (!serviceName) return null;
  const res = await client.query(
    `SELECT duration_days FROM services
     WHERE business_id = $1 AND is_active AND name ILIKE $2
     ORDER BY sort_order LIMIT 1`,
    [businessId, serviceName],
  );
  return res.rows[0]?.duration_days ?? null;
}