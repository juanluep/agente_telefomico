/**
 * Verificación del webhook (§7). La autenticidad se configura con una Custom
 * Credential de tipo Bearer Token en el dashboard de VAPI, referenciada por
 * credentialId en el objeto `server`. VAPI inyecta la cabecera Authorization.
 *
 * Comparamos con crypto.timingSafeEqual sobre hashes SHA-256 de ambos tokens:
 * así la comparación es de longitud constante y no filtra la longitud real del
 * token si difieren. Nunca `===`, nunca comparar longitudes distintas sin
 * normalizar. Si no valida → 401 SIN tocar la base de datos y sin revelar por qué.
 */
import { createHash, timingSafeEqual } from "node:crypto";

import { env } from "../env";

export function verifyBearer(authHeader: string | null | undefined): boolean {
  const expected = env().VAPI_WEBHOOK_TOKEN;
  if (!expected) return false; // sin token configurado → no se confía en nadie
  if (!authHeader) return false;

  const match = /^Bearer\s+(.+)$/i.exec(authHeader.trim());
  if (!match || !match[1]) return false;
  const received = match[1]!;

  const a = createHash("sha256").update(received).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}