import Link from "next/link";
import { Phone, ArrowRight } from "../../../components/icons";

import { requireSession } from "../../../lib/auth/context";
import { dashboardData, parsePeriod, type Period } from "../../../lib/queries";
import { usd, dateShort, timeHm } from "../../../lib/format";
import { callStatusLabel, endedReasonInfo, type CallStatus } from "../../../lib/labels";
import { DashboardCharts } from "../../../components/charts/DashboardCharts";

export const dynamic = "force-dynamic";

const PERIODS: { value: Period; label: string }[] = [
  { value: "7d", label: "7 días" },
  { value: "30d", label: "30 días" },
  { value: "12m", label: "12 meses" },
  { value: "anyos", label: "Años" },
];

function Metric({ value, sub }: { value: string; sub: string }) {
  return (
    <div className="card card-pad">
      <p className="text-2xl font-semibold">{value}</p>
      <p className="text-sm text-surface-700 mt-1">{sub}</p>
    </div>
  );
}

export default async function PanelPage({ searchParams }: { searchParams: Promise<{ periodo?: string }> }) {
  const ctx = await requireSession();
  const { periodo } = await searchParams;
  const period = parsePeriod(periodo);

  const data = await dashboardData(ctx, period);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Panel de control</h1>
        <div className="seg">
          {PERIODS.map((p) => (
            <Link
              key={p.value}
              href={`/panel?periodo=${p.value}`}
              className={`seg-item ${period === p.value ? "seg-item-active" : ""}`}
            >
              {p.label}
            </Link>
          ))}
        </div>
      </header>

      <section className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <Metric value={String(data.metrics.calls)} sub={`Llamadas · ${data.metrics.callsToday} hoy`} />
        <Metric value={usd(data.metrics.costCents)} sub={`Coste · media ${usd(data.metrics.avgCostCents)}/llamada`} />
        <Metric value={String(data.metrics.phoneAppts)} sub={`Citas por teléfono · ${data.metrics.upcomingAppts} próximas`} />
        <Metric value={`${Math.round(data.metrics.conversion * 100)} %`} sub="Conversión (cita / llamada)" />
        <Metric value={`${Math.round(data.metrics.avgDurationSec / 60)} min`} sub="Duración media" />
        <Metric value={String(data.metrics.newContactsByAgent)} sub="Contactos captados por el agente" />
      </section>

      {data.callsVsAppts.length === 0 ? (
        <div className="card card-pad texture-stripes text-center text-surface-700">
          Aún no hay llamadas en este periodo. Cuando el agente reciba la primera, aquí verás la evolución.
        </div>
      ) : (
        <DashboardCharts callsVsAppts={data.callsVsAppts} costSeries={data.costSeries} />
      )}

      <section className="card overflow-hidden">
        <h3 className="px-5 py-3 text-sm font-semibold border-b border-surface-200">Últimas llamadas</h3>
        {data.recentCalls.length === 0 ? (
          <p className="px-5 py-6 text-surface-700 text-sm">Sin llamadas todavía.</p>
        ) : (
          <table className="w-full text-sm">
            <tbody>
              {data.recentCalls.map((c) => {
                const er = endedReasonInfo(c.ended_reason);
                const s = c.status as CallStatus;
                return (
                  <tr key={c.id} className="border-t border-surface-200">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        <Phone size={16} className="text-surface-700" />
                        <span>{c.from_number ?? "Desconocido"}</span>
                      </div>
                      <p className="text-xs text-surface-700 mt-0.5">
                        {c.started_at ? `${dateShort(c.started_at, ctx.timezone)} ${timeHm(c.started_at, ctx.timezone)}` : "—"}
                        {c.duration_seconds ? ` · ${Math.round(c.duration_seconds / 60)} min` : ""}
                        {c.cost_cents != null ? ` · ${usd(c.cost_cents)}` : ""}
                        {c.ended_reason ? ` · ${er.label}` : ""}
                      </p>
                    </td>
                    <td className="px-5 py-3 text-right">
                      <span className="badge-neutral">{callStatusLabel[s]}</span>
                      <Link href={`/conversaciones/${c.id}`} className="btn btn-ghost btn-sm ml-2" title={er.title} prefetch={false}>
                        Ver <ArrowRight size={14} />
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>

      <section className="card card-pad">
        <h3 className="text-sm font-semibold mb-3 text-surface-700">Estado del sistema</h3>
        <ul className="text-sm space-y-2">
          <li className="flex items-center gap-2"><span className={`badge ${data.status.db ? "badge-ok" : "badge-danger"}`}>{data.status.db ? "OK" : "Fallo"}</span> Conexión con Postgres</li>
          <li className="flex items-center gap-2">
            <span className={`badge ${data.status.assistantProvisioned ? "badge-ok" : "badge-warn"}`}>{data.status.assistantProvisioned ? "OK" : "Pendiente"}</span>
            Asistente de VAPI
            {!data.status.assistantProvisioned && <Link href="/conexiones" className="text-brand-600 hover:underline ml-2">Provisionar</Link>}
          </li>
          <li className="flex items-center gap-2">
            <span className={`badge ${data.status.numberLinked ? "badge-ok" : "badge-warn"}`}>{data.status.numberLinked ? "OK" : "Pendiente"}</span>
            Número vinculado
            {!data.status.numberLinked && <Link href="/conexiones" className="text-brand-600 hover:underline ml-2">Vincular</Link>}
          </li>
          <li className="flex items-center gap-2 text-surface-700">
            Última publicación: {data.status.publishedAt ? `${dateShort(data.status.publishedAt, ctx.timezone)} ${timeHm(data.status.publishedAt, ctx.timezone)}` : "nunca"}
          </li>
        </ul>
      </section>
    </div>
  );
}