import Link from "next/link";
import { ArrowLeft, Phone, NotePencil } from "../../../../components/icons";

import { withTenant } from "../../../../lib/db/tenant";
import { requireSession } from "../../../../lib/auth/context";
import { contactStatusLabel, contactSourceLabel } from "../../../../lib/labels";
import { dateShort, timeHm } from "../../../../lib/format";
import { NoteForm } from "./NoteForm";
import { OutboundButton } from "./OutboundButton";
import { DeleteButton } from "./DeleteButton";

export const dynamic = "force-dynamic";

export default async function ContactDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireSession();

  const data = await withTenant(ctx.businessId, async (c) => {
    const contact = (await c.query(
      "SELECT id, full_name, phone, email, company, notes, tags, status, source, custom_fields, outbound_consent, created_at FROM contacts WHERE id = $1",
      [id],
    )).rows[0] as {
      id: string; full_name: string | null; phone: string | null; email: string | null;
      company: string | null; notes: string | null; tags: string[]; status: "lead" | "cliente" | "inactivo";
      source: "agente_voz" | "manual" | "importado"; custom_fields: Record<string, unknown>; outbound_consent: boolean; created_at: Date;
    } | undefined;
    if (!contact) return null;

    const timeline = (await c.query(
      `SELECT 'llamada' AS tipo, c.id::text AS ref, c.started_at AS fecha, c.from_number AS titulo, c.ended_reason AS detalle
       FROM calls c WHERE c.contact_id = $1
       UNION ALL
       SELECT 'cita', a.id::text, a.starts_at, a.service_name, a.status::text
       FROM appointments a WHERE a.contact_id = $1
       UNION ALL
       SELECT 'nota', n.id::text, n.created_at, left(n.body, 80), CASE WHEN n.author_user_id IS NULL THEN 'agente' ELSE 'manual' END
       FROM contact_notes n WHERE n.contact_id = $1
       ORDER BY fecha DESC NULLS LAST`,
      [id],
    )).rows as { tipo: string; ref: string; fecha: string | Date | null; titulo: string | null; detalle: string | null }[];

    return { contact, timeline };
  });

  if (!data) {
    return <p className="text-surface-700">Contacto no encontrado. <Link href="/contactos" className="text-brand-600 hover:underline">Volver</Link></p>;
  }

  const { contact, timeline } = data;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/contactos" className="btn btn-ghost btn-sm"><ArrowLeft size={16} /> Volver</Link>
        <div className="flex-1" />
        <Link href={`/conversaciones`} className="hidden" />
        <OutboundButton contactId={contact.id} consent={contact.outbound_consent} />
        <DeleteButton contactId={contact.id} name={contact.full_name ?? "sin nombre"} />
      </div>

      <div className="card card-pad">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-2xl font-semibold">{contact.full_name ?? "Sin nombre"}</h1>
            <p className="text-sm text-surface-700 font-mono">{contact.phone ?? "Sin teléfono"} · {contact.email ?? "sin correo"}</p>
            {contact.company && <p className="text-sm text-surface-700 mt-1">{contact.company}</p>}
          </div>
          <div className="flex gap-2">
            <span className="badge-brand">{contactStatusLabel[contact.status]}</span>
            <span className="badge-neutral">{contactSourceLabel[contact.source]}</span>
          </div>
        </div>
        {contact.tags?.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-3">
            {contact.tags.map((t) => <span key={t} className="badge-neutral">#{t}</span>)}
          </div>
        )}
        {contact.custom_fields && Object.keys(contact.custom_fields).length > 0 && (
          <dl className="text-sm mt-4 grid grid-cols-2 gap-2">
            {Object.entries(contact.custom_fields).map(([k, v]) => (
              <div key={k}><dt className="text-surface-700 capitalize">{k}</dt><dd>{String(v)}</dd></div>
            ))}
          </dl>
        )}
        {contact.notes && <p className="text-sm mt-4 text-surface-700 whitespace-pre-line">{contact.notes}</p>}
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <section className="card card-pad">
          <h2 className="font-semibold mb-3 flex items-center gap-2"><NotePencil size={18} /> Cronología</h2>
          {timeline.length === 0 ? (
            <p className="text-sm text-surface-700 texture-stripes rounded-md p-4">Aún no hay actividad registrada.</p>
          ) : (
            <ol className="space-y-3">
              {timeline.map((t, i) => (
                <li key={i} className="flex gap-3 text-sm">
                  <span className={`mt-1 w-2.5 h-2.5 rounded-full shrink-0 ${t.tipo === "llamada" ? "bg-brand-600" : t.tipo === "cita" ? "bg-ok-500" : "bg-surface-300"}`} />
                  <div>
                    <p className="font-medium">
                      {t.tipo === "llamada" ? <Link href={`/conversaciones/${t.ref}`} className="hover:underline">Llamada {t.titulo ?? ""}</Link> :
                       t.tipo === "cita" ? `Cita: ${t.titulo ?? ""}` :
                       `Nota: ${t.titulo ?? ""}`}
                    </p>
                    <p className="text-xs text-surface-700">
                      {t.fecha ? `${dateShort(t.fecha, ctx.timezone)} ${timeHm(t.fecha, ctx.timezone)}` : "—"}
                      {t.detalle ? ` · ${t.detalle}` : ""}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </section>
        <section className="card card-pad">
          <h2 className="font-semibold mb-3 flex items-center gap-2"><Phone size={18} /> Añadir nota</h2>
          <NoteForm contactId={contact.id} />
        </section>
      </div>
    </div>
  );
}