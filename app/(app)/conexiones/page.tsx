import { withTenant } from "../../../lib/db/tenant";
import { pool } from "../../../lib/db/pool";
import { requireSession } from "../../../lib/auth/context";
import { env, webhookUrl } from "../../../lib/env";
import { PublishButton } from "../estudio/PublishButton";
import { TierStatus } from "./TierStatus";

export const dynamic = "force-dynamic";

export default async function ConexionesPage() {
  const ctx = await requireSession();
  const e = env();

  const va = await withTenant(ctx.businessId, (c) =>
    c.query("SELECT vapi_assistant_id, vapi_phone_number_id, vapi_phone_number, vapi_phone_name, vapi_phone_provider, vapi_phone_status, vapi_phone_provider_resource_id, vapi_phone_synced_at, published_at FROM voice_agents WHERE business_id = $1", [ctx.businessId]),
  ).then((r) => r.rows[0] as {
    vapi_assistant_id: string | null;
    vapi_phone_number_id: string | null;
    vapi_phone_number: string | null;
    vapi_phone_name: string | null;
    vapi_phone_provider: string | null;
    vapi_phone_status: string | null;
    vapi_phone_provider_resource_id: string | null;
    vapi_phone_synced_at: string | Date | null;
    published_at: string | Date | null;
  });

  const tools = (await pool.query<{ name: string; vapi_tool_id: string; checksum: string; synced_at: Date }>("SELECT name, vapi_tool_id, checksum, synced_at FROM vapi_tools ORDER BY name")).rows;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Conexiones</h1>
      <p className="hint -mt-3">Estado de la integración con VAPI. Aquí no se gestionan claves: la <code>VAPI_API_KEY</code> y la credencial del webhook viven en el entorno del servidor y en el dashboard de VAPI.</p>

      <section className="grid md:grid-cols-3 gap-4">
        <div className="card card-pad">
          <h3 className="font-semibold mb-1">Asistente de VAPI</h3>
          {va.vapi_assistant_id ? <p className="font-mono text-xs break-all">{va.vapi_assistant_id}</p> : <p className="text-surface-700">Pendiente de provisionar.</p>}
          <div className="mt-3"><PublishButton /></div>
        </div>
        <div className="card card-pad">
          <h3 className="font-semibold mb-1">Número de teléfono</h3>
          {va.vapi_phone_number ? (
            <dl className="space-y-1 text-sm">
              <div className="flex justify-between gap-4"><dt className="text-surface-700">Número</dt><dd className="font-mono">{va.vapi_phone_number}</dd></div>
              {va.vapi_phone_name && <div className="flex justify-between gap-4"><dt className="text-surface-700">Nombre</dt><dd>{va.vapi_phone_name}</dd></div>}
              <div className="flex justify-between gap-4"><dt className="text-surface-700">Proveedor</dt><dd>{va.vapi_phone_provider ?? "—"}</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-surface-700">Estado</dt><dd>{va.vapi_phone_status ?? "—"}</dd></div>
              {va.vapi_phone_provider_resource_id && <div className="flex justify-between gap-4"><dt className="text-surface-700">ResourceId</dt><dd className="font-mono text-xs break-all">{va.vapi_phone_provider_resource_id}</dd></div>}
              <div className="flex justify-between gap-4"><dt className="text-surface-700">ID VAPI</dt><dd className="font-mono text-xs break-all">{va.vapi_phone_number_id}</dd></div>
              {va.vapi_phone_synced_at && <div className="flex justify-between gap-4"><dt className="text-surface-700">Sincronizado</dt><dd>{new Date(va.vapi_phone_synced_at as string).toLocaleString("es-ES")}</dd></div>}
            </dl>
          ) : (
            <p className="text-surface-700">Aún no vinculado.</p>
          )}
          <p className="hint mt-2">En España hay que importar un número de Twilio/Telnyx/Vonage; los gratuitos de VAPI son de EE. UU. (§14.3). Vincúlalo en el dashboard de VAPI al asistente creado arriba.</p>
        </div>
        <div className="card card-pad">
          <h3 className="font-semibold mb-1">Última publicación</h3>
          <p>{va.published_at ? new Date(va.published_at as string).toLocaleString("es-ES") : "nunca"}</p>
        </div>
      </section>

      <section className="card card-pad">
        <h3 className="font-semibold mb-2">Comparador de server.url</h3>
        <p className="text-sm">Esperado (desde <code>APP_URL</code>):</p>
        <p className="font-mono text-xs break-all bg-surface-100 rounded-md p-2 mt-1">{webhookUrl()}</p>
        <p className="hint mt-2">
          Si el asistente o las tools apuntan a otra URL (p. ej. el Funnel de desarrollo en vez del dominio de producción), el
          agente contesta pero no agenda. Ejecuta <code className="font-mono">pnpm vapi:sync</code> para realinearlas. Sin
          <code> VAPI_API_KEY</code> la verificación en vivo no está disponible aquí.
        </p>
        {!e.VAPI_API_KEY && <TierStatus assistantId={va.vapi_assistant_id} toolIds={tools.map((t) => t.vapi_tool_id)} />}
      </section>

      <section className="card card-pad">
        <h3 className="font-semibold mb-2">Tools compartidas ({tools.length})</h3>
        {tools.length === 0 ? (
          <p className="text-sm text-surface-700 texture-stripes rounded-md p-4">
            No hay tools sincronizadas. Ejecuta <code className="font-mono">pnpm vapi:tools:sync</code> para crearlas en VAPI.
          </p>
        ) : (
          <table className="w-full text-sm">
            <tbody>
              {tools.map((t) => (
                <tr key={t.name} className="border-t border-surface-200">
                  <td className="p-2 font-mono">{t.name}</td>
                  <td className="p-2 font-mono text-xs text-surface-700">{t.vapi_tool_id}</td>
                  <td className="p-2 text-right"><span className="badge-ok">creada</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}