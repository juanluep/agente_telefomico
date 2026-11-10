"use client";

import { useActionState } from "react";
import { anadirNotaAction } from "../actions";

export function NoteForm({ contactId }: { contactId: string }) {
  const [state, action, pending] = useActionState(anadirNotaAction, null as { error?: string } | null);
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="id" value={contactId} />
      <textarea name="body" required rows={3} className="field" placeholder="Escribe una nota sobre este contacto…" />
      {state?.error && <p className="error-text">{state.error}</p>}
      <button className="btn btn-primary btn-sm" disabled={pending}>{pending ? "Guardando…" : "Añadir nota"}</button>
    </form>
  );
}