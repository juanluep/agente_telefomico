import { withTenant } from "../../../lib/db/tenant";
import { requireSession } from "../../../lib/auth/context";
import { appointmentDaysRange, appointmentRange, dateLong } from "../../../lib/format";
import { appointmentStatusLabel, appointmentCreatedViaLabel } from "../../../lib/labels";
import { NewAppointmentOpener } from "./NewAppointmentOpener";
import { ApptActions } from "./ApptActions";

export const dynamic = "force-dynamic";

type ApptRow = {
  id: string; service_name: string; starts_at: string | Date; ends_at: string | Date;
  status: "agendada" | "confirmada" | "completada" | "anulada" | "no_show";
  created_via: "agente_voz" | "panel"; notes: string | null;
  contact_id: string | null;
};

export default async function AgendaPage() {
  const ctx = await requireSession();
  const range = await withTenant(ctx.businessId, async (c) => {
    const appts = (await c.query(
      `SELECT id, service_name, starts_at, ends_at, status, created_via, notes, contact_id
       FROM appointments WHERE starts_at >= now() - interval '1 day' AND starts_at <= now() + interval '21 days'
       ORDER BY starts_at`,
    )).rows as ApptRow[];
    const services = (
      await c.query<{ id: string; name: string; duration_minutes: number; duration_days: number | null }>(
        "SELECT id, name, duration_minutes, duration_days FROM services WHERE is_active ORDER BY sort_order",
      )
    ).rows;
    const mode = (await c.query<{ booking_mode: "horas" | "dias" }>("SELECT booking_mode FROM voice_agents WHERE business_id=$1", [ctx.businessId])).rows[0]?.booking_mode ?? "horas";
    return { appts, services, mode };
  });

  const isDias = range.mode === "dias";

  const groups = new Map<string, ApptRow[]>();
  for (const a of range.appts) {
    const key = dateLong(a.starts_at, ctx.timezone);
    const arr = groups.get(key) ?? [];
    arr.push(a);
    groups.set(key, arr);
  }

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Agenda</h1>
        <NewAppointmentOpener services={range.services} timezone={ctx.timezone} mode={range.mode} />
      </header>

      {groups.size === 0 ? (
        <div className="card card-pad texture-stripes text-center text-surface-700">
          No hay citas en las próximas tres semanas. Crea una con «Nueva cita» o deja que el agente cierre una por teléfono.
        </div>
      ) : (
        <div className="space-y-5">
          {Array.from(groups.entries()).map(([day, items]) => (
            <section key={day}>
              <h2 className="text-sm font-semibold text-surface-700 mb-2">{day}</h2>
              <div className="grid md:grid-cols-2 gap-3">
                {items.map((a) => (
                  <div key={a.id} className="card card-pad">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="font-semibold">{a.service_name}</h3>
                      <span className="badge-neutral">{appointmentStatusLabel[a.status]}</span>
                    </div>
                    <p className="text-sm text-surface-700 mt-1">
                      {isDias ? appointmentDaysRange(a.starts_at, a.ends_at, ctx.timezone) : appointmentRange(a.starts_at, a.ends_at, ctx.timezone)}
                    </p>
                    <dl className="text-sm mt-3 space-y-1">
                      <div className="flex justify-between">
                        <dt className="text-surface-700">Origen</dt>
                        <dd>{appointmentCreatedViaLabel[a.created_via]}</dd>
                      </div>
                      {a.contact_id && (
                        <div className="flex justify-between">
                          <dt className="text-surface-700">Cliente</dt>
                          <dd><a className="text-brand-600 hover:underline" href={`/contactos/${a.contact_id}`}>Ver ficha</a></dd>
                        </div>
                      )}
                    </dl>
                    {a.notes && <p className="text-sm text-surface-700 mt-3 whitespace-pre-line">{a.notes}</p>}
                    <ApptActions id={a.id} status={a.status} />
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}