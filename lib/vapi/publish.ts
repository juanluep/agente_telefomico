/**
 * Publicación del asistente en VAPI (§4.7, §10). Compone firstMessage +
 * system prompt (override personalizado si existe, o el compuesto §10.3) +
 * toolIds (tools compartidas) + transcriber/model/voice (elegidos por el
 * negocio o el stack por defecto §10.1) y los empuja a VAPI vía REST desde el
 * servidor. analysisPlan.summaryPlan con `enabled: true` explícito (§14.1).
 *
 * Sin VAPI_API_KEY degrade con un mensaje claro, sin reventar (§19).
 */
import { withTenant } from "../db/tenant";
import { env, webhookUrl } from "../env";
import { DEFAULT_TRANSCRIBER, DEFAULT_MODEL, DEFAULT_VOICE, DEFAULT_MAX_DURATION_SECONDS, SERVER_MESSAGES, MAX_NAME_LENGTH } from "./defaults";
import { composeSystemPrompt, effectivePrompt, type PromptInput, type RawHour, type RawService, type RawFact } from "./prompt";
import { nativeToolOverrides } from "./tools-definitions";
import { syncPhoneDetails } from "./phone";

export interface PublishResult {
  ok: boolean;
  assistantId?: string;
  mode: "auto" | "custom";
  error?: string;
}

const API = "https://api.vapi.ai";

interface StackPiece { provider?: string | null; model?: string | null; language?: string | null; voiceId?: string | null }

function readTranscriber(va: StackPiece): Record<string, unknown> {
  const provider = va.provider || DEFAULT_TRANSCRIBER.provider as string;
  const model = va.model || DEFAULT_TRANSCRIBER.model as string;
  const language = va.language || DEFAULT_TRANSCRIBER.language as string;
  const out: Record<string, unknown> = { provider, model, language: (language ?? "") || "es" };
  if (!model) delete out.model;
  if (!language) delete out.language;
  return out;
}
function readModel(va: { provider?: string | null; model?: string | null }): Record<string, unknown> {
  return { provider: va.provider || DEFAULT_MODEL.provider, model: va.model || DEFAULT_MODEL.model };
}
function readVoice(va: StackPiece): Record<string, unknown> {
  const out: Record<string, unknown> = {
    provider: va.provider || DEFAULT_VOICE.provider,
    voiceId: va.voiceId || DEFAULT_VOICE.voiceId,
    model: va.model || DEFAULT_VOICE.model,
  };
  if (!out.model) delete out.model;
  if (va.language) out.language = va.language;
  return out;
}

export async function publishAssistant(businessId: string): Promise<PublishResult> {
  const e = env();
  if (!e.VAPI_API_KEY || !e.VAPI_SERVER_CREDENTIAL_ID) {
    return { ok: false, mode: "auto", error: "VAPI no está configurado (VAPI_API_KEY / VAPI_SERVER_CREDENTIAL_ID)." };
  }

  return withTenant(businessId, async (client) => {
    const biz = (await client.query("SELECT name, address, phone, email, website, timezone FROM businesses WHERE id=$1", [businessId])).rows[0] as {
      name: string; address: string | null; phone: string | null; email: string | null; website: string | null; timezone: string;
    };
    const va = (await client.query("SELECT * FROM voice_agents WHERE business_id=$1", [businessId])).rows[0] as Record<string, unknown> & {
      system_prompt_override: string | null; first_message: string | null; tone: string;
      model: { provider: string; model: string } | Record<string, never>;
      transcriber: { provider: string; model?: string; language?: string } | Record<string, never>;
      voice_provider: string | null; voice_id: string | null; voice_model: string | null; voice_language: string | null;
      handoff_number: string | null; vapi_assistant_id: string | null; vapi_phone_number_id: string | null;
      max_duration_seconds?: number | null; booking_mode?: "horas" | "dias";
    };
    const hours = (await client.query<RawHour>(
      `SELECT weekday, opens_at::text AS opensat, closes_at::text AS closesat, is_closed AS isclosed
       FROM business_hours WHERE business_id=$1`,
      [businessId],
    )).rows.map((r) => ({
      weekday: r.weekday,
      opensAt: (r as unknown as { opensat: string }).opensat,
      closesAt: (r as unknown as { closesat: string }).closesat,
      isClosed: (r as unknown as { isclosed: boolean }).isclosed,
    }));
    const services = (await client.query<RawService>("SELECT name, duration_minutes, duration_days, price_cents FROM services WHERE business_id=$1 AND is_active ORDER BY sort_order", [businessId])).rows;
    const facts = (await client.query<RawFact>("SELECT question, answer FROM business_facts WHERE business_id=$1 ORDER BY sort_order", [businessId])).rows;

    const promptInput: PromptInput = {
      businessName: biz.name,
      tone: va.tone,
      timezone: biz.timezone,
      address: biz.address, businessPhone: biz.phone, businessEmail: biz.email, website: biz.website,
      hours, services, facts,
      bookingMode: va.booking_mode === "dias" ? "dias" : "horas",
    };
    const composed = composeSystemPrompt(promptInput);
    const { prompt, mode } = effectivePrompt(composed, va.system_prompt_override);

    const toolRows = (await client.query("SELECT name, vapi_tool_id FROM vapi_tools")).rows as { name: string; vapi_tool_id: string }[];
    const toolIds = toolRows.map((r) => r.vapi_tool_id).filter(Boolean);

    // Stack: voice_agents.model / transcriber jsonb, o fallback absoluto a §10.1.
    const transcriberPayload = readTranscriber({
      provider: (va.transcriber as { provider?: string } | undefined)?.provider,
      model: (va.transcriber as { model?: string } | undefined)?.model,
      language: (va.transcriber as { language?: string } | undefined)?.language,
    });
    const modelPayload = readModel({
      provider: (va.model as { provider?: string } | undefined)?.provider,
      model: (va.model as { model?: string } | undefined)?.model,
    });
    const voicePayload = readVoice({
      provider: va.voice_provider, model: va.voice_model, voiceId: va.voice_id, language: va.voice_language,
    });

    const handoffNumber = va.handoff_number ?? null;
    const name = biz.name.slice(0, MAX_NAME_LENGTH);
    const firstMessage = va.first_message || composed.split("\n").find((l) => l.includes("buenas")) || `${biz.name}, buenas. Soy el asistente virtual, ¿en qué te puedo ayudar?`;

    const payload: Record<string, unknown> = {
      name,
      firstMessage,
      transcriber: transcriberPayload,
      model: {
        ...modelPayload,
        messages: [{ role: "system", content: prompt }],
        toolIds,
        ...nativeToolOverrides(handoffNumber),
      },
      voice: voicePayload,
      server: { url: webhookUrl(), credentialId: e.VAPI_SERVER_CREDENTIAL_ID },
      serverMessages: [...SERVER_MESSAGES],
      analysisPlan: {
        summaryPlan: {
          enabled: true,
          messages: [{ role: "system", content: "Resume la llamada en 2 o 3 frases: motivo, decisión y cita si la hubo (servicio, fecha y hora)." }],
        },
      },
      maxDurationSeconds: va.max_duration_seconds ?? DEFAULT_MAX_DURATION_SECONDS,
    };

    let assistantId = va.vapi_assistant_id;
    const baseHeaders = { Authorization: `Bearer ${e.VAPI_API_KEY}`, "Content-Type": "application/json" };
    if (assistantId) {
      const r = await fetch(`${API}/assistant/${assistantId}`, { method: "PATCH", headers: baseHeaders, body: JSON.stringify(payload) });
      if (!r.ok) return { ok: false, mode, error: `PATCH /assistant falló: ${r.status} ${await r.text()}` };
    } else {
      const r = await fetch(`${API}/assistant`, { method: "POST", headers: baseHeaders, body: JSON.stringify(payload) });
      if (!r.ok) return { ok: false, mode, error: `POST /assistant falló: ${r.status} ${await r.text()}` };
      const created = (await r.json()) as { id: string };
      assistantId = created.id;
    }

    // Verifica que summaryPlan quedó enabled:true (§14.1).
    const verify = await fetch(`${API}/assistant/${assistantId}`, { method: "GET", headers: baseHeaders });
    if (verify.ok) {
      const got = (await verify.json()) as { analysisPlan?: { summaryPlan?: { enabled?: boolean } } };
      if (!got.analysisPlan?.summaryPlan?.enabled) {
        console.warn("[vapi] analysisPlan.summaryPlan.enabled NO quedó a true. Revisa el asistente en el dashboard.");
      }
    }

    // Vincular el número al asistente si existe (§14.2).
    if (va.vapi_phone_number_id) {
      await fetch(`${API}/phone-number/${va.vapi_phone_number_id}`, {
        method: "PATCH", headers: baseHeaders,
        body: JSON.stringify({ assistantId }),
      });
      await syncPhoneDetails(client, va.vapi_phone_number_id);
    }

    const handoffMessage = "";
    const params = [assistantId, prompt, businessId];
    await client.query(
      `UPDATE voice_agents SET vapi_assistant_id = $1, system_prompt = $2${handoffMessage}, published_at = now() WHERE business_id = $3`,
      params,
    );

    return { ok: true, assistantId: assistantId ?? undefined, mode };
  });
}