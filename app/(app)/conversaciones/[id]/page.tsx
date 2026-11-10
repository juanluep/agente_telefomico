import Link from "next/link";
import { ArrowLeft } from "../../../../components/icons";
import { RecordingPlayer } from "../../../../components/RecordingPlayer";

import { withTenant } from "../../../../lib/db/tenant";
import { requireSession } from "../../../../lib/auth/context";
import { usd, dateShort, timeHm } from "../../../../lib/format";
import { endedReasonInfo } from "../../../../lib/labels";

export const dynamic = "force-dynamic";

export default async function ConversacionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireSession();

  const data = await withTenant(ctx.businessId, async (c) => {
    const call = (await c.query(
      "SELECT id, from_number, started_at, ended_at, duration_seconds, cost_cents, summary, ended_reason, contact_id, recording_url FROM calls WHERE id = $1",
      [id],
    )).rows[0] as {
      id: string; from_number: string | null; started_at: string | Date | null; ended_at: string | Date | null;
      duration_seconds: number | null; cost_cents: number | null; summary: string | null; ended_reason: string | null;
      contact_id: string | null; recording_url: string | null;
    } | undefined;
    if (!call) return null;
    const msgs = (await c.query(
      "SELECT role, content, seconds_from_start FROM call_messages WHERE call_id = $1 AND role IN ('assistant','user') ORDER BY sort_order",
      [call.id],
    )).rows as { role: "assistant" | "user"; content: string; seconds_from_start: number | null }[];
    return { call, msgs };
  });

  if (!data) return <p className="text-surface-700">Conversación no encontrada. <Link href="/conversaciones" className="text-brand-600 hover:underline">Volver</Link></p>;

  const { call, msgs } = data;
  const er = endedReasonInfo(call.ended_reason);
  const hasRecording = Boolean(call.recording_url);

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center gap-3">
        <Link href="/conversaciones" className="btn btn-ghost btn-sm"><ArrowLeft size={16} /> Volver</Link>
      </div>

      <section className="card card-pad">
        <h1 className="text-xl font-semibold">{call.from_number ?? "Desconocido"}</h1>
        <p className="text-sm text-surface-700 mt-1" title={er.title}>
          {call.started_at ? `${dateShort(call.started_at, ctx.timezone)} ${timeHm(call.started_at, ctx.timezone)}` : "—"}
          {call.duration_seconds ? ` · ${Math.round(call.duration_seconds / 60)} min` : ""}
          {call.cost_cents != null ? ` · ${usd(call.cost_cents)}` : ""}
          {call.ended_reason ? ` · ${er.label}` : ""}
        </p>
        {call.contact_id && <p className="text-sm mt-2"><Link href={`/contactos/${call.contact_id}`} className="text-brand-600 hover:underline">Ver contacto</Link></p>}
      </section>

      {call.summary ? (
        <section className="card card-pad">
          <h2 className="text-sm font-semibold mb-2 text-surface-700">Resumen</h2>
          <p className="text-sm">{call.summary}</p>
        </section>
      ) : (
        <section className="card card-pad">
          <h2 className="text-sm font-semibold mb-2 text-surface-700">Resumen</h2>
          <p className="text-sm text-surface-700">
            Esta llamada no tiene resumen: se generó antes de activar el plan de análisis, y no se puede recuperar a posteriori
            (§14.1). Publica el asistente desde «Ajustes del Agente» para que las próximas sí lo lleven.
          </p>
        </section>
      )}

      {hasRecording && (
        <section className="card card-pad">
          <h2 className="text-sm font-semibold mb-2 text-surface-700">Grabación</h2>
          <RecordingPlayer src={`/api/calls/${call.id}/recording`} />
        </section>
      )}

      <section className="card card-pad">
        <h2 className="text-sm font-semibold mb-3 text-surface-700">Transcripción</h2>
        {msgs.length === 0 ? (
          <p className="text-sm text-surface-700">No hay transcripción disponible para esta llamada.</p>
        ) : (
          <ol className="space-y-3">
            {msgs.map((m, i) => {
              const isAgent = m.role === "assistant";
              return (
                <li key={i} className={`flex ${isAgent ? "justify-start" : "justify-end"}`}>
                  <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm ${
                    isAgent
                      ? "bg-surface-100 text-surface-900 rounded-tl-sm"
                      : "bg-ink text-surface-0 rounded-tr-sm dark:bg-surface-0 dark:text-surface-900"
                  }`}>
                    <p className="text-[0.65rem] uppercase tracking-wide opacity-70 mb-0.5">{isAgent ? "Agente" : "Cliente"}</p>
                    <p className="whitespace-pre-line">{m.content}</p>
                    {m.seconds_from_start != null && <p className="text-[0.65rem] opacity-60 mt-1">{Math.floor(m.seconds_from_start / 60)}:{String(m.seconds_from_start % 60).padStart(2, "0")}</p>}
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </section>
    </div>
  );
}