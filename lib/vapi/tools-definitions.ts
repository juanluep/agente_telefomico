/**
 * Definiciones de las tools compartidas del agente (§9). Se publican una sola
 * vez en VAPI con nuestro server.url (recursos compartidos por toolIds, §4.4) y
 * el script vapi:tools:sync las crea/actualiza de forma idempotente.
 *
 * - 7 tools de tipo `function` que resuelven contra nuestro webhook.
 * - 2 tools NATIVAS de VAPI (transferCall, endCall) declaradas como tales; NO
 *   las implementamos nosotros (§9.3): el corte de llamada lo hace la plataforma.
 *
 * Los `messages` de tool rellenan los silencios en las tools lentas (§9.5).
 * El número del llamante y el negocio NUNCA son parámetros del modelo (§9.1).
 */

export interface ToolDefinition {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
  messages?: { type: string; content: string; timingMilliseconds?: number }[];
}

const SLOW_MESSAGES = [
  { type: "request-start", content: "Déjame mirar la agenda un segundo." },
  { type: "request-failed", content: "Ahora mismo no puedo consultar la agenda. ¿Te llamamos nosotros?" },
  { type: "request-response-delayed", content: "Sigo mirando, un momento.", timingMilliseconds: 3000 },
];

export const FUNCTION_TOOLS: ToolDefinition[] = [
  {
    type: "function",
    function: {
      name: "identificarLlamante",
      description:
        "Llámala AL EMPEZAR la conversación para saber si quien llama ya es cliente y poder saludarle por su nombre. No lleva parámetros: el número lo resuelve el servidor.",
      parameters: { type: "object", properties: {}, additionalProperties: false },
    },
  },
  {
    type: "function",
    function: {
      name: "consultarHuecos",
      description:
        "Consulta la agenda REAL antes de proponer horas o días. Devuelve hasta 3 opciones hablables. Parámetros opcionales todos: servicio, fechaPreferida (ISO), franja (manana|tarde|cualquiera), diasVista (1-30), duracionDias (solo si el negocio reserva por días, p. ej. hoteles).",
      parameters: {
        type: "object",
        properties: {
          servicio: { type: "string", description: "Nombre del servicio que pide el cliente, si lo dice." },
          fechaPreferida: { type: "string", format: "date-time", description: "Fecha preferida en ISO 8601, opcional." },
          franja: { type: "string", enum: ["manana", "tarde", "cualquiera"] },
          diasVista: { type: "integer", minimum: 1, maximum: 30 },
          duracionDias: { type: "integer", minimum: 1, maximum: 30, description: "Noches/días de estancia, solo en negocios que reservan por días." },
        },
        additionalProperties: false,
      },
    },
    messages: [...SLOW_MESSAGES],
  },
  {
    type: "function",
    function: {
      name: "reservarCita",
      description:
        "Reserva la cita SOLO después de que el cliente haya confirmado una hora o fecha concreta. inicioIso en ISO UTC (en negocios por días, el día de entrada). El teléfono y el negocio los resuelve el servidor.",
      parameters: {
        type: "object",
        required: ["inicioIso", "servicio", "nombre"],
        properties: {
          inicioIso: { type: "string", format: "date-time" },
          servicio: { type: "string" },
          nombre: { type: "string", description: "Nombre del cliente." },
          email: { type: "string", format: "email" },
          notas: { type: "string" },
          duracionDias: { type: "integer", minimum: 1, maximum: 30, description: "Noches/días de estancia, solo en negocios que reservan por días." },
          datosExtra: {
            type: "object",
            description: "Datos libres del nicho (p. ej. matrícula y modelo del vehículo).",
            additionalProperties: true,
          },
        },
        additionalProperties: false,
      },
    },
    messages: [...SLOW_MESSAGES],
  },
  {
    type: "function",
    function: {
      name: "reprogramarCita",
      description: "Mueve la próxima cita de quien llama a una nueva hora. nuevoInicioIso en ISO UTC.",
      parameters: {
        type: "object",
        required: ["nuevoInicioIso"],
        properties: {
          nuevoInicioIso: { type: "string", format: "date-time" },
          citaId: { type: "string", format: "uuid" },
        },
        additionalProperties: false,
      },
    },
    messages: [...SLOW_MESSAGES],
  },
  {
    type: "function",
    function: {
      name: "anularCita",
      description: "Anula la próxima cita de quien llama. Solo actúa sobre citas de ese número.",
      parameters: {
        type: "object",
        properties: {
          citaId: { type: "string", format: "uuid" },
          motivo: { type: "string" },
        },
        additionalProperties: false,
      },
    },
    messages: [...SLOW_MESSAGES],
  },
  {
    type: "function",
    function: {
      name: "datosDelNegocio",
      description:
        "Consulta la ficha del negocio (dirección, horarios, servicios, FAQ) para responder dudas. Úsala si no lo sabes de memoria.",
      parameters: {
        type: "object",
        properties: { tema: { type: "string", description: "Tema por el que pregunta, opcional." } },
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "registrarHandoff",
      description:
        "Anota que hizo falta derivar a una persona, para que aparezca en el panel como revisión. No realiza la transferencia (esa la hace la tool nativa transferCall).",
      parameters: {
        type: "object",
        required: ["motivo"],
        properties: { motivo: { type: "string", description: "Motivo por el que se deriva." } },
        additionalProperties: false,
      },
    },
  },
];

/**
 * Tools nativas de VAPI (§9.3). Se enganchan INLINE en el asistente (no son
 * recursos compartidos con server.url). El destino de transferencia es el
 * número de derivación del negocio; se rellena en publish.
 */
export function nativeToolOverrides(handoffNumber: string | null) {
  const tools: Record<string, unknown>[] = [
    {
      type: "endCall",
    },
  ];
  if (handoffNumber) {
    tools.unshift({
      type: "transferCall",
      destinations: [{ type: "number", number: handoffNumber, message: "Te paso con una persona, un momento." }],
    });
  }
  return { tools };
}