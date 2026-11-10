/**
 * Registro atómico de negocio (§5). Una sola transacción crea el negocio, el
 * usuario, la membresía con rol owner, el voice_agent con valores por defecto
 * del nicho, el horario semanal estándar y el catálogo inicial de servicios.
 * Si algo falla, no queda un negocio a medias.
 *
 * Se ejecuta como app_user dentro de withTenant(newId): businesses permite
 * insert sin tenant (WITH CHECK true) y el resto se valida contra el
 * business_id que acabamos de fijar.
 */
import type { PoolClient } from "pg";

import { env } from "./env";
import { withTenant } from "./db/tenant";
import { uuidv7 } from "./uuid";
import { hashPassword } from "./auth/password";
import {
  DEFAULT_FIRST_MESSAGE,
  DEFAULT_HOURS,
  DEFAULT_SERVICES,
  DEFAULT_TONE,
  slugify,
} from "./nicho";

export interface RegisterInput {
  businessName: string;
  email: string;
  password: string;
  fullName: string;
}

export interface RegisterResult {
  userId: string;
  businessId: string;
}

export async function registerBusiness(input: RegisterInput): Promise<RegisterResult> {
  const businessId = uuidv7();
  const userId = uuidv7();
  const email = input.email.trim().toLowerCase();
  const name = input.businessName.trim();
  const tz = env().DEFAULT_TIMEZONE;
  // slug único por construcción: nombre + 8 hex del uuid (único). La
  // restricción UNIQUE de slug es la red de seguridad final.
  const slug = `${slugify(name) || "negocio"}-${businessId.slice(0, 8)}`;
  const passwordHash = hashPassword(input.password);
  const firstMessage = DEFAULT_FIRST_MESSAGE(name);

  await withTenant(businessId, async (c: PoolClient) => {
    await c.query(
      `INSERT INTO users (id, email, password_hash, full_name) VALUES ($1, $2, $3, $4)`,
      [userId, email, passwordHash, input.fullName.trim()],
    );
    await c.query(
      `INSERT INTO businesses (id, name, slug, timezone, email) VALUES ($1, $2, $3, $4, $5)`,
      [businessId, name, slug, tz, email],
    );
    await c.query(
      `INSERT INTO memberships (user_id, business_id, role) VALUES ($1, $2, 'owner')`,
      [userId, businessId],
    );
    await c.query(
      `INSERT INTO voice_agents (
         business_id, first_message, tone, language, slot_capacity,
         min_notice_minutes, booking_horizon_days, max_duration_seconds)
       VALUES ($1, $2, $3, 'es', 3, 60, 60, 600)`,
      [businessId, firstMessage, DEFAULT_TONE],
    );
    for (let i = 0; i < DEFAULT_HOURS.length; i++) {
      const h = DEFAULT_HOURS[i]!;
      await c.query(
        `INSERT INTO business_hours (business_id, weekday, opens_at, closes_at, is_closed)
         VALUES ($1, $2, $3, $4, $5)`,
        [businessId, h.weekday, h.opensAt, h.closesAt, h.isClosed],
      );
    }
    for (let i = 0; i < DEFAULT_SERVICES.length; i++) {
      const s = DEFAULT_SERVICES[i]!;
      await c.query(
        `INSERT INTO services (business_id, name, duration_minutes, price_cents, description, sort_order)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [businessId, s.name, s.durationMinutes, s.priceCents, s.description, i],
      );
    }
  });

  return { userId, businessId };
}