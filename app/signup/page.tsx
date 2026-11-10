"use client";

import { useActionState } from "react";
import Link from "next/link";

import { signupAction, type SignupState } from "./actions";

export default function SignupPage() {
  const [state, formAction, pending] = useActionState(signupAction, null as SignupState);

  return (
    <main className="min-h-screen grid place-items-center p-6">
      <div className="w-full max-w-md card card-pad">
        <h1 className="text-xl font-semibold mb-1">Crear tu negocio</h1>
        <p className="hint mb-5">
          Al registrarse se crea el negocio, el usuario y la configuración inicial del agente de voz.
        </p>

        <form action={formAction} className="space-y-3">
          <div>
            <label className="label" htmlFor="businessName">Nombre del negocio</label>
            <input id="businessName" name="businessName" required className="field"
              placeholder="Taller Ruiz" autoFocus />
          </div>
          <div>
            <label className="label" htmlFor="fullName">Tu nombre</label>
            <input id="fullName" name="fullName" required className="field" placeholder="Javier Ruiz" />
          </div>
          <div>
            <label className="label" htmlFor="email">Correo</label>
            <input id="email" name="email" type="email" autoComplete="email" required className="field"
              placeholder="tucorreo@negocio.es" />
          </div>
          <div>
            <label className="label" htmlFor="password">Contraseña</label>
            <input id="password" name="password" type="password" autoComplete="new-password" required className="field"
              placeholder="Mínimo 8 caracteres" />
          </div>
          {state?.error && <p className="error-text">{state.error}</p>}
          <button type="submit" className="btn btn-primary w-full" disabled={pending}>
            {pending ? "Creando…" : "Crear cuenta"}
          </button>
        </form>

        <p className="hint mt-5 text-center">
          ¿Ya tienes cuenta? <Link href="/login" className="text-brand-600 font-medium hover:underline">Iniciar sesión</Link>
        </p>
      </div>
    </main>
  );
}