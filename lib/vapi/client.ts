/**
 * Cliente VAPI (SDK de servidor). La VAPI_API_KEY JAMÁS llega al navegador
 * (§7). Si la clave no está configurada, getClient() devuelve null y la
 * publicación degrade con un mensaje claro en lugar de reventar (§19).
 */
import { VapiClient } from "@vapi-ai/server-sdk";

import { env } from "../env";
import { webhookUrl } from "../env";

let cached: VapiClient | null | undefined;

/** Devuelve el cliente o null si VAPI no está configurado. */
export function getVapiClient(): VapiClient | null {
  if (cached !== undefined) return cached;
  const key = env().VAPI_API_KEY;
  cached = key ? new VapiClient({ token: key }) : null;
  return cached;
}

/** ¿Tiene sentido intentar publicar? Solo si hay clave + credential id. */
export function canPublish(): boolean {
  const e = env();
  return Boolean(e.VAPI_API_KEY && e.VAPI_SERVER_CREDENTIAL_ID);
}

export { webhookUrl };