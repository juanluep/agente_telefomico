/**
 * Stack de modelos por defecto — OBLIGATORIO como punto de partida (§10.1).
 * Todo asistente creado por la app sale con esta combinación; es el respaldo
 * cuando el negocio no ha elegido nada. No sustituir por "defaults seguros".
 *
 * Los identificadores se verificaron contra el OpenAPI público de VAPI
 * (api.vapi.ai/api-json) en agosto de 2026:
 *   - GPT 5.6 Luna → id exacto "gpt-5.6-luna" (en el enum de OpenAIModel).
 *   - ElevenLabs → motor "eleven_turbo_v2_5" (en el enum de ElevenLabsVoice);
 *     voiceId "UOIqAnmS11Reiei1Ytkc" es texto libre (etiqueta "burt" en el
 *     panel; en NUESTRA interfaz se presenta como "Carolina").
 *   - Deepgram → "nova-3-general" (texto libre en el esquema) + language "es".
 *
 * DOBLE-CHECK recomendado: configura una vez el asistente a mano en el
 * dashboard de VAPI y haz GET /assistant/{id} para copiar los valores literales
 * antes de la primera publicación real (§10.1). Si no cuadran, ajusta aquí y
 * deja constancia en el README.
 */

export const DEFAULT_TRANSCRIBER = {
  provider: "deepgram",
  model: "nova-3-general",
  language: "es",
} as const;

export const DEFAULT_MODEL = {
  provider: "openai",
  model: "gpt-5.6-luna",
} as const;

export const DEFAULT_VOICE = {
  provider: "11labs",
  voiceId: "UOIqAnmS11Reiei1Ytkc",
  model: "eleven_turbo_v2_5",
} as const;

/** Etiqueta legible de la voz por defecto en NUESTRA interfaz. */
export const DEFAULT_VOICE_LABEL = "Carolina";

/** Referencia de la línea base: ≈ $0.11/min y ≈ 1.610 ms (320 + 800 + 490). */
export const BASELINE_COST_USD_PER_MIN = 0.11;
export const BASELINE_LATENCY_MS = 1610;
export const PLATFORM_FEE_USD_PER_MIN = 0.05;

/** Eventos de servidor que el asistente debe enviar al webhook (§10.2). */
export const SERVER_MESSAGES = [
  "tool-calls",
  "end-of-call-report",
  "status-update",
  "transcript",
] as const;

export const MAX_NAME_LENGTH = 40; // lo impone la API de VAPI
export const DEFAULT_MAX_DURATION_SECONDS = 600;