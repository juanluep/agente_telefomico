"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

import { pool } from "../../lib/db/pool";
import { verifyPassword } from "../../lib/auth/password";
import { createSession } from "../../lib/auth/session";
import { rateLimit } from "../../lib/auth/rate-limit";

const loginSchema = z.object({
  email: z.email({ message: "El correo no es válido." }),
  password: z.string().min(1, "Escribe la contraseña."),
});

export type LoginState = { error?: string; email?: string } | null;

export async function loginAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = loginSchema.safeParse({
    email: String(formData.get("email") ?? "").trim().toLowerCase(),
    password: String(formData.get("password") ?? ""),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Revisa los campos." };
  }
  const { email, password } = parsed.data;

  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";

  if (!rateLimit(`login:${ip}`, 10, 60_000).ok) return { error: "Demasiados intentos. Espera un minuto.", email };
  if (!rateLimit(`login:${email}`, 5, 60_000).ok) return { error: "Demasiados intentos con ese correo. Espera un minuto.", email };

  const res = await pool.query<{ id: string; password_hash: string }>(
    "SELECT id, password_hash FROM users WHERE email = $1",
    [email],
  );
  const user = res.rows[0];
  if (!user || !verifyPassword(password, user.password_hash)) {
    return { error: "Correo o contraseña incorrectos.", email };
  }

  await createSession({
    userId: user.id,
    userAgent: h.get("user-agent") ?? null,
    ip,
  });

  redirect("/panel");
}