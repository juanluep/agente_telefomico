/**
 * requireSession / getSession — la validación REAL contra base de datos (§6).
 * El proxy.ts solo comprueba la presencia de la cookie; la seguridad la hace
 * aquí. Devuelve el contexto de identidad (qué usuario, en qué negocio, con
 * qué rol y zona horaria) que usa toda el área privada.
 */
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { pool } from "../db/pool";
import { SESSION_COOKIE, tokenHash } from "./session";
import { withTenant } from "../db/tenant";

export interface AuthContext {
  userId: string;
  email: string;
  fullName: string;
  businessId: string;
  businessName: string;
  businessSlug: string;
  role: "owner" | "staff";
  timezone: string;
}

interface AuthRow {
  user_id: string;
  email: string;
  full_name: string;
  business_id: string;
  role: "owner" | "staff";
}

/** Devuelve el contexto si la sesión es válida, o null. */
export async function getSession(): Promise<AuthContext | null> {
  const c = await cookies();
  const token = c.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  // Paso 1: sessions/users/memberships NO tienen RLS → visibles para app_user.
  const res = await pool.query<AuthRow>(
    `SELECT u.id AS user_id, u.email, u.full_name, m.business_id, m.role
     FROM sessions s
     JOIN users u ON u.id = s.user_id
     JOIN memberships m ON m.user_id = u.id
     WHERE s.token_hash = $1 AND s.expires_at > now()
     LIMIT 1`,
    [tokenHash(token)],
  );
  const r = res.rows[0];
  if (!r) return null;

  // Paso 2: businesses SÍ tiene RLS → leer dentro de withTenant.
  const biz = await withTenant(r.business_id, (cl) =>
    cl.query<{ name: string; slug: string; timezone: string }>(
      "SELECT name, slug, timezone FROM businesses WHERE id = $1",
      [r.business_id],
    ),
  ).then((rr) => rr.rows[0]);
  if (!biz) return null;

  return {
    userId: r.user_id,
    email: r.email,
    fullName: r.full_name,
    businessId: r.business_id,
    businessName: biz.name,
    businessSlug: biz.slug,
    role: r.role,
    timezone: biz.timezone,
  };
}

/** Igual que getSession, pero redirige a /login si no hay sesión. */
export async function requireSession(): Promise<AuthContext> {
  const ctx = await getSession();
  if (!ctx) redirect("/login");
  return ctx;
}