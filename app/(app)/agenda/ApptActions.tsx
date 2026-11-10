"use client";

import { useActionState } from "react";

import { cambiarEstadoCitaAction } from "./actions";
import { appointmentStatusLabel, type AppointmentStatus } from "../../../lib/labels";

export function ApptActions({ id, status }: { id: string; status: AppointmentStatus }) {
  const [, action] = useActionState(cambiarEstadoCitaAction, null);
  return (
    <form action={action} className="flex items-center gap-2 mt-4">
      <input type="hidden" name="id" value={id} />
      <select name="status" defaultValue={status} className="field py-1.5 text-sm" onChange={(e) => e.currentTarget.form?.requestSubmit()}>
        {(Object.keys(appointmentStatusLabel) as AppointmentStatus[]).map((s) => (
          <option key={s} value={s}>{appointmentStatusLabel[s]}</option>
        ))}
      </select>
      <noscript><button type="submit" className="btn btn-secondary btn-sm">Guardar</button></noscript>
    </form>
  );
}