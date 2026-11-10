/**
 * Etiquetas en español para TODO lo que se pinta en pantalla (§12).
 * Ningún valor interno crudo (estados de VAPI, `endedReason`, roles, orígenes…)
 * llega a la UI: sale todo de aquí. Tipado contra los enums: añadir un estado
 * sin etiqueta no compila, porque `Record<CallStatus,string>` exige cobertura.
 *
 * El `endedReason` de VAPI se traduce a frase entendible, con el código
 * original conservado en `title` para diagnóstico (§12 · Conversaciones).
 */

export type CallStatus = "scheduled" | "queued" | "ringing" | "in-progress" | "forwarding" | "ended";
export const callStatusLabel: Record<CallStatus, string> = {
  scheduled: "Programada",
  queued: "En cola",
  ringing: "Llamando",
  "in-progress": "En curso",
  forwarding: "Derivando",
  ended: "Finalizada",
};

export type ContactStatus = "lead" | "cliente" | "inactivo";
export const contactStatusLabel: Record<ContactStatus, string> = {
  lead: "Lead",
  cliente: "Cliente",
  inactivo: "Inactivo",
};

export type ContactSource = "agente_voz" | "manual" | "importado";
export const contactSourceLabel: Record<ContactSource, string> = {
  agente_voz: "Agente de voz",
  manual: "Manual",
  importado: "Importado",
};

export type CallDirection = "inbound" | "outbound";
export const callDirectionLabel: Record<CallDirection, string> = {
  inbound: "Entrante",
  outbound: "Saliente",
};

export type AppointmentStatus = "agendada" | "confirmada" | "completada" | "anulada" | "no_show";
export const appointmentStatusLabel: Record<AppointmentStatus, string> = {
  agendada: "Agendada",
  confirmada: "Confirmada",
  completada: "Completada",
  anulada: "Anulada",
  no_show: "No presentado",
};

export type AppointmentCreatedVia = "agente_voz" | "panel";
export const appointmentCreatedViaLabel: Record<AppointmentCreatedVia, string> = {
  agente_voz: "Cerrada por teléfono con el agente",
  panel: "Creada a mano",
};

export type MembershipRole = "owner" | "staff";
export const membershipRoleLabel: Record<MembershipRole, string> = {
  owner: "Propietario",
  staff: "Empleado",
};

/** Color de badge por estado de cita, para la UI. */
export function appointmentBadge(status: AppointmentStatus): string {
  const map: Record<AppointmentStatus, string> = {
    agendada: "badge-neutral",
    confirmada: "badge-ok",
    completada: "badge-ok",
    anulada: "badge-danger",
    no_show: "badge-warn",
  };
  return map[status];
}

export function contactStatusBadge(status: ContactStatus): string {
  const map: Record<ContactStatus, string> = {
    lead: "badge-warn",
    cliente: "badge-ok",
    inactivo: "badge-neutral",
  };
  return map[status];
}

export function callStatusBadge(status: CallStatus): string {
  const map: Record<CallStatus, string> = {
    scheduled: "badge-neutral",
    queued: "badge-neutral",
    ringing: "badge-brand",
    "in-progress": "badge-brand",
    forwarding: "badge-warn",
    ended: "badge-neutral",
  };
  return map[status];
}

/**
 * Traduce el `endedReason` de VAPI a una frase entendible. Los códigos
 * habituales uno a uno; los desconocidos por familias. El código original se
 * conserva en `title` para diagnóstico.
 */
export function endedReasonInfo(reason: string | null | undefined): {
  label: string;
  title: string;
} {
  const r = (reason ?? "").trim();
  if (!r) return { label: "Llamada finalizada", title: "" };

  const exact: Record<string, string> = {
    "customer-ended-call": "El cliente colgó",
    "assistant-ended-call": "El asistente colgó",
    "assistant-said-goodbye": "El asistente se despidió",
    "customer-did-not-answer": "El cliente no contestó",
    "call-not-answered": "No se atendió la llamada",
    "transfer-failed": "No se pudo derivar la llamada",
    "max-duration-exceeded": "Se superó la duración máxima",
    "max-cost-exceeded": "Se superó el coste máximo",
    "silence-detection": "Se cortó tras un silencio prolongado",
    "speech-detection": "Se cortó por detección de voz",
    voicemail: "Buzón de voz",
    "voicemail-detection": "Buzón de voz",
    rejection: "La llamada fue rechazada",
    "technical-error": "Error técnico",
  };

  const lower = r.toLowerCase();
  if (exact[r]) return { label: exact[r], title: r };
  if (/(twilio|vonage|telnyx|sip)/.test(lower)) return { label: "Incidencia de operadora", title: r };
  if (lower.includes("error")) return { label: "Error técnico", title: r };
  if (lower.includes("timeout") || lower.includes("timed")) return { label: "Se cortó por tiempo", title: r };
  if (lower.includes("customer")) return { label: "El cliente colgó", title: r };
  return { label: "Llamada finalizada", title: r };
}