"use client";

import { useActionState } from "react";
import { DateTime } from "luxon";

import { crearCitaAction } from "./actions";

export function NewAppointmentDrawer({
  services,
  timezone,
  mode,
  open,
  onClose,
}: {
  services: { id: string; name: string; duration_minutes: number; duration_days: number | null }[];
  timezone: string;
  mode: "horas" | "dias";
  open: boolean;
  onClose: () => void;
}) {
  const [state, action, pending] = useActionState(crearCitaAction, null as { error?: string } | null);
  const nowLocal = DateTime.now().setZone(timezone).toFormat("yyyy-MM-dd'T'HH:mm");
  const today = DateTime.now().setZone(timezone).toFormat("yyyy-MM-dd");
  const isDias = mode === "dias";

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative w-full max-w-md bg-surface-0 h-full overflow-y-auto p-6 shadow-xl">
        <h2 className="text-lg font-semibold mb-4">Nueva {isDias ? "reserva" : "cita"}</h2>
        <form action={action} className="space-y-3" onSubmit={onClose}>
          <div>
            <label className="label" htmlFor="serviceName">Servicio</label>
            <select id="serviceName" name="serviceId" className="field">
              {services.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} · {isDias ? (s.duration_days ? `${s.duration_days} día${s.duration_days > 1 ? "s" : ""}` : "—") : `${s.duration_minutes} min`}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="inicioIso">{isDias ? "Día de entrada" : "Inicio (local)"}</label>
            {isDias ? (
              <input id="inicioIso" name="inicioIso" type="date" defaultValue={today} className="field" />
            ) : (
              <input id="inicioIso" name="inicioIso" type="datetime-local" defaultValue={nowLocal} className="field" />
            )}
            <p className="hint">{isDias ? "La estancia la define el servicio." : "Se convierte a UTC al guardar."}</p>
          </div>
          <div>
            <label className="label" htmlFor="notes">Notas</label>
            <textarea id="notes" name="notes" className="field" rows={2} placeholder="Opcional" />
          </div>
          {state?.error && <p className="error-text">{state.error}</p>}
          <button type="submit" className="btn btn-primary w-full" disabled={pending}>{pending ? "Guardando…" : `Crear ${isDias ? "reserva" : "cita"}`}</button>
        </form>
      </div>
    </div>
  );
}