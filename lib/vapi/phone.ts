/**
 * Sincronización de la ficha del número de teléfono vinculado (§14.2).
 *
 * VAPI solo guarda el UUID en voice_agents.vapi_phone_number_id; el resto de la
 * ficha (número E.164, nombre, proveedor, estado) vive en VAPI. Esta función
 * refresca las columnas vapi_phone_* desde la API y las persiste, de modo que la
 * información del número sea permanente en nuestra BD y la interfaz no dependa
 * de llamadas en vivo.
 *
 * Se usa en `pnpm vapi:sync` y tras publicar el asistente (publish).
 */
import { env } from "../env";

const API = "https://api.vapi.ai";

interface VapiPhone {
  id: string;
  number?: string | null;
  name?: string | null;
  provider?: string | null;
  status?: string | null;
  providerResourceId?: string | null;
}

export async function syncPhoneDetails(client: {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[] }>;
}, phoneId: string | null): Promise<VapiPhone | null> {
  const e = env();
  if (!e.VAPI_API_KEY || !phoneId) return null;

  const r = await fetch(`${API}/phone-number/${phoneId}`, {
    headers: { Authorization: `Bearer ${e.VAPI_API_KEY}` },
  });
  if (!r.ok) return null;

  const phone = (await r.json()) as VapiPhone;
  await client.query(
    `UPDATE voice_agents SET
       vapi_phone_number = $1,
       vapi_phone_name = $2,
       vapi_phone_provider = $3,
       vapi_phone_status = $4,
       vapi_phone_provider_resource_id = $5,
       vapi_phone_synced_at = now()
     WHERE vapi_phone_number_id = $6`,
    [phone.number ?? null, phone.name ?? null, phone.provider ?? null, phone.status ?? null, phone.providerResourceId ?? null, phoneId],
  );
  return phone;
}