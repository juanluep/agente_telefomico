/**
 * Tipos y extracción de los payloads del webhook de VAPI (§9.4, §14.1).
 *
 * 🚨 EL NOMBRE DE LA TOOL NO VIENE SUELTO: viene dentro de `function`, y los
 * argumentos son un STRING JSON, no un objeto. El esquema real ToolCall tiene
 * required: [id, type, function], con function.name y function.arguments
 * (string). Leer solo `toolCall.name` deja el nombre en undefined, el bucle se
 * salta todas las invocaciones y el agente se queda sin herramientas — sin que
 * nada falle ni se registre el error. Por eso aceptamos LAS DOS formas (la
 * plana de los ejemplos y la real) con una función de extracción única.
 */

export interface ToolCallItem {
  id: string;
  type?: string;
  // forma real:
  function?: { name?: string; arguments?: string };
  // forma plana de algunos ejemplos:
  name?: string;
  parameters?: Record<string, unknown>;
  arguments?: Record<string, unknown>;
}

export interface VapiCallPart {
  id?: string;
  type?: string;
  status?: string;
  assistantId?: string;
  phoneNumberId?: string;
  customer?: { number?: string; name?: string };
  metadata?: Record<string, unknown>;
}

export interface ArtifactMessage {
  role: string; // bot | user | system | tool_calls | tool_call_result
  message?: string;
  content?: string;
  result?: string;
  transcript?: string;
  secondsFromStart?: number;
}

export interface Artifact {
  transcript?: string;
  recordingUrl?: string;
  messages?: ArtifactMessage[];
}

export interface VapiMessage {
  type: string;
  toolCallList?: ToolCallItem[];
  status?: string;
  endedReason?: string;
  startedAt?: string;
  endedAt?: string;
  cost?: number;
  analysis?: { summary?: string; structuredData?: unknown; successEvaluation?: string };
  artifact?: Artifact;
  call?: VapiCallPart;
  transcript?: string;
  role?: string;
}

/** Extrae el nombre de la tool de las dos formas posibles. */
export function extractToolName(tc: ToolCallItem): string | null {
  return tc.function?.name ?? tc.name ?? null;
}

/** Extrae y deserializa los argumentos de la tool (string JSON u objeto). */
export function extractToolArgs(tc: ToolCallItem): Record<string, unknown> {
  let args: unknown = tc.function?.arguments ?? tc.parameters ?? tc.arguments ?? {};
  if (typeof args === "string") {
    try {
      args = JSON.parse(args) as Record<string, unknown>;
    } catch {
      args = {};
    }
  }
  return (args ?? {}) as Record<string, unknown>;
}