/**
 * Consultas de las vistas, todas dentro de withTenant (la única puerta a datos
 * de inquilino). Centraliza los SELECT para no duplicar lógica entre vistas.
 */
import { withTenant } from "./db/tenant";
import type { AuthContext } from "./auth/context";

export type Period = "7d" | "30d" | "12m" | "anyos";

export function parsePeriod(p: string | undefined): Period {
  return p === "30d" || p === "12m" || p === "anyos" ? p : "7d";
}

function trunc(period: Period): "day" | "month" | "year" {
  if (period === "12m") return "month";
  if (period === "anyos") return "year";
  return "day";
}

function since(period: Period): Date {
  const now = Date.now();
  if (period === "7d") return new Date(now - 7 * 864e5);
  if (period === "30d") return new Date(now - 30 * 864e5);
  if (period === "12m") return new Date(now - 365 * 864e5);
  return new Date(0);
}

export interface DashboardData {
  metrics: {
    calls: number;
    callsToday: number;
    costCents: number;
    avgCostCents: number;
    phoneAppts: number;
    upcomingAppts: number;
    conversion: number; // 0..1
    avgDurationSec: number;
    newContactsByAgent: number;
  };
  callsVsAppts: { label: string; calls: number; appts: number }[];
  costSeries: { label: string; cost: number }[]; // $ por tramo
  recentCalls: {
    id: string; vapi_call_id: string; from_number: string | null;
    started_at: string | Date | null; duration_seconds: number | null;
    cost_cents: number | null; status: string; ended_reason: string | null;
  }[];
  status: {
    db: boolean;
    assistantProvisioned: boolean;
    numberLinked: boolean;
    publishedAt: string | Date | null;
  };
}

export async function dashboardData(ctx: AuthContext, period: Period): Promise<DashboardData> {
  const sinceDate = since(period);
  const unit = trunc(period);
  const labelFmt = unit === "day" ? "DD-MM" : unit === "month" ? "MM-yy" : "yyyy";

  return withTenant(ctx.businessId, async (c) => {
    const m = (
      await c.query(
        `SELECT
          (SELECT count(*) FROM calls WHERE created_at >= $1) AS calls,
          (SELECT count(*) FROM calls WHERE created_at >= date_trunc('day', now())) AS calls_today,
          COALESCE((SELECT sum(cost_cents) FROM calls WHERE created_at >= $1 AND cost_cents IS NOT NULL), 0) AS cost_cents,
          (SELECT count(*) FROM calls WHERE created_at >= $1 AND cost_cents IS NOT NULL) AS calls_with_cost,
          (SELECT count(*) FROM appointments WHERE created_at >= $1 AND created_via = 'agente_voz') AS phone_appts,
          (SELECT count(*) FROM appointments WHERE status IN ('agendada','confirmada') AND starts_at >= now()) AS upcoming,
          COALESCE((SELECT avg(duration_seconds) FROM calls WHERE ended_at IS NOT NULL AND duration_seconds IS NOT NULL AND created_at >= $1), 0)::int AS avg_dur,
          (SELECT count(*) FROM contacts WHERE source = 'agente_voz' AND created_at >= $1) AS new_contacts`,
        [sinceDate],
      )
    ).rows[0] as {
      calls: string; calls_today: string; cost_cents: string; calls_with_cost: string;
      phone_appts: string; upcoming: string; avg_dur: string; new_contacts: string;
    };

    const callsSeries = (
      await c.query("SELECT to_char(date_trunc($1, created_at), $2) AS label, count(*)::int AS v FROM calls WHERE created_at >= $3 GROUP BY 1 ORDER BY 1", [unit, labelFmt, sinceDate])
    ).rows as { label: string; v: number }[];
    const apptsSeries = (
      await c.query("SELECT to_char(date_trunc($1, created_at), $2) AS label, count(*)::int AS v FROM appointments WHERE created_at >= $3 GROUP BY 1 ORDER BY 1", [unit, labelFmt, sinceDate])
    ).rows as { label: string; v: number }[];
    const costRows = (
      await c.query("SELECT to_char(date_trunc($1, created_at), $2) AS label, COALESCE(sum(cost_cents),0)::int AS v FROM calls WHERE created_at >= $3 AND cost_cents IS NOT NULL GROUP BY 1 ORDER BY 1", [unit, labelFmt, sinceDate])
    ).rows as { label: string; v: number }[];

    // Fusiona por etiqueta rellenando ceros.
    const labels = Array.from(new Set([...callsSeries.map((r) => r.label), ...apptsSeries.map((r) => r.label)])).sort();
    const callsVsAppts = labels.map((label) => ({
      label,
      calls: callsSeries.find((r) => r.label === label)?.v ?? 0,
      appts: apptsSeries.find((r) => r.label === label)?.v ?? 0,
    }));
    const costSeries = labels.map((label) => ({ label, cost: (costRows.find((r) => r.label === label)?.v ?? 0) / 100 }));

    const recentCalls = (
      await c.query(
        `SELECT id, vapi_call_id, from_number, started_at, duration_seconds, cost_cents, status, ended_reason
         FROM calls ORDER BY COALESCE(started_at, created_at) DESC LIMIT 8`,
      )
    ).rows as DashboardData["recentCalls"];

    const va = (await c.query("SELECT vapi_assistant_id, vapi_phone_number_id, published_at FROM voice_agents WHERE business_id = $1", [ctx.businessId])).rows[0] as {
      vapi_assistant_id: string | null; vapi_phone_number_id: string | null; published_at: string | Date | null;
    };

    const callsN = Number(m.calls) || 0;
    const phoneApptsN = Number(m.phone_appts) || 0;

    return {
      metrics: {
        calls: callsN,
        callsToday: Number(m.calls_today) || 0,
        costCents: Number(m.cost_cents) || 0,
        avgCostCents: Number(m.calls_with_cost) > 0 ? Math.round((Number(m.cost_cents) || 0) / Number(m.calls_with_cost)) : 0,
        phoneAppts: phoneApptsN,
        upcomingAppts: Number(m.upcoming) || 0,
        conversion: callsN > 0 ? phoneApptsN / callsN : 0,
        avgDurationSec: Number(m.avg_dur) || 0,
        newContactsByAgent: Number(m.new_contacts) || 0,
      },
      callsVsAppts,
      costSeries,
      recentCalls,
      status: {
        db: true,
        assistantProvisioned: Boolean(va?.vapi_assistant_id),
        numberLinked: Boolean(va?.vapi_phone_number_id),
        publishedAt: va?.published_at ?? null,
      },
    };
  });
}