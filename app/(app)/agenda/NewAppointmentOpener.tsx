"use client";

import { useState } from "react";

import { NewAppointmentDrawer } from "./NewAppointmentDrawer";

export function NewAppointmentOpener({
  services,
  timezone,
  mode,
}: {
  services: { id: string; name: string; duration_minutes: number; duration_days: number | null }[];
  timezone: string;
  mode: "horas" | "dias";
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="btn btn-primary" onClick={() => setOpen(true)}>
        Nueva {mode === "dias" ? "reserva" : "cita"}
      </button>
      <NewAppointmentDrawer services={services} timezone={timezone} mode={mode} open={open} onClose={() => setOpen(false)} />
    </>
  );
}