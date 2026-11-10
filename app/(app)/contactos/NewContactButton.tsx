"use client";

import { useActionState, useState } from "react";

import { crearContactoAction } from "./actions";

export function NewContactButton() {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(crearContactoAction, null as { error?: string } | null);
  return (
    <>
      <button className="btn btn-primary" onClick={() => setOpen(true)}>Nuevo contacto</button>
      {open && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/30" onClick={() => setOpen(false)} />
          <div className="relative w-full max-w-md bg-surface-0 h-full overflow-y-auto p-6 shadow-xl">
            <h2 className="text-lg font-semibold mb-4">Nuevo contacto</h2>
            <form action={action} className="space-y-3" onSubmit={() => setOpen(false)}>
              <div><label className="label">Nombre</label><input name="fullName" required className="field" /></div>
              <div><label className="label">Teléfono</label><input name="phone" className="field" placeholder="+34 600 123 456" /></div>
              <div><label className="label">Correo</label><input name="email" type="email" className="field" /></div>
              <div><label className="label">Empresa</label><input name="company" className="field" /></div>
              <div><label className="label">Etiquetas (separadas por comas)</label><input name="tags" className="field" /></div>
              <div><label className="label">Notas</label><textarea name="notes" rows={2} className="field" /></div>
              <div>
                <label className="label">Estado</label>
                <select name="status" defaultValue="lead" className="field">
                  <option value="lead">Lead</option>
                  <option value="cliente">Cliente</option>
                  <option value="inactivo">Inactivo</option>
                </select>
              </div>
              {state?.error && <p className="error-text">{state.error}</p>}
              <button className="btn btn-primary w-full" disabled={pending}>{pending ? "Guardando…" : "Crear"}</button>
            </form>
          </div>
        </div>
      )}
    </>
  );
}