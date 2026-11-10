import Link from "next/link";
import { ArrowLeft } from "@phosphor-icons/react";

import { requireSession } from "../../../lib/auth/context";
import { withTenant } from "../../../lib/db/tenant";
import { dateShort, timeHm } from "../../../lib/format";
import { ReplayButton } from "./ReplayButton";

export const dynamic = "force-dynamic";

export default async function DevWebhooksPage() {
  if (process.env.NODE_ENV === "production") return null;
  const ctx = await requireSession();

  const rows = await withTenant(ctx.businessId, (c) =>
    c.query<{ id: string; event_type: string; external_id: string; processed_at: string | Date | null; error: string | null; created_at: Date }>(
      "SELECT id, event_type, external_id, processed_at, error, created_at FROM webhook_events ORDER BY created_at DESC LIMIT 200",
    ),
  );

  return (
    <main className="min-h-screen p-6 max-w-5xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/panel" className="btn btn-ghost btn-sm" prefetch={false}>
          <ArrowLeft size={16} /> Volver
        </Link>
        <h1 className="text-xl font-semibold">Inspector de webhooks (dev)</h1>
        <span className="badge-warn">No disponible en producción</span>
      </div>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-surface-100 text-surface-700">
            <tr>
              <th className="text-left p-3">Recibido</th>
              <th className="text-left p-3">Evento</th>
              <th className="text-left p-3">External ID</th>
              <th className="text-left p-3">Estado</th>
              <th className="text-right p-3">Acción</th>
            </tr>
          </thead>
          <tbody>
            {rows.rows.length === 0 && (
              <tr>
                <td colSpan={5} className="p-8 text-center text-surface-700 texture-stripes">
                  Aún no ha llegado ningún evento del webhook. Llama o simula una llamada para verlo aquí.
                </td>
              </tr>
            )}
            {rows.rows.map((r) => {
              const done = r.processed_at !== null && r.processed_at !== "";
              return (
                <tr key={r.id} className="border-t border-surface-200">
                  <td className="p-3 whitespace-nowrap">
                    {dateShort(r.created_at, ctx.timezone)} {timeHm(r.created_at, ctx.timezone)}
                  </td>
                  <td className="p-3 font-mono">{r.event_type}</td>
                  <td className="p-3 font-mono text-xs break-all max-w-xs">{r.external_id}</td>
                  <td className="p-3">
                    {r.error ? <span className="badge-danger">Error</span> : done ? <span className="badge-ok">Procesado</span> : <span className="badge-warn">Pendiente</span>}
                  </td>
                  <td className="p-3 text-right">
                    <ReplayButton id={r.id} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </main>
  );
}