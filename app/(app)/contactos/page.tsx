import Link from "next/link";
import { withTenant } from "../../../lib/db/tenant";
import { requireSession } from "../../../lib/auth/context";
import { contactStatusLabel, contactSourceLabel, contactStatusBadge } from "../../../lib/labels";
import { dateShort, timeHm } from "../../../lib/format";
import { NewContactButton } from "./NewContactButton";

export const dynamic = "force-dynamic";

type ContactRow = {
  id: string; full_name: string | null; phone: string | null; email: string | null;
  status: "lead" | "cliente" | "inactivo"; source: "agente_voz" | "manual" | "importado";
  appt_count: number; last_contacted_at: string | Date | null;
};

export default async function ContactosPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string; source?: string }> }) {
  const ctx = await requireSession();
  const { q, status, source } = await searchParams;

  const rows = await withTenant(ctx.businessId, async (c) => {
    const conds: string[] = [];
    const params: unknown[] = [];
    if (q && q.trim()) {
      params.push(`%${q.trim()}%`);
      conds.push(`(f_unaccent(COALESCE(full_name,'')) ILIKE $${params.length} OR phone ILIKE $${params.length} OR f_unaccent(COALESCE(email,'')) ILIKE $${params.length})`);
    }
    if (status) { params.push(status); conds.push(`status = $${params.length}`); }
    if (source) { params.push(source); conds.push(`source = $${params.length}`); }
    const w = conds.length ? `WHERE ${conds.join(" AND ")}` : "";
    return (await c.query<ContactRow>(
      `SELECT c.id, c.full_name, c.phone, c.email, c.status, c.source,
              (SELECT count(*) FROM appointments a WHERE a.contact_id = c.id) AS appt_count,
              c.last_contacted_at
       FROM contacts c ${w} ORDER BY c.created_at DESC LIMIT 100`,
      params,
    )).rows;
  });

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="text-2xl font-semibold">Contactos</h1>
        <NewContactButton />
      </header>

      <form className="flex flex-wrap gap-2">
        <input name="q" defaultValue={q ?? ""} placeholder="Buscar por nombre, teléfono o correo…" className="field max-w-md" />
        <select name="status" defaultValue={status ?? ""} className="field max-w-[12rem]">
          <option value="">Todos los estados</option>
          <option value="lead">Lead</option>
          <option value="cliente">Cliente</option>
          <option value="inactivo">Inactivo</option>
        </select>
        <select name="source" defaultValue={source ?? ""} className="field max-w-[12rem]">
          <option value="">Todos los orígenes</option>
          <option value="agente_voz">Agente de voz</option>
          <option value="manual">Manual</option>
          <option value="importado">Importado</option>
        </select>
        <button className="btn btn-secondary">Filtrar</button>
      </form>

      {rows.length === 0 ? (
        <div className="card card-pad texture-stripes text-center text-surface-700">
          No hay contactos que cumplan el filtro. Los contactos que el agente cierre por teléfono aparecen aquí automáticamente.
        </div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-surface-100 text-surface-700">
              <tr>
                <th className="text-left p-3">Nombre</th>
                <th className="text-left p-3">Teléfono</th>
                <th className="text-left p-3">Estado</th>
                <th className="text-left p-3">Origen</th>
                <th className="text-left p-3">Citas</th>
                <th className="text-left p-3">Último contacto</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-surface-200 hover:bg-surface-100">
                  <td className="p-3"><Link href={`/contactos/${r.id}`} className="font-medium hover:underline">{r.full_name ?? "Sin nombre"}</Link></td>
                  <td className="p-3 font-mono text-xs">{r.phone ?? "—"}</td>
                  <td className="p-3"><span className={`badge ${contactStatusBadge(r.status)}`}>{contactStatusLabel[r.status]}</span></td>
                  <td className="p-3">{contactSourceLabel[r.source]}</td>
                  <td className="p-3">{r.appt_count}</td>
                  <td className="p-3 text-surface-700">{r.last_contacted_at ? `${dateShort(r.last_contacted_at, ctx.timezone)} ${timeHm(r.last_contacted_at, ctx.timezone)}` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}