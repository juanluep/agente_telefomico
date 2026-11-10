/**
 * Constantes del nicho. Para cambiar de sector basta tocar este fichero: el
 * esquema, la API y la interfaz son neutrales (negocio, contacto, servicio,
 * cita). Lo único propio del nicho son los valores por defecto del semillero
 * y el prompt base del agente.
 *
 * NICHO = "talleres mecánicos y centros de servicio del automóvil"
 */

/** Sustantivo del nicho para el prompt (§10.3). */
export const TIPO_NEGOCIO = "taller mecánico";

/** Dato extra que el agente debe recoger al cerrar cita (§10.3). */
export const DATOS_EXTRA = "matrícula y marca y modelo del vehículo";

/** Tono por defecto del agente. */
export const DEFAULT_TONE = "cercano y resolutivo";

/** Plantilla del primer mensaje; {negocio} se sustituye al publicar. */
export const DEFAULT_FIRST_MESSAGE = (negocio: string) =>
  `${negocio}, buenas. Soy el asistente virtual, ¿en qué te puedo ayudar?`;

/** Horario semanal estándar de un taller en España. weekday: 0=domingo … 6=sábado. */
export const DEFAULT_HOURS: { weekday: number; opensAt: string; closesAt: string; isClosed: boolean }[] = [
  { weekday: 1, opensAt: "09:00", closesAt: "14:00", isClosed: false },
  { weekday: 1, opensAt: "16:00", closesAt: "19:00", isClosed: false },
  { weekday: 2, opensAt: "09:00", closesAt: "14:00", isClosed: false },
  { weekday: 2, opensAt: "16:00", closesAt: "19:00", isClosed: false },
  { weekday: 3, opensAt: "09:00", closesAt: "14:00", isClosed: false },
  { weekday: 3, opensAt: "16:00", closesAt: "19:00", isClosed: false },
  { weekday: 4, opensAt: "09:00", closesAt: "14:00", isClosed: false },
  { weekday: 4, opensAt: "16:00", closesAt: "19:00", isClosed: false },
  { weekday: 5, opensAt: "09:00", closesAt: "14:00", isClosed: false },
  { weekday: 5, opensAt: "16:00", closesAt: "19:00", isClosed: false },
  { weekday: 6, opensAt: "09:00", closesAt: "14:00", isClosed: false },
  { weekday: 0, opensAt: "00:00", closesAt: "00:00", isClosed: true },
];

/** Catálogo inicial de servicios para un taller. */
export const DEFAULT_SERVICES: { name: string; durationMinutes: number; priceCents: number | null; description: string }[] = [
  { name: "Cambio de aceite", durationMinutes: 60, priceCents: 4500, description: "Aceite y filtro incluidos." },
  { name: "Revisión general", durationMinutes: 90, priceCents: 6000, description: "Frenos, líquidos y suspensiones." },
  { name: "Frenos", durationMinutes: 75, priceCents: 9000, description: "Pastillas y/o discos." },
  { name: "Diagnóstico electrónico", durationMinutes: 45, priceCents: 3500, description: "Lectura de fallos del cuadro." },
  { name: "Neumáticos", durationMinutes: 60, priceCents: 2000, description: "Montaje y equilibrado por neumático (precio orientativo)." },
];

/** slug legible a partir del nombre del negocio (sin acentos). */
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}