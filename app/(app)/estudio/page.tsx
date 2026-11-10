import { withTenant } from "../../../lib/db/tenant";
import { requireSession } from "../../../lib/auth/context";
import { composeSystemPrompt, type PromptInput, type RawHour, type RawService, type RawFact } from "../../../lib/vapi/prompt";
import { DEFAULT_TRANSCRIBER, DEFAULT_MODEL, DEFAULT_VOICE } from "../../../lib/vapi/defaults";
import { PromptEditor } from "./PromptEditor";
import { ModelsEditor, type ModelsState } from "./ModelsEditor";
import { PublishButton } from "./PublishButton";
import { guardarInfoAction, guardarPersonalidadAction, guardarServicioAction, eliminarServicioAction, guardarFactAction, eliminarFactAction } from "./actions";

export const dynamic = "force-dynamic";

const TIMEZONES = Intl.supportedValuesOf ? Intl.supportedValuesOf("timeZone") : ["Europe/Madrid", "Atlantic/Canary"];

export default async function EstudioPage() {
  const ctx = await requireSession();
  const data = await withTenant(ctx.businessId, async (c) => {
    const biz = (await c.query("SELECT name, timezone, phone, email, website, address FROM businesses WHERE id=$1", [ctx.businessId])).rows[0] as {
      name: string; timezone: string; phone: string | null; email: string | null; website: string | null; address: string | null;
    };
    const va = (await c.query("SELECT * FROM voice_agents WHERE business_id=$1", [ctx.businessId])).rows[0] as Record<string, unknown> & {
      system_prompt_override: string | null; first_message: string | null; tone: string;
      handoff_number: string | null; handoff_message: string | null; slot_capacity: number;
      min_notice_minutes: number; booking_horizon_days: number; max_duration_seconds: number;
      booking_mode: "horas" | "dias";
      language: string; model: { provider?: string; model?: string } | Record<string, never>;
      transcriber: { provider?: string; model?: string; language?: string } | Record<string, never>;
      voice_provider: string | null; voice_id: string | null; voice_model: string | null; voice_language: string | null;
      published_at: string | Date | null;
    };
    const hours = (await c.query("SELECT weekday, opens_at::text AS \"opensAt\", closes_at::text AS \"closesAt\", is_closed FROM business_hours WHERE business_id=$1 ORDER BY weekday, opens_at", [ctx.businessId])).rows as RawHour[];
    const services = (await c.query("SELECT id, name, duration_minutes AS \"durationMinutes\", duration_days AS \"durationDays\", price_cents AS \"priceCents\", description, is_active FROM services WHERE business_id=$1 ORDER BY sort_order", [ctx.businessId])).rows as (RawService & { id: string; is_active: boolean })[];
    const facts = (await c.query("SELECT id, question, answer FROM business_facts WHERE business_id=$1 ORDER BY sort_order", [ctx.businessId])).rows as (RawFact & { id: string })[];
    return { biz, va, hours, services, facts };
  });

  const mode = data.va.booking_mode === "dias" ? "dias" : "horas";

  const promptInput: PromptInput = {
    businessName: data.biz.name, tone: data.va.tone, timezone: data.biz.timezone,
    address: data.biz.address, businessPhone: data.biz.phone, businessEmail: data.biz.email, website: data.biz.website,
    hours: data.hours as RawHour[], services: data.services as RawService[], facts: data.facts as RawFact[],
    bookingMode: mode,
  };
  const composed = composeSystemPrompt(promptInput);

  const initialModels: ModelsState = {
    transcriber: {
      provider: data.va.transcriber?.provider ?? DEFAULT_TRANSCRIBER.provider,
      model: data.va.transcriber?.model ?? DEFAULT_TRANSCRIBER.model,
      language: data.va.transcriber?.language ?? DEFAULT_TRANSCRIBER.language,
    },
    model: { provider: data.va.model?.provider ?? DEFAULT_MODEL.provider, model: data.va.model?.model ?? DEFAULT_MODEL.model },
    voice: {
      provider: data.va.voice_provider ?? DEFAULT_VOICE.provider,
      voiceId: data.va.voice_id ?? DEFAULT_VOICE.voiceId,
      voiceModel: data.va.voice_model ?? DEFAULT_VOICE.model,
      language: data.va.voice_language ?? "",
    },
  };

  return (
    <div className="space-y-8">
      <header className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="text-2xl font-semibold">Ajustes del Agente</h1>
        <PublishButton />
      </header>
      {data.va.published_at && <p className="hint -mt-4">Última publicación: {data.va.published_at.toString()}</p>}

      {/* 1 · Información del negocio */}
      <section className="card card-pad">
        <h2 className="font-semibold mb-3">1 · Información del negocio</h2>
        <p className="hint mb-3">El agente usa estos datos para responder (dirección, teléfono, web). El nombre también es el nombre del asistente en VAPI (máx. 40).</p>
        <form action={guardarInfoAction} className="grid md:grid-cols-2 gap-3">
          <div><label className="label">Nombre del negocio</label><input name="name" defaultValue={data.biz.name} maxLength={40} required className="field" /></div>
          <div>
            <label className="label">Zona horaria</label>
            <select name="timezone" defaultValue={data.biz.timezone} className="field">
              {TIMEZONES.map((tz) => <option key={tz} value={tz}>{tz}</option>)}
            </select>
          </div>
          <div><label className="label">Teléfono (lo normaliza a E.164)</label><input name="phone" defaultValue={data.biz.phone ?? ""} className="field" /></div>
          <div><label className="label">Correo</label><input name="email" defaultValue={data.biz.email ?? ""} className="field" /></div>
          <div><label className="label">Sitio web</label><input name="website" defaultValue={data.biz.website ?? ""} className="field" /></div>
          <div><label className="label">Dirección</label><input name="address" defaultValue={data.biz.address ?? ""} className="field" /></div>
          <div className="md:col-span-2"><button className="btn btn-primary">Guardar información</button></div>
        </form>
      </section>

      {/* 2 · Personalidad */}
      <section className="card card-pad">
        <h2 className="font-semibold mb-3">2 · Personalidad del agente</h2>
        <form action={guardarPersonalidadAction} className="grid md:grid-cols-2 gap-3">
          <div><label className="label">Tono</label><input name="tone" defaultValue={data.va.tone} className="field" /></div>
          <div><label className="label">Mensaje de bienvenida</label><input name="first_message" defaultValue={data.va.first_message ?? ""} className="field" /></div>
          <div>
            <label className="label">Modo de reserva</label>
            <select name="booking_mode" defaultValue={mode} className="field">
              <option value="horas">Por horas (talleres, peluquerías, médicos…)</option>
              <option value="dias">Por días (hoteles, alquileres, casas rurales…)</option>
            </select>
            <p className="hint">En modo «por días» cada servicio define su estancia en días y el agente reserva días completos.</p>
          </div>
          <div><label className="label">Número de derivación (a una persona)</label><input name="handoff_number" defaultValue={data.va.handoff_number ?? ""} className="field" placeholder="+34 600 000 000" /></div>
          <div><label className="label">Mensaje al derivar</label><input name="handoff_message" defaultValue={data.va.handoff_message ?? ""} className="field" /></div>
          <div><label className="label">Capacidad simultánea (huecos a la vez)</label><input name="slot_capacity" type="number" min={1} defaultValue={data.va.slot_capacity} className="field" /></div>
          <div><label className="label">Antelación mínima (min)</label><input name="min_notice_minutes" type="number" min={0} defaultValue={data.va.min_notice_minutes} className="field" /></div>
          <div><label className="label">Horizonte de reserva (días)</label><input name="booking_horizon_days" type="number" min={1} defaultValue={data.va.booking_horizon_days} className="field" /></div>
          <div><label className="label">Duración máxima de llamada (s)</label><input name="max_duration_seconds" type="number" min={60} defaultValue={data.va.max_duration_seconds} className="field" /></div>
          <div className="md:col-span-2"><button className="btn btn-primary">Guardar personalidad</button></div>
        </form>
        <div className="mt-4">
          <PromptEditor composed={composed} override={data.va.system_prompt_override} />
        </div>
      </section>

      {/* 3 · Modelos */}
      <section>
        <h2 className="font-semibold mb-3">3 · Modelos del agente</h2>
        <ModelsEditor initial={initialModels} />
      </section>

      {/* 4 · Servicios */}
      <section className="card card-pad">
        <h2 className="font-semibold mb-3">Catálogo de servicios</h2>
        <div className="space-y-2 mb-4">
          {data.services.length === 0 && <p className="text-sm text-surface-700">Sin servicios. Añade uno abajo.</p>}
          {data.services.map((s) => (
            <div key={s.id} className="flex items-center gap-2 flex-wrap">
              <span className="font-medium flex-1">{s.name}</span>
              <span className="text-xs text-surface-700">
                {mode === "dias" ? (s.durationDays ? `${s.durationDays} día${s.durationDays > 1 ? "s" : ""}` : "—") : `${s.durationMinutes} min`} · {s.priceCents != null ? `${(s.priceCents / 100).toFixed(0)} €` : "—"}
              </span>
              <form action={eliminarServicioAction} className="inline"><input type="hidden" name="id" value={s.id} /><button className="btn btn-ghost btn-sm" type="submit">Eliminar</button></form>
            </div>
          ))}
        </div>
        <form action={guardarServicioAction} className="grid md:grid-cols-4 gap-2">
          <input name="name" placeholder="Nombre" className="field" required />
          {mode === "dias" ? (
            <input name="duration_days" type="number" min={1} placeholder="Estancia (días)" className="field" required />
          ) : (
            <input name="duration_minutes" type="number" min={5} placeholder="Duración (min)" className="field" required />
          )}
          <input name="price_cents" type="number" placeholder="Precio (cénts. €), opcional" className="field" />
          <button className="btn btn-secondary">Añadir servicio</button>
        </form>
      </section>

      {/* 5 · FAQ */}
      <section className="card card-pad">
        <h2 className="font-semibold mb-3">Preguntas frecuentes</h2>
        <div className="space-y-2 mb-4">
          {data.facts.length === 0 && <p className="text-sm text-surface-700">Añade las preguntas que el agente recita.</p>}
          {data.facts.map((f) => (
            <div key={f.id} className="flex items-start gap-2">
              <div className="flex-1"><p className="text-sm font-medium">{f.question}</p><p className="text-sm text-surface-700">{f.answer}</p></div>
              <form action={eliminarFactAction} className="inline"><input type="hidden" name="id" value={f.id} /><button className="btn btn-ghost btn-sm" type="submit">Eliminar</button></form>
            </div>
          ))}
        </div>
        <form action={guardarFactAction} className="grid md:grid-cols-3 gap-2">
          <input name="question" placeholder="Pregunta" className="field" required />
          <input name="answer" placeholder="Respuesta" className="field" required />
          <button className="btn btn-secondary">Añadir FAQ</button>
        </form>
      </section>

      <section className="pt-2">
        <PublishButton />
      </section>
    </div>
  );
}