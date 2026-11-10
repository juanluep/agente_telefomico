/**
 * Upsert de contacto desde el agente de voz (§8.1). Pilar del CRM: cuando el
 * agente cierra una cita por teléfono, la ficha se crea sola; si el número ya
 * existía, se enriquece en vez de duplicarse. El dueño nunca teclea un contacto
 * que llegó por llamada.
 *
 * Reglas:
 *  - El teléfono viene NORMALIZADO a E.164 (lib/phone) — sin esto se duplica.
 *  - Si existe: NO sobrescribe lo que ya hay. Solo rellena vacíos (nombre,
 *    email), fusiona custom_fields y actualiza last_contacted_at.
 *  - Si no existe: lo crea con source='agente_voz', status='lead'.
 *  - El caller number (servidor, §9.1) NUNCA llega como parámetro del modelo.
 */
import type { PoolClient } from "pg";

export interface UpsertContactInput {
  phone: string | null; // ya en E.164
  fullName?: string | null;
  email?: string | null;
  customFields?: Record<string, unknown> | null;
}

export interface UpsertContactResult {
  contactId: string;
  created: boolean; // true si se creó, false si era existente
}

export async function upsertContactForCall(
  client: PoolClient,
  businessId: string,
  input: UpsertContactInput,
): Promise<UpsertContactResult> {
  const { phone, fullName, email, customFields } = input;

  if (!phone) {
    // Sin teléfono (caso raro en llamada) creamos ficha sin teléfono.
    const res = await client.query(
      `INSERT INTO contacts (business_id, full_name, email, status, source, custom_fields, last_contacted_at)
       VALUES ($1, $2, NULLIF($3,''), 'lead', 'agente_voz', $4, now())
       RETURNING id`,
      [businessId, fullName ?? null, email ?? null, JSON.stringify(customFields ?? {})],
    );
    return { contactId: res.rows[0].id, created: true };
  }

  const res = await client.query(
    `INSERT INTO contacts (business_id, full_name, phone, email, status, source, custom_fields, last_contacted_at)
     VALUES ($1, $2, $3, NULLIF($4,''), 'lead', 'agente_voz', $5, now())
     ON CONFLICT (business_id, phone) WHERE phone IS NOT NULL
     DO UPDATE SET
       full_name      = COALESCE(NULLIF(contacts.full_name,''), EXCLUDED.full_name, contacts.full_name),
       email          = COALESCE(NULLIF(contacts.email,''), EXCLUDED.email, contacts.email),
       custom_fields  = contacts.custom_fields || EXCLUDED.custom_fields,
       last_contacted_at = now(),
       updated_at     = now()
     RETURNING id, (xmax = 0) AS inserted`,
    [businessId, fullName ?? null, phone, email ?? null, JSON.stringify(customFields ?? {})],
  );
  return { contactId: res.rows[0].id, created: Boolean(res.rows[0].inserted) };
}

/** Nota automática del agente (author_user_id NULL). */
export async function addAgentContactNote(
  client: PoolClient,
  businessId: string,
  contactId: string,
  body: string,
): Promise<void> {
  await client.query(
    `INSERT INTO contact_notes (business_id, contact_id, body, author_user_id)
     VALUES ($1, $2, $3, NULL)`,
    [businessId, contactId, body],
  );
}