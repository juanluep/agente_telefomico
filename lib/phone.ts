/**
 * Normalización de teléfonos a E.164 (§8.1). Es lo que sostiene todo el CRM:
 * sin ella, "600 123 456", "+34600123456" y "0034600123456" crearían tres
 * fichas distintas. Se normaliza SIEMPRE antes de tocar la base de datos.
 */
import { parsePhoneNumberFromString } from "libphonenumber-js";

import { env } from "./env";

/** Devuelve el número en E.164 ("+34600123456") o null si no se puede parsear. */
export function normalizePhone(
  input: string | null | undefined,
  countryCode: string = env().DEFAULT_COUNTRY_CODE,
): string | null {
  if (!input) return null;
  const trimmed = input.trim();
  if (!trimmed) return null;
  const parsed = parsePhoneNumberFromString(trimmed, countryCode as never);
  if (!parsed) return null;
  // number ya viene en E.164. Si es claramente inválido lo descartamos para no
  // meter basura que rompa el UNIQUE parcial, pero el formato lo respetamos.
  return parsed.number;
}

/** ¿Tiene pinta de E.164? (validación ligera para respuestas de tools). */
export function isE164(value: string | null | undefined): boolean {
  return !!value && /^\+[1-9]\d{6,14}$/.test(value);
}