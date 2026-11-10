/**
 * vapi:pull-catalog (§10.4). Descarga el OpenAPI PÚBLICO de VAPI
 * (api.vapi.ai/api-json, sin API key) y vuelca a
 * lib/vapi/catalog-data.generated.ts los enums reales de proveedores, modelos,
 * idiomas y voces, con las banderas modelsFree / voiceIdFree leídas del propio
 * esquema. NUNCA se edita a mano: ampliar el catálogo = regenerar este fichero.
 */
import { writeFileSync } from "node:fs";

interface SchemaRef {
  $ref?: string;
}
interface Schema {
  type?: string;
  enum?: unknown[];
  properties?: Record<string, Schema>;
  description?: string;
  oneOf?: SchemaRef[];
}
interface OpenApi {
  components: { schemas: Record<string, Schema> };
}

const SPEC_URL = "https://api.vapi.ai/api-json";
const OUT = new URL("../lib/vapi/catalog-data.generated.ts", import.meta.url).pathname;

function refName(s?: SchemaRef): string | null {
  return s?.$ref?.split("/")?.pop() ?? null;
}

// Variantes regionales tipo "gpt-4o…:westus" son ruido operativo (§10.4).
function isRegionalVariant(v: unknown): boolean {
  return typeof v === "string" && /:[a-z]+$/.test(v);
}

function enumOrFail(arr: unknown[] | undefined): string[] | null {
  if (!arr || !arr.length) return null;
  return (arr as unknown[]).filter((v) => typeof v === "string" && !isRegionalVariant(v)) as string[];
}

function describeProvider(schema: Schema): {
  models: string[] | null;
  modelsFree: boolean;
  languages: string[] | null;
  voices: string[] | null;
  voiceIdFree: boolean;
  hasModel: boolean;
  hasLanguage: boolean;
  hasVoiceId: boolean;
} {
  const props = schema.properties ?? {};
  const modelField = props["model"];
  const langField = props["language"];
  const voiceIdField = props["voiceId"];

  const hasModel = Boolean(modelField);
  const hasLanguage = Boolean(langField);
  const hasVoiceId = Boolean(voiceIdField);

  let models: string[] | null = null;
  let modelsFree = false;
  if (hasModel) {
    if (modelField!.enum) models = enumOrFail(modelField!.enum);
    else if (modelField!.type === "string") modelsFree = true;
  }

  let languages: string[] | null = null;
  if (hasLanguage && langField!.enum) languages = enumOrFail(langField!.enum);

  let voices: string[] | null = null;
  let voiceIdFree = false;
  if (hasVoiceId) {
    if (voiceIdField!.enum) voices = enumOrFail(voiceIdField!.enum);
    else if (voiceIdField!.type === "string") voiceIdFree = true;
    else if (!voiceIdField!.type) voiceIdFree = true; // sin type + sin enum → libre (11labs)
  }

  return { models, modelsFree, languages, voices, voiceIdFree, hasModel, hasLanguage, hasVoiceId };
}

function providerName(schemaName: string): string {
  return schemaName; // ej. DeepgramTranscriber → se normaliza downstream
}

function extractCategory(doc: OpenApi, cat: "transcriber" | "model" | "voice") {
  const s = doc.components.schemas["CreateAssistantDTO"]!.properties![cat]!;
  const oneOf = s.oneOf ?? [];
  const out: Array<{
    provider: string;
    models: string[] | null;
    modelsFree: boolean;
    languages: string[] | null;
    voices: string[] | null;
    voiceIdFree: boolean;
  }> = [];
  for (const o of oneOf) {
    const name = refName(o);
    if (!name) continue;
    if (/^Custom/.test(name)) continue; // pseudo-proveedores (BYO server)
    const schema = doc.components.schemas[name];
    if (!schema) continue;
    const d = describeProvider(schema);
    out.push({
      provider: providerName(name),
      models: d.models,
      modelsFree: d.modelsFree,
      languages: d.languages,
      voices: d.voices,
      voiceIdFree: d.voiceIdFree,
    });
  }
  return out;
}

async function main() {
  console.log("Descargando OpenAPI de", SPEC_URL);
  const res = await fetch(SPEC_URL);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const doc = (await res.json()) as OpenApi;

  const transcribers = extractCategory(doc, "transcriber");
  const llms = extractCategory(doc, "model");
  const voices = extractCategory(doc, "voice");

  const ts = `// ⚠️ NO EDITAR A MANO — generado por \`pnpm vapi:pull-catalog\` (§10.4).
// Fuente: OpenAPI público de VAPI (api.vapi.ai/api-json), ${new Date().toISOString().slice(0, 10)}.
// Ampliar el catálogo = regenerar este fichero, jamás añadir un id a mano (§0.1).
// Recuento actual: ${transcribers.length} transcriptores, ${llms.length} LLM, ${voices.length} voces.

export interface ProviderCatalogEntry {
  provider: string;
  models: string[] | null;
  modelsFree: boolean;
  languages: string[] | null;
  voices: string[] | null;
  voiceIdFree: boolean;
}

export const TRANSCRIBERS: ProviderCatalogEntry[] = ${JSON.stringify(transcribers, null, 2)};

export const LLMS: ProviderCatalogEntry[] = ${JSON.stringify(llms, null, 2)};

export const VOICES: ProviderCatalogEntry[] = ${JSON.stringify(voices, null, 2)};
`;

  writeFileSync(OUT, ts);
  console.log(`Generado ${OUT}`);
  console.log(`  ${transcribers.length} transcriptores, ${llms.length} LLM, ${voices.length} voces.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});