"use client";

export function TierStatus({ assistantId, toolIds }: { assistantId: string | null; toolIds: string[] }) {
  void assistantId;
  void toolIds;
  return <p className="text-xs text-surface-700 mt-2">VAPI_API_KEY no configurada: la verificación en vivo del server.url requiere la clave. Configúrala en .env y reinicia.</p>;
}