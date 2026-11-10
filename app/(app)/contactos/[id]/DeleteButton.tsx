"use client";

import { useState } from "react";
import { useActionState } from "react";

import { eliminarContactoAction } from "../actions";

export function DeleteButton({ contactId, name }: { contactId: string; name: string }) {
  const [confirm, setConfirm] = useState(false);
  const [, action] = useActionState(eliminarContactoAction, null);
  if (!confirm) {
    return <button className="btn btn-danger btn-sm" onClick={() => setConfirm(true)}>Eliminar</button>;
  }
  return (
    <span className="inline-flex items-center gap-2">
      <span className="text-xs text-surface-700">¿Seguro? Llamadas y citas se conservan; las notas se borran.</span>
      <form action={action} className="inline">
        <input type="hidden" name="id" value={contactId} />
        <button className="btn btn-danger btn-sm" type="submit">Sí, borrar «{name}»</button>
      </form>
      <button className="btn btn-ghost btn-sm" onClick={() => setConfirm(false)}>Cancelar</button>
    </span>
  );
}