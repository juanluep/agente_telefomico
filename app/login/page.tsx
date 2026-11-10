"use client";

import { useActionState } from "react";
import Link from "next/link";

import { loginAction, type LoginState } from "./actions";

export default function LoginPage() {
  const [state, formAction, pending] = useActionState(loginAction, null as LoginState);

  return (
    <main className="min-h-screen grid place-items-center p-6">
      <div className="w-full max-w-sm card card-pad">
        <h1 className="text-xl font-semibold mb-1">Iniciar sesión</h1>
        <p className="hint mb-5">Accede al panel de tu negocio.</p>

        <form action={formAction} className="space-y-3">
          <div>
            <label className="label" htmlFor="email">Correo</label>
            <input id="email" name="email" type="email" autoComplete="email" required
              defaultValue={state?.email ?? ""} className="field" placeholder="tucorreo@negocio.es" />
          </div>
          <div>
            <label className="label" htmlFor="password">Contraseña</label>
            <input id="password" name="password" type="password" autoComplete="current-password" required
              className="field" placeholder="••••••••" />
          </div>
          {state?.error && <p className="error-text">{state.error}</p>}
          <button type="submit" className="btn btn-primary w-full" disabled={pending}>
            {pending ? "Entrando…" : "Entrar"}
          </button>
        </form>

        <p className="hint mt-5 text-center">
          ¿Aún no tienes cuenta? <Link href="/signup" className="text-brand-600 font-medium hover:underline">Crear negocio</Link>
        </p>
      </div>
    </main>
  );
}