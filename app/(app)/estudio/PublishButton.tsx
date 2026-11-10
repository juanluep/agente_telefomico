"use client";

import { useActionState } from "react";

import { publicarAction } from "./actions";

export function PublishButton() {
  const [state, action, pending] = useActionState(publicarAction, null as { ok?: boolean; error?: string; assistantId?: string } | null);
  return (
    <div className="flex items-center gap-3">
      <form action={action}>
        <button className="btn btn-primary" disabled={pending}>{pending ? "Publicando…" : "Publicar en VAPI"}</button>
      </form>
      {state?.error && <p className="error-text">{state.error}</p>}
      {state?.ok && <p className="text-sm text-ok-700">Publicado ✓ ({state.assistantId ?? ""}).</p>}
    </div>
  );
}