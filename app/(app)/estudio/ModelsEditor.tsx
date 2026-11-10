"use client";

import { useMemo, useState } from "react";

import { TRANSCRIBERS, LLMS, VOICES, type ProviderCatalogEntry } from "../../../lib/vapi/catalog-data.generated";
import { estimate, estimateStack, providerLabel, modelLabel, RECOMMENDED, type Estimate } from "../../../lib/vapi/model-catalog";
import { guardarModelosAction } from "./actions";

export interface ModelsState {
  transcriber: { provider: string; model: string; language: string };
  model: { provider: string; model: string };
  voice: { provider: string; voiceId: string; voiceModel: string; language: string };
}

function entryFor(list: ProviderCatalogEntry[], provider: string): ProviderCatalogEntry | undefined {
  return list.find((e) => e.provider === provider);
}

function ProviderSelect({ list, value, onChange }: { list: ProviderCatalogEntry[]; value: string; onChange: (v: string) => void }) {
  const recommended = (p: string) => p === RECOMMENDED.transcriber || p === RECOMMENDED.llm || p === RECOMMENDED.voice;
  return (
    <select className="field" value={value} onChange={(e) => onChange(e.target.value)}>
      {list.map((e) => (
        <option key={e.provider} value={e.provider}>
          {providerLabel(e.provider)}
          {recommended(e.provider) ? "  · recomendado" : ""}
        </option>
      ))}
    </select>
  );
}

function ModelSelect({ entry, value, onChange }: { entry: ProviderCatalogEntry | undefined; value: string; onChange: (v: string) => void }) {
  if (!entry || entry.modelsFree || !entry.models) {
    return <input className="field font-mono text-xs" placeholder="id exacto del modelo" value={value} onChange={(e) => onChange(e.target.value)} />;
  }
  return (
    <select className="field" value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">— selecciona —</option>
      {entry.models.map((m) => <option key={m} value={m}>{modelLabel(entry.provider, m)}</option>)}
    </select>
  );
}

function EstimateBar({ label, parts, total, colors }: { label: string; parts: [string, number][]; total: number; colors: string[] }) {
  const isCost = label.includes("Coste");
  const vals = parts.map((p) => p[1]).filter((v) => v > 0);
  const max = Math.max(...vals.map((v) => v * 1.4).concat([1]));
  const fmt = (v: number) => (isCost ? `$${v.toFixed(3)}` : `${v} ms`);
  return (
    <div className="mb-3">
      <p className="text-sm font-semibold mb-1">
        {label} <span className="text-surface-700">· {fmt(total)}</span>
      </p>
      <div className="flex gap-0.5 h-6 rounded-lg overflow-hidden bg-surface-100" style={{ minWidth: 220, transition: "width .25s ease" }}>
        {parts.map(([name, v], i) =>
          v > 0 ? (
            <div
              key={name}
              title={`${name}: ${fmt(v)}`}
              style={{ width: `${Math.max((v / max) * 100, 6)}%`, background: colors[i], transition: "width .25s ease" }}
              className="rounded-md"
            />
          ) : null,
        )}
      </div>
      <div className="flex flex-wrap gap-3 mt-1 text-xs text-surface-700">
        {parts.map(([name, v], i) => (
          <span key={name} className="inline-flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-sm" style={{ background: colors[i] }} /> {name}: {fmt(v)}
          </span>
        ))}
      </div>
    </div>
  );
}

export function ModelsEditor({ initial }: { initial: ModelsState }) {
  const [s, setS] = useState<ModelsState>(initial);

  const trEntry = entryFor(TRANSCRIBERS, s.transcriber.provider);
  const llmEntry = entryFor(LLMS, s.model.provider);
  const vcEntry = entryFor(VOICES, s.voice.provider);

  const stt = useMemo(() => estimate("transcriber", s.transcriber.provider, s.transcriber.model || null), [s.transcriber]);
  const llm = useMemo(() => estimate("llm", s.model.provider, s.model.model || null), [s.model]);
  const tts = useMemo(() => estimate("voice", s.voice.provider, s.voice.voiceModel || null), [s.voice]);
  const est: Estimate = useMemo(
    () => estimateStack({ transcriber: { provider: s.transcriber.provider, model: s.transcriber.model || null }, llm: { provider: s.model.provider, model: s.model.model || null }, voice: { provider: s.voice.provider, model: s.voice.voiceModel || null } }),
    [s],
  );

  return (
    <div className="space-y-4">
      <div className="grid lg:grid-cols-3 gap-4">
        <div className="card card-pad">
          <h3 className="font-semibold mb-2">Transcripción <span className="text-xs text-surface-700">· convierte a texto lo que dice el cliente</span></h3>
          <label className="label">Proveedor</label>
          <ProviderSelect list={TRANSCRIBERS} value={s.transcriber.provider} onChange={(v) => setS({ ...s, transcriber: { ...s.transcriber, provider: v } })} />
          <label className="label mt-2">Modelo</label>
          <ModelSelect entry={trEntry} value={s.transcriber.model} onChange={(v) => setS({ ...s, transcriber: { ...s.transcriber, model: v } })} />
          {trEntry?.languages && (
            <>
              <label className="label mt-2">Idioma</label>
              <select className="field" value={s.transcriber.language} onChange={(e) => setS({ ...s, transcriber: { ...s.transcriber, language: e.target.value } })}>
                {(trEntry.languages ?? []).map((l) => <option key={l} value={l}>{l}</option>)}
              </select>
            </>
          )}
        </div>

        <div className="card card-pad">
          <h3 className="font-semibold mb-2">Modelo de IA <span className="text-xs text-surface-700">· decide qué responder y cuándo dar cita</span></h3>
          <label className="label">Proveedor</label>
          <ProviderSelect list={LLMS} value={s.model.provider} onChange={(v) => setS({ ...s, model: { ...s.model, provider: v } })} />
          <label className="label mt-2">Modelo</label>
          <ModelSelect entry={llmEntry} value={s.model.model} onChange={(v) => setS({ ...s, model: { ...s.model, model: v } })} />
        </div>

        <div className="card card-pad">
          <h3 className="font-semibold mb-2">Voz <span className="text-xs text-surface-700">· la voz que oye el cliente</span></h3>
          <label className="label">Proveedor</label>
          <ProviderSelect list={VOICES} value={s.voice.provider} onChange={(v) => setS({ ...s, voice: { ...s.voice, provider: v } })} />
          <label className="label mt-2">Motor</label>
          <ModelSelect entry={vcEntry} value={s.voice.voiceModel} onChange={(v) => setS({ ...s, voice: { ...s.voice, voiceModel: v } })} />
          <label className="label mt-2">VoiceId</label>
          {vcEntry?.voiceIdFree || !vcEntry?.voices ? (
            <input className="field font-mono text-xs" placeholder="id de la voz (librería del proveedor)" value={s.voice.voiceId} onChange={(e) => setS({ ...s, voice: { ...s.voice, voiceId: e.target.value } })} />
          ) : (
            <select className="field" value={s.voice.voiceId} onChange={(e) => setS({ ...s, voice: { ...s.voice, voiceId: e.target.value } })}>
              <option value="">—</option>
              {(vcEntry.voices ?? []).map((v) => <option key={v} value={v}>{v}</option>)}
            </select>
          )}
          {vcEntry?.languages && (
            <>
              <label className="label mt-2">Idioma</label>
              <select className="field" value={s.voice.language} onChange={(e) => setS({ ...s, voice: { ...s.voice, language: e.target.value } })}>
                <option value="">—</option>
                {(vcEntry.languages ?? []).map((l) => <option key={l} value={l}>{l}</option>)}
              </select>
            </>
          )}
        </div>
      </div>

      <div className="card card-pad">
        <h3 className="font-semibold mb-3">Estimación en vivo</h3>
        <EstimateBar label="Coste $/min" parts={[["Transcripción", stt.costUsdPerMin], ["IA", llm.costUsdPerMin], ["Voz", tts.costUsdPerMin], ["Plataforma", 0.05]]} total={est.costUsdPerMin} colors={["var(--stack-stt)", "var(--stack-llm)", "var(--stack-tts)", "var(--stack-fee)"]} />
        <EstimateBar label="Latencia" parts={[["Transcripción", stt.latencyMs], ["IA", llm.latencyMs], ["Voz", tts.latencyMs]]} total={est.latencyMs} colors={["var(--stack-stt)", "var(--stack-llm)", "var(--stack-tts)"]} />
        <p className="hint">Cifras orientativas, no incluyen la telefonía. Algunos proveedores poco comunes pueden requerir conectar su clave en el panel de VAPI (Dashboard → Integrations).</p>

        <form action={guardarModelosAction} className="mt-4">
          <input type="hidden" name="transcriber_provider" value={s.transcriber.provider} />
          <input type="hidden" name="transcriber_model" value={s.transcriber.model} />
          <input type="hidden" name="transcriber_language" value={s.transcriber.language} />
          <input type="hidden" name="model_provider" value={s.model.provider} />
          <input type="hidden" name="model_model" value={s.model.model} />
          <input type="hidden" name="voice_provider" value={s.voice.provider} />
          <input type="hidden" name="voice_model" value={s.voice.voiceModel} />
          <input type="hidden" name="voiceId" value={s.voice.voiceId} />
          <input type="hidden" name="voice_language" value={s.voice.language} />
          <button className="btn btn-primary">Guardar modelos</button>
          <span className="ml-2 text-xs text-surface-700">Activa «cambios sin publicar»; pulsa Publicar para enviarlos a VAPI.</span>
        </form>
      </div>
    </div>
  );
}