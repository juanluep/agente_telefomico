"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

import { pool } from "../../lib/db/pool";
import { createSession } from "../../lib/auth/session";
import { rateLimit } from "../../lib/auth/rate-limit";
import { registerBusiness } from "../../lib/onboarding";
import { DEFAULT_FIRST_MESSAGE } from "../../lib/nicho";

const signupSchema = z.object({
  businessName: z.string().trim().min(2, "Dime el nombre del negocio.").max(80),
  fullName: z.string().trim().min(2, "Dime tu nombre.").max(80),
  email: z.email({ message: "El correo no es válido." }),
  password: z.string().min(8, "La contraseña debe tener al menos 8 caracteres.").max(100),
});

export type SignupState = { error?: string; field?: string } | null;

export async function signupAction(_prev: SignupState, formData: FormData): Promise<SignupState> {
  const parsed = signupSchema.safeParse({
    businessName: String(formData.get("businessName") ?? "").trim(),
    fullName: String(formData.get("fullName") ?? "").trim(),
    email: String(formData.get("email") ?? "").trim().toLowerCase(),
    password: String(formData.get("password") ?? ""),
  });
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { error: issue?.message ?? "Revisa los campos.", field: issue?.path[0]?.toString() };
  }
  const { businessName, fullName, email, password } = parsed.data;

  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (!rateLimit(`signup:${ip}`, 5, 60_000).ok) return { error: "Demasiados intentos. Espera un minuto." };

  const exists = await pool.query("SELECT 1 FROM users WHERE email = $1", [email]);
  if (exists.rowCount && exists.rowCount > 0) return { error: "Ya hay una cuenta con ese correo.", field: "email" };

  const { userId } = await registerBusiness({ businessName, fullName, email, password });

  await createSession({ userId, userAgent: h.get("user-agent") ?? null, ip });
  // Evita que un futuro cambio de nombre rompa el flujo si DEFAULT_FIRST_MESSAGE fuera async.
  void DEFAULT_FIRST_MESSAGE;
  redirect("/panel");
}