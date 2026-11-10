/**
 * Disponibilidad — la ÚNICA fuente de verdad, compartida por el agente de voz
 * (tools) y por el panel (§4.6, §11, §19). Sin calendario externo: huecos que
 * salen de horario semanal + duración del servicio + capacidad simultánea +
 * citas existentes + cierres + antelación mínima + horizonte de reserva.
 *
 * Puramente funcional sobre un AvailabilityContext para poder testearla sin DB.
 * La carga del contexto desde Postgres vive en loadAvailabilityContext().
 */
import { DateTime } from "luxon";

import { spokenDateTime } from "../format";

export interface BusinessHour {
  weekday: number; // 0=domingo … 6=sábado
  opensAt: string; // "HH:mm"
  closesAt: string;
  isClosed: boolean;
}
export interface Closure {
  startsAt: string; // ISO UTC
  endsAt: string;
}
export interface ExistingAppointment {
  startsAt: string; // ISO UTC
  endsAt: string;
  status: string;
}

export interface AvailabilityContext {
  timezone: string;
  mode: "horas" | "dias";
  hours: BusinessHour[];
  closures: Closure[];
  capacity: number;
  minNoticeMinutes: number;
  horizonDays: number;
  appointments: ExistingAppointment[];
}

export type Franja = "manana" | "tarde" | "cualquiera";

export interface FindSlotsOpts {
  serviceDurationMinutes: number;
  serviceDurationDays?: number; // solo modo 'dias'
  fechaPreferida?: string | null; // ISO (cualquier hora, se usa solo la fecha)
  franja?: Franja | null;
  diasVista?: number; // 1–30, def. 7
  nowIso?: string | null; // inyección para tests
}

export interface SlotOption {
  iso: string; // UTC, técnico
  texto: string; // hablable
}

const SLOT_STEP_MIN = 30;
const MAX_RESULTS = 3;

function clampDiasVista(v: number | undefined): number {
  return Math.min(30, Math.max(1, v ?? 7));
}

/** ¿Cae el instante dentro de un cierre? */
function isWithinClosures(dt: DateTime, closures: Closure[]): boolean {
  const t = dt.toUTC().toISO();
  if (!t) return false;
  return closures.some((c) => t >= c.startsAt && t < c.endsAt);
}

/** Cuenta cuántas citas (no anuladas) solapan con [start,end). */
function countOverlaps(start: DateTime, end: DateTime, appts: ExistingAppointment[]): number {
  const s = start.toUTC().toISO()!;
  const e = end.toUTC().toISO()!;
  return appts.filter((a) => a.status !== "anulada" && a.startsAt < e && s < a.endsAt).length;
}

function applyFranja(hour: number, franja?: Franja | null): boolean {
  if (!franja || franja === "cualquiera") return true;
  if (franja === "manana") return hour < 13;
  return hour >= 13;
}

function parseHHMM(hhmm: string): { hour: number; minute: number } {
  const [h, m] = hhmm.split(":").map(Number);
  return { hour: h ?? 0, minute: m ?? 0 };
}

/** ¿Está abierto ese día de la semana? (cualquier franja con is_closed=false) */
function isWeekdayOpen(hours: BusinessHour[], weekday: number): boolean {
  return hours.some((h) => h.weekday === weekday && !h.isClosed);
}

/** ¿Cae la fecha dentro de un cierre? (día completo) */
function dayInClosure(day: DateTime, closures: Closure[]): boolean {
  const start = day.toUTC().toISO()!;
  const end = day.plus({ days: 1 }).toUTC().toISO()!;
  return closures.some((c) => start < c.endsAt && c.startsAt < end);
}

/** Cuenta citas que ocupan (total o parcialmente) ese día de calendario. */
function countDayOverlaps(day: DateTime, appts: ExistingAppointment[]): number {
  const s = day.toUTC().toISO()!;
  const e = day.plus({ days: 1 }).toUTC().toISO()!;
  return appts.filter((a) => a.status !== "anulada" && a.startsAt < e && s < a.endsAt).length;
}

/**
 * Busca días completos disponibles (modo 'dias', p.ej. hoteles): devuelve el
 * día de entrada de una estancia de `durationDays` noches/días. Respeta
 * horario semanal, cierres, capacidad por día, antelación mínima y horizonte.
 */
function findDaySlots(
  ctx: AvailabilityContext,
  opts: FindSlotsOpts,
  now: DateTime,
  startDay: DateTime,
  durationDays: number,
): SlotOption[] {
  const days = Math.max(1, Math.round(durationDays));
  const earliest = now.plus({ minutes: ctx.minNoticeMinutes });
  const horizonLimit = now.startOf("day").plus({ days: ctx.horizonDays });
  const results: SlotOption[] = [];

  let cursor = startDay;
  for (let d = 0; d < (opts.diasVista ?? 7) && results.length < MAX_RESULTS; d++) {
    if (cursor.startOf("day") > horizonLimit) break;

    // Toda la estancia debe caer en días abiertos, sin cierres y con capacidad.
    let estanciaOk = true;
    for (let i = 0; i < days && estanciaOk; i++) {
      const day = cursor.plus({ days: i });
      if (!isWeekdayOpen(ctx.hours, day.weekday % 7)) { estanciaOk = false; break; }
      if (dayInClosure(day, ctx.closures)) { estanciaOk = false; break; }
      if (countDayOverlaps(day, ctx.appointments) >= ctx.capacity) { estanciaOk = false; break; }
    }
    if (estanciaOk && cursor >= earliest) {
      const iso = cursor.startOf("day").toUTC().toISO()!;
      results.push({ iso, texto: daySlotText(iso, ctx.timezone, days) });
    }
    cursor = cursor.plus({ days: 1 });
  }
  return results;
}

/** Texto hablable de una estancia: "el lunes 24" o "del lunes 24 al miércoles 26". */
function daySlotText(isoUtc: string, tz: string, days: number): string {
  const start = DateTime.fromISO(isoUtc, { zone: tz });
  if (days <= 1) {
    return `el ${start.setLocale("es-ES").toFormat("cccc d 'de' LLLL")}`;
  }
  const end = start.plus({ days: days - 1 });
  return `del ${start.setLocale("es-ES").toFormat("cccc d 'de' LLLL")} al ${end.setLocale("es-ES").toFormat("cccc d 'de' LLLL")}`;
}

/**
 * Calcula hasta MAX_RESULTS huecos disponibles. Devuelve {iso (UTC), texto
 * (hablable)}. El agente pide "como mucho dos opciones" (§10.3); el backend
 * devuelve hasta tres por si el cliente pide más.
 */
export function findSlots(ctx: AvailabilityContext, opts: FindSlotsOpts): SlotOption[] {
  const tz = ctx.timezone || "Europe/Madrid";
  const now = opts.nowIso ? DateTime.fromISO(opts.nowIso, { zone: tz }) : DateTime.now().setZone(tz);
  const diasVista = clampDiasVista(opts.diasVista);

  // Día de inicio de la búsqueda.
  let startDay: DateTime;
  if (opts.fechaPreferida) {
    const pref = DateTime.fromISO(opts.fechaPreferida, { zone: tz });
    startDay = pref.isValid ? pref.startOf("day") : now.startOf("day");
  } else {
    startDay = now.startOf("day");
  }

  if (ctx.mode === "dias") {
    return findDaySlots(ctx, opts, now, startDay, opts.serviceDurationDays ?? 1);
  }

  const duration = Math.max(15, opts.serviceDurationMinutes);
  const earliestOffset = ctx.minNoticeMinutes;
  const horizonLimit = now.startOf("day").plus({ days: ctx.horizonDays });

  const results: SlotOption[] = [];
  let dayCursor = startDay;

  for (let d = 0; d < diasVista && results.length < MAX_RESULTS; d++) {
    // No pasar del horizonte de reserva.
    if (dayCursor > horizonLimit) break;

    const weekday = dayCursor.weekday % 7; // Luxon: 1=lunes..7=domingo → nosso 0=domingo
    const spans = ctx.hours.filter((h) => h.weekday === weekday && !h.isClosed);

    for (const span of spans) {
      const open = parseHHMM(span.opensAt);
      const close = parseHHMM(span.closesAt);
      let cursor = dayCursor.set({ hour: open.hour, minute: open.minute, second: 0, millisecond: 0 });
      const closeDt = dayCursor.set({ hour: close.hour, minute: close.minute, second: 0, millisecond: 0 });
      const earliest = now.plus({ minutes: earliestOffset });

      while (cursor < closeDt && results.length < MAX_RESULTS) {
        const end = cursor.plus({ minutes: duration });
        if (end > closeDt) break;

        if (cursor >= earliest && applyFranja(cursor.hour, opts.franja) && !isWithinClosures(cursor, ctx.closures)) {
          const overlaps = countOverlaps(cursor, end, ctx.appointments);
          if (overlaps < ctx.capacity) {
            const iso = cursor.toUTC().toISO()!;
            results.push({ iso, texto: spokenDateTime(iso, tz) });
          }
        }
        cursor = cursor.plus({ minutes: SLOT_STEP_MIN });
      }
    }
    dayCursor = dayCursor.plus({ days: 1 });
  }

  return results;
}