import Link from "next/link";
import { withTenant } from "../../../lib/db/tenant";
import { requireSession } from "../../../lib/auth/context";
import { usd, dateShort, timeHm } from "../../../lib/format";
import { callStatusLabel, endedReasonInfo, type CallStatus } from "../../../lib/labels";

export const dynamic = "force-dynamic";

export default async function ConversacionesPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const ctx = await requireSession();
  const { q } = await searchParams;

  const rows = await withTenant(ctx.businessId, async (c) => {
    if (q && q.trim()) {
      // Busca por contenido de la transcripción (§12 · Conversaciones).
      return (await c.query(
        `SELECT DISTINCT c.id, c.from_number, c.started_at, c.duration_seconds, c.cost_cents, c.status, c.ended_reason, c.summary
         FROM calls c JOIN call_messages m ON m.call_id = c.id
         WHERE c.business_id = $1 AND m.content ILIKE '%' || $2 || '%'
         ORDER BY c.started_at DESC NULLS LAST LIMIT 100`,
        [ctx.businessId, q.trim()],
      )).rows as {
        id: string; from_number: string | null; started_at: string | Date | null;
        duration_seconds: number | null; cost_cents: number | null; status: string; ended_reason: string | null; summary: string | null;
      }[];
    }
    return (await c.query(
      `SELECT id, from_number, started_at, duration_seconds, cost_cents, status, ended_reason, summary
       FROM calls ORDER BY started_at DESC NULLS LAST LIMIT 100`,
    )).rows as {
      id: string; from_number: string | null; started_at: string | Date | null;
      duration_seconds: number | null; cost_cents: number | null; status: string; ended_reason: string | null; summary: string | null;
    }[];
  });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Conversaciones</h1>
      <form>
        <input name="q" defaultValue={q ?? ""} placeholder="Buscar por lo que se dijo en la conversación…" className="field max-w-xl" />
        <button className="btn btn-secondary ml-2">Buscar</button>
      </form>

      {rows.length === 0 ? (
        <div className="card card-pad texture-stripes text-center text-surface-700">
          No hay conversaciones. Las llamadas que reciba el agente aparecerán aquí con su transcripción y resumen.
        </div>
      ) : (
        <div className="space-y-2">
          {rows.map((r) => {
            const er = endedReasonInfo(r.ended_reason);
            return (
              <Link key={r.id} href={`/conversaciones/${r.id}`} className="card card-pad flex items-center justify-between gap-3 hover:bg-surface-100" prefetch={false}>
                <div className="min-w-0">
                  <p className="font-medium">{r.from_number ?? "Desconocido"}</p>
                  <p className="text-xs text-surface-700 truncate">
                    {r.started_at ? `${dateShort(r.started_at, ctx.timezone)} ${timeHm(r.started_at, ctx.timezone)}` : "—"}
                    {r.duration_seconds ? ` · ${Math.round(r.duration_seconds / 60)} min` : ""}
                    {r.cost_cents != null ? ` · ${usd(r.cost_cents)}` : ""}
                    {r.ended_reason ? ` · ${er.label}` : ""}
                  </p>
                  {r.summary && <p className="text-xs text-surface-700 mt-1 line-clamp-1">{r.summary}</p>}
                </div>
                <span className="badge-neutral">{callStatusLabel[r.status as CallStatus]}</span>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}