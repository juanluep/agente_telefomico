/**
 * Sesiones opacas en base de datos + cookie httpOnly (§6). El token viaja solo
 * en la cookie; en la base de datos guardamos su SHA-256. Revocables de verdad
 * (borrar la fila). Renovación deslizante de 30 días.
 */
import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";

import { pool } from "../db/pool";
import { SESSION_COOKIE } from "./constants";

export { SESSION_COOKIE };
const THIRTY_DAYS = 60 * 60 * 24 * 30;

export function newSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

export function tokenHash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export interface CreatedSession {
  token: string;
  expiresAt: Date;
}

/** Crea la sesión en BD y planta la cookie. Renovación deslizante. */
export async function createSession(opts: {
  userId: string;
  userAgent?: string | null;
  ip?: string | null;
}): Promise<CreatedSession> {
  const token = newSessionToken();
  const hash = tokenHash(token);
  const expiresAt = new Date(Date.now() + THIRTY_DAYS * 1000);

  await pool.query(
    `INSERT INTO sessions (user_id, token_hash, expires_at, user_agent, ip)
     VALUES ($1, $2, $3, $4, $5)`,
    [opts.userId, hash, expiresAt, opts.userAgent ?? null, opts.ip ?? null],
  );

  const c = await cookies();
  c.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
    maxAge: THIRTY_DAYS,
  });

  return { token, expiresAt };
}

export async function destroySession(): Promise<void> {
  const c = await cookies();
  const token = c.get(SESSION_COOKIE)?.value;
  if (token) {
    await pool.query("DELETE FROM sessions WHERE token_hash = $1", [tokenHash(token)]).catch(() => {});
  }
  c.delete(SESSION_COOKIE);
}