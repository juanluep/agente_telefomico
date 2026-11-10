"use client";

import { useState } from "react";
import { PhoneOutgoing } from "@phosphor-icons/react";

export function OutboundButton({ contactId, consent }: { contactId: string; consent: boolean }) {
  const [state, setState] = useState<{ ok?: boolean; error?: string; callId?: string } | null>(null);
  const [pending, setPending] = useState(false);
  const disabled = !consent;

  return (
    <>
      <button
        className="btn btn-secondary"
        disabled={disabled || pending}
        title={disabled ? "El contacto no ha consentido llamadas salientes (§14.4)" : "Llamar con el agente"}
        onClick={async () => {
          setPending(true);
          try {
            const r = await fetch("/api/vapi/outbound", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ contactId }),
            });
            const j = (await r.json()) as { ok?: boolean; error?: string; callId?: string };
            setState(j);
          } finally {
            setPending(false);
          }
        }}
      >
        <PhoneOutgoing size={16} /> {pending ? "Llamando…" : "Llamar con el agente"}
      </button>
      {state?.error && <p className="error-text mt-1">{state.error}</p>}
      {state?.ok && <p className="text-xs text-ok-700 mt-1">Llamada lanzada ({state.callId ?? ""}).</p>}
    </>
  );
}