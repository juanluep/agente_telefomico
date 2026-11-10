"use client";

import { useTransition } from "react";
import { ArrowClockwise } from "@phosphor-icons/react";

import { replayAction } from "./actions";

export function ReplayButton({ id }: { id: string }) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      className="btn btn-secondary btn-sm"
      disabled={pending}
      onClick={() => start(() => replayAction(id).then(() => {}))}
    >
      <ArrowClockwise size={14} /> {pending ? "Reprocesando…" : "Reprocesar"}
    </button>
  );
}