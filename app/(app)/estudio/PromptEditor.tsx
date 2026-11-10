"use client";

import { useState } from "react";

import { guardarPromptAction } from "./actions";

export function PromptEditor({ composed, override }: { composed: string; override: string | null }) {
  const usingCustom = Boolean(override && override.trim() && override.trim() !== composed.trim());
  const [mode, setMode] = useState<"auto" | "custom">(usingCustom ? "custom" : "auto");
  const [text, setText] = useState(override ?? composed);

  return (
    <div className="card card-pad">
      <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
        <h3 className="font-semibold">System prompt</h3>
        <div className="flex items-center gap-2">
          {mode === "custom"
            ? <span className="badge-warn">Personalizado · congelado</span>
            : <span className="badge-ok">Automático</span>}
          {mode === "custom" && (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => { setMode("auto"); setText(composed); }}
            >
              Volver al automático
            </button>
          )}
        </div>
      </div>

      {mode === "custom" && (
        <p className="hint mb-2">
          Al guardar un prompt personalizado se publica TAL CUAL y queda congelado: los cambios de horarios, servicios o FAQ ya
          no se incorporan solos. Si el texto guardado coincide con el automático, se queda en automático. Cambiar de nicho es
          ajustar TIPO_NEGOCIO y DATOS_EXTRA en lib/nicho.ts (ver §10.3).
        </p>
      )}

      <form
        action={guardarPromptAction}
        className="space-y-3"
        onSubmit={(e) => {
          // sincroniza el textarea con el campo antes de enviar
          const ta = e.currentTarget.querySelector("textarea[name=override]") as HTMLTextAreaElement;
          ta.value = mode === "custom" ? text : "";
        }}
      >
        <input type="hidden" name="mode" value={mode} />
        <textarea
          name="override"
          rows={18}
          className="field font-mono text-xs"
          value={text}
          readOnly={mode === "auto"}
          onChange={(e) => setText(e.target.value)}
        />
        <p className="text-xs text-surface-700">{text.length} caracteres</p>
        {mode === "auto" ? (
          <button type="button" className="btn btn-secondary" onClick={() => { setMode("custom"); setText(override ?? composed); }}>
            Personalizar este prompt
          </button>
        ) : (
          <button type="submit" className="btn btn-primary">Guardar prompt personalizado</button>
        )}
      </form>
    </div>
  );
}