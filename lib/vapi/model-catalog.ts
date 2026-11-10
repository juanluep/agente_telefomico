/**
 * Metadatos curados del catálogo de modelos (§10.4, capa 2). Módulo puro,
 * importable de servidor y cliente. NO se edita a mano para añadir ids — eso
 * va por regeneración del fichero generado; aquí van etiquetas legibles,
 * recomendados y ESTIMACIONES orientativas de coste ($/min) y latencia (ms),
 * coherentes con la línea base §10.1 (320+800+490 ms y ≈$0.11/min contando la
 * cuota de plataforma de $0.05/min). No son precios contractuales: la interfaz
 * lo deja claro.
 */
import { PLATFORM_FEE_USD_PER_MIN } from "./defaults";
import type { ProviderCatalogEntry } from "./catalog-data.generated";

/** Etiqueta legible del nombre técnico de proveedor. */
export function providerLabel(provider: string): string {
  return provider
    .replace(/Transcriber$/, "")
    .replace(/Model$/, "")
    .replace(/Voice$/, "")
    .replace(/([a-z])([A-Z])/g, "$1 $2");
}

/** Etiquetas estables para ids de modelo conocidos; el resto se devuelve tal cual. */
const MODEL_LABELS: Record<string, string> = {
  "gpt-5.6-luna": "GPT 5.6 Luna",
  "gpt-5.6-terra": "GPT 5.6 Terra",
  "gpt-5.6-sol": "GPT 5.6 Sol",
  "gpt-5.5": "GPT 5.5",
  "gpt-5-mini": "GPT 5 Mini",
  "gpt-5-nano": "GPT 5 Nano",
  "gpt-4.1": "GPT 4.1",
  "gpt-4.1-mini": "GPT 4.1 Mini",
  "nova-3-general": "Nova 3 General",
  "nova-3": "Nova 3",
  "eleven_turbo_v2_5": "Eleven Turbo v2.5",
  "eleven_turbo_v2": "Eleven Turbo v2",
  "eleven_multilingual_v2": "Eleven Multilingual v2",
  "eleven_flash_v2_5": "Eleven Flash v2.5",
  "claude-haiku-4.5": "Claude Haiku 4.5",
  "claude-sonnet-4.5": "Claude Sonnet 4.5",
  "gemini-2.5-flash": "Gemini 2.5 Flash",
};

export function modelLabel(provider: string, model: string): string {
  return MODEL_LABELS[model] ?? model;
}

/** Recomendados (§10.4): Deepgram, OpenAI, ElevenLabs — los del stack por defecto. */
export const RECOMMENDED = {
  transcriber: "DeepgramTranscriber",
  llm: "OpenAIModel",
  voice: "ElevenLabsVoice",
} as const;

/** ¿Es el proveedor/modelo del stack por defecto de §10.1? */
export function isDefaultStackPiece(
  kind: "transcriber" | "llm" | "voice",
  provider: string,
  model: string | null,
): boolean {
  if (kind === "transcriber") return provider === RECOMMENDED.transcriber && (model ?? "") === "nova-3-general";
  if (kind === "llm") return provider === RECOMMENDED.llm && (model ?? "") === "gpt-5.6-luna";
  return provider === RECOMMENDED.voice;
}

export interface Estimate {
  costUsdPerMin: number;
  latencyMs: number;
}

function llmEstimate(provider: string, model: string | null): Estimate {
  const p = provider.toLowerCase();
  const m = model ?? "";
  if (p.includes("openai")) {
    if (m.startsWith("gpt-5.6")) return { costUsdPerMin: 0.01, latencyMs: 800 };
    if (m.startsWith("gpt-5")) return { costUsdPerMin: 0.012, latencyMs: 700 };
    if (m.startsWith("gpt-4o")) return { costUsdPerMin: 0.006, latencyMs: 600 };
    if (m.startsWith("o1") || m.startsWith("o3") || m.startsWith("o4")) return { costUsdPerMin: 0.04, latencyMs: 1500 };
    return { costUsdPerMin: 0.012, latencyMs: 800 };
  }
  if (p.includes("anthropic")) return { costUsdPerMin: 0.012, latencyMs: 800 };
  if (p.includes("deepseek")) return { costUsdPerMin: 0.005, latencyMs: 600 };
  if (p.includes("groq")) return { costUsdPerMin: 0.005, latencyMs: 400 };
  if (p.includes("google")) return { costUsdPerMin: 0.007, latencyMs: 700 };
  if (p.includes("cerebras")) return { costUsdPerMin: 0.006, latencyMs: 300 };
  return { costUsdPerMin: 0.015, latencyMs: 800 };
}

function transcriberEstimate(provider: string, _model: string | null): Estimate {
  const p = provider.toLowerCase();
  if (p.includes("deepgram")) return { costUsdPerMin: 0.01, latencyMs: 320 };
  if (p.includes("assembly")) return { costUsdPerMin: 0.012, latencyMs: 400 };
  if (p.includes("azure")) return { costUsdPerMin: 0.012, latencyMs: 450 };
  if (p.includes("google")) return { costUsdPerMin: 0.008, latencyMs: 350 };
  if (p.includes("vapi")) return { costUsdPerMin: 0.012, latencyMs: 350 };
  return { costUsdPerMin: 0.012, latencyMs: 400 };
}

function voiceEstimate(provider: string, _model: string | null): Estimate {
  const p = provider.toLowerCase();
  if (p.includes("eleven")) return { costUsdPerMin: 0.036, latencyMs: 490 };
  if (p.includes("cartesia")) return { costUsdPerMin: 0.06, latencyMs: 250 };
  if (p.includes("playht") || p.includes("play")) return { costUsdPerMin: 0.05, latencyMs: 300 };
  if (p.includes("deepgram")) return { costUsdPerMin: 0.05, latencyMs: 200 };
  if (p.includes("openai")) return { costUsdPerMin: 0.04, latencyMs: 350 };
  if (p.includes("vapi")) return { costUsdPerMin: 0.05, latencyMs: 300 };
  return { costUsdPerMin: 0.05, latencyMs: 400 };
}

export function estimate(kind: "transcriber" | "llm" | "voice", provider: string, model: string | null): Estimate {
  if (kind === "transcriber") return transcriberEstimate(provider, model);
  if (kind === "llm") return llmEstimate(provider, model);
  return voiceEstimate(provider, model);
}

/** Estimación total de un stack (STT + LLM + TTS + cuota de plataforma). */
export function estimateStack(stack: {
  transcriber: { provider: string; model: string | null };
  llm: { provider: string; model: string | null };
  voice: { provider: string; model: string | null };
}): Estimate {
  const stt = estimate("transcriber", stack.transcriber.provider, stack.transcriber.model);
  const llm = estimate("llm", stack.llm.provider, stack.llm.model);
  const tts = estimate("voice", stack.voice.provider, stack.voice.model);
  return {
    costUsdPerMin: round4(stt.costUsdPerMin + llm.costUsdPerMin + tts.costUsdPerMin + PLATFORM_FEE_USD_PER_MIN),
    latencyMs: stt.latencyMs + llm.latencyMs + tts.latencyMs,
  };
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

/** Comprueba que una selección está dentro del catálogo generado (lista blanca). */
export function validateSelection(
  entry: ProviderCatalogEntry | undefined,
  model: string | null,
  language: string | null,
  voiceId: string | null,
): string | null {
  if (!entry) return "Proveedor fuera de catálogo.";
  if (model) {
    if (!entry.modelsFree && entry.models && !entry.models.includes(model)) return "Modelo fuera de catálogo.";
  }
  if (language && entry.languages && !entry.languages.includes(language)) return "Idioma fuera de catálogo.";
  if (voiceId && !entry.voiceIdFree && entry.voices && !entry.voices.includes(voiceId)) return "Voz fuera de catálogo.";
  return null;
}