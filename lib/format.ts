/**
 * Formateo de fechas, horas y monedas. Para la UI se usa Intl nativo; para
 * lo que dice el agente (texto hablado) hay helpers específicos más abajo.
 * Las fechas se almacenan en UTC (timestamptz) y se presentan en la zona del
 * negocio: ningún cálculo puede depender de la zona del servidor (§19).
 */
import { DateTime } from "luxon";

export function eur(cents: number | null | undefined): string {
  if (cents == null) return "—";
  return new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(cents / 100);
}

export function usd(cents: number | null | undefined): string {
  if (cents == null) return "—";
  return new Intl.NumberFormat("es-ES", { style: "currency", currency: "USD" }).format(cents / 100);
}

export function inTz(value: Date | string | null | undefined, tz: string): DateTime {
  if (!value) return DateTime.invalid("empty");
  if (value instanceof Date) return DateTime.fromJSDate(value, { zone: tz });
  // Drizzle devuelve Date; db.execute devuelve string ISO — toleramos ambos.
  const dt = DateTime.fromISO(value, { zone: tz });
  return dt.isValid ? dt : DateTime.fromSQL(value, { zone: tz });
}

/** "viernes 7 de agosto" */
export function dateLong(value: Date | string | null | undefined, tz: string): string {
  const dt = inTz(value, tz);
  if (!dt.isValid) return "—";
  return dt.setLocale("es-ES").toFormat("cccc d 'de' LLLL");
}

/** "07/08/2026" */
export function dateShort(value: Date | string | null | undefined, tz: string): string {
  const dt = inTz(value, tz);
  if (!dt.isValid) return "—";
  return dt.setLocale("es-ES").toFormat("dd/MM/yyyy");
}

/** "10:00" */
export function timeHm(value: Date | string | null | undefined, tz: string): string {
  const dt = inTz(value, tz);
  if (!dt.isValid) return "—";
  return dt.setLocale("es-ES").toFormat("HH:mm");
}

/** "10:00 – 11:00 · 1 h" o "10:00 – 11:30 · 1 h 30 min" */
export function appointmentRange(
  startsAt: Date | string,
  endsAt: Date | string,
  tz: string,
): string {
  const start = inTz(startsAt, tz);
  const end = inTz(endsAt, tz);
  if (!start.isValid || !end.isValid) return "—";
  const mins = Math.round(end.diff(start, "minutes").minutes);
  return `${start.toFormat("HH:mm")} – ${end.toFormat("HH:mm")} · ${durationWords(mins)}`;
}

/** "lun 24 · 1 día" o "lun 24 → mié 26 · 2 noches" (estancias por días; endsAt es el día de salida). */
export function appointmentDaysRange(
  startsAt: Date | string,
  endsAt: Date | string,
  tz: string,
): string {
  const start = inTz(startsAt, tz);
  const end = inTz(endsAt, tz);
  if (!start.isValid || !end.isValid) return "—";
  const nights = Math.round(end.diff(start, "days").days);
  if (nights < 1) {
    // cita de menos de un día (p. ej. datos sembrados en modo horas): solo el día
    return `${start.setLocale("es-ES").toFormat("ccc d MMM")} · 1 día`;
  }
  const from = start.setLocale("es-ES").toFormat("ccc d MMM");
  const to = end.minus({ days: 1 }).setLocale("es-ES").toFormat("ccc d MMM");
  return `${from} → ${to} · ${nights} noche${nights > 1 ? "s" : ""}`;
}

/** 60 → "1 h", 90 → "1 h 30 min", 45 → "45 min" */
export function durationWords(minutes: number): string {
  if (minutes <= 0) return "—";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h} h`;
  return `${h} h ${m} min`;
}

const HOUR_WORDS = [
  "doce", "una", "dos", "tres", "cuatro", "cinco", "seis", "siete",
  "ocho", "nueve", "diez", "once", "doce",
];

/** Hora hablada: 10:00 → "las diez de la mañana", 11:30 → "las once y media de la mañana". */
export function spokenTime(hour24: number, minute: number): string {
  const period = hour24 < 12 ? "de la mañana" : hour24 >= 20 ? "de la noche" : "de la tarde";
  const h12 = hour24 % 12;
  const hourWord = HOUR_WORDS[h12] ?? String(h12);
  let minWord = "";
  if (minute === 30) minWord = "y media";
  else if (minute === 15) minWord = "y cuarto";
  else if (minute === 45) minWord = "menos cuarto";
  else if (minute !== 0) minWord = `y ${minute}`;
  const article = h12 === 1 ? "la" : "las";
  const base = `${article} ${hourWord}${minWord ? " " + minWord : ""}`;
  return `${base} ${period}`;
}

/** "el jueves 14 a las once y media de la mañana" (para resultados de tools). */
export function spokenDateTime(isoUtc: string, tz: string): string {
  const dt = inTz(isoUtc, tz);
  if (!dt.isValid) return isoUtc;
  const weekday = dt.setLocale("es-ES").toFormat("cccc");
  const day = dt.day;
  return `el ${weekday} ${day} a ${spokenTime(dt.hour, dt.minute)}`;
}

/** "el lunes 24" o "del lunes 24 al miércoles 26" según la estancia (tools, modo días). */
export function dayRangeSpoken(startsAt: Date | string, endsAt: Date | string, tz: string, days: number): string {
  const start = inTz(startsAt, tz);
  const end = inTz(endsAt, tz);
  if (!start.isValid || !end.isValid) return "—";
  const fmt = (d: DateTime) => d.setLocale("es-ES").toFormat("cccc d 'de' LLLL");
  if (!(days > 1)) return `el ${fmt(start)}`;
  // endsAt es el día de salida (no ocupado): el último día ocupado es endsAt − 1.
  return `del ${fmt(start)} al ${fmt(end.minus({ days: 1 }))}`;
}