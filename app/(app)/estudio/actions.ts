"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireSession } from "../../../lib/auth/context";
import { withTenant } from "../../../lib/db/tenant";
import { normalizePhone } from "../../../lib/phone";
import { publishAssistant } from "../../../lib/vapi/publish";
import { DEFAULT_FIRST_MESSAGE, DEFAULT_TONE } from "../../../lib/nicho";
import { DEFAULT_TRANSCRIBER, DEFAULT_MODEL } from "../../../lib/vapi/defaults";

// Los formularios en línea del Estudio usan `<form action>`: firma de un solo
// argumento (formData) y devuelven void. El estado (errores/pendiente) lo
// gestionan los componentes cliente con useActionState para los que lo necesiten.

export async function guardarInfoAction(formData: FormData): Promise<void> {
  const ctx = await requireSession();
  const name = String(formData.get("name") ?? "").trim().slice(0, 40);
  if (!name) return;
  const timezone = String(formData.get("timezone") ?? "Europe/Madrid");
  const phone = normalizePhone(String(formData.get("phone") ?? "")) ?? null;
  const email = String(formData.get("email") ?? "").trim() || null;
  const website = String(formData.get("website") ?? "").trim() || null;
  const address = String(formData.get("address") ?? "").trim() || null;
  await withTenant(ctx.businessId, (c) =>
    c.query("UPDATE businesses SET name=$1, timezone=$2, phone=$3, email=$4, website=$5, address=$6 WHERE id=$7", [name, timezone, phone, email, website, address, ctx.businessId]),
  );
  revalidatePath("/estudio");
}

export async function guardarPersonalidadAction(formData: FormData): Promise<void> {
  const ctx = await requireSession();
  const tone = String(formData.get("tone") ?? DEFAULT_TONE).trim() || DEFAULT_TONE;
  const firstMessage = String(formData.get("first_message") ?? "").trim() || DEFAULT_FIRST_MESSAGE(ctx.businessName);
  const handoffNumber = normalizePhone(String(formData.get("handoff_number") ?? "")) ?? null;
  const handoffMessage = String(formData.get("handoff_message") ?? "").trim() || null;
  const bookingMode = formData.get("booking_mode") === "dias" ? "dias" : "horas";
  const slotCapacity = Math.max(1, Number(formData.get("slot_capacity") ?? 1) || 1);
  const minNotice = Math.max(0, Number(formData.get("min_notice_minutes") ?? 60) || 60);
  const horizon = Math.max(1, Number(formData.get("booking_horizon_days") ?? 60) || 60);
  const maxDuration = Math.max(60, Number(formData.get("max_duration_seconds") ?? 600) || 600);
  await withTenant(ctx.businessId, (c) =>
    c.query(
      `UPDATE voice_agents SET tone=$1, first_message=$2, handoff_number=$3, handoff_message=$4,
       booking_mode=$5, slot_capacity=$6, min_notice_minutes=$7, booking_horizon_days=$8, max_duration_seconds=$9 WHERE business_id=$10`,
      [tone, firstMessage, handoffNumber, handoffMessage, bookingMode, slotCapacity, minNotice, horizon, maxDuration, ctx.businessId],
    ),
  );
  revalidatePath("/estudio");
}

export async function guardarPromptAction(formData: FormData): Promise<void> {
  const ctx = await requireSession();
  const mode = String(formData.get("mode") ?? "auto");
  const text = String(formData.get("override") ?? "").trim();
  if (mode === "custom" && text) {
    // Si el texto guardado coincide con el compuesto, effectivePrompt lo deja en auto (§10.3).
    await withTenant(ctx.businessId, (c) => c.query("UPDATE voice_agents SET system_prompt_override=$1 WHERE business_id=$2", [text, ctx.businessId]));
  } else {
    await withTenant(ctx.businessId, (c) => c.query("UPDATE voice_agents SET system_prompt_override=NULL WHERE business_id=$1", [ctx.businessId]));
  }
  revalidatePath("/estudio");
}

export async function guardarModelosAction(formData: FormData): Promise<void> {
  const ctx = await requireSession();
  const trP = String(formData.get("transcriber_provider") ?? "");
  const trM = String(formData.get("transcriber_model") ?? "");
  const trL = String(formData.get("transcriber_language") ?? "");
  const mdP = String(formData.get("model_provider") ?? "");
  const mdM = String(formData.get("model_model") ?? "");
  const vcP = String(formData.get("voice_provider") ?? "");
  const vcV = String(formData.get("voiceId") ?? "");
  const vcM = String(formData.get("voice_model") ?? "");
  const vcL = String(formData.get("voice_language") ?? "");

  const transcriber = JSON.stringify({
    provider: trP || DEFAULT_TRANSCRIBER.provider,
    model: trM || (trP === DEFAULT_TRANSCRIBER.provider ? DEFAULT_TRANSCRIBER.model : ""),
    language: trL || (trP === DEFAULT_TRANSCRIBER.provider ? DEFAULT_TRANSCRIBER.language : null),
  });
  const model = JSON.stringify({ provider: mdP || DEFAULT_MODEL.provider, model: mdM || DEFAULT_MODEL.model });

  if (vcP) {
    await withTenant(ctx.businessId, (c) =>
      c.query(
        `UPDATE voice_agents SET transcriber=$1, model=$2, voice_provider=$3, voice_id=$4, voice_model=$5, voice_language=$6 WHERE business_id=$7`,
        [transcriber, model, vcP, vcV || null, vcM || null, vcL || null, ctx.businessId],
      ),
    );
  } else {
    await withTenant(ctx.businessId, (c) => c.query(`UPDATE voice_agents SET transcriber=$1, model=$2 WHERE business_id=$3`, [transcriber, model, ctx.businessId]));
  }
  revalidatePath("/estudio");
}

const serviceSchema = z.object({
  name: z.string().min(1),
  duration_minutes: z.coerce.number().int().min(5),
  duration_days: z.coerce.number().int().min(1).nullable().optional(),
  price_cents: z.coerce.number().int().nullable(),
});

export async function guardarServicioAction(formData: FormData): Promise<void> {
  const ctx = await requireSession();
  const id = formData.get("id") ? String(formData.get("id")) : null;
  const parsed = serviceSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return;
  const d = parsed.data;
  const description = String(formData.get("description") ?? "");
  const order = Number(formData.get("sort_order") ?? 0) || 0;
  const active = formData.get("is_active") === "1";
  const durationDays = d.duration_days ?? null;
  await withTenant(ctx.businessId, async (c) => {
    if (id && z.uuid().safeParse(id).success) {
      await c.query("UPDATE services SET name=$1,duration_minutes=$2,duration_days=$3,price_cents=$4,description=$5,sort_order=$6,is_active=$7 WHERE id=$8", [d.name, d.duration_minutes, durationDays, d.price_cents, description, order, active, id]);
    } else {
      await c.query("INSERT INTO services (business_id,name,duration_minutes,duration_days,price_cents,description,sort_order,is_active) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)", [ctx.businessId, d.name, d.duration_minutes, durationDays, d.price_cents, description, order, active]);
    }
  });
  revalidatePath("/estudio");
}

export async function eliminarServicioAction(formData: FormData): Promise<void> {
  const ctx = await requireSession();
  const id = String(formData.get("id") ?? "");
  if (!z.uuid().safeParse(id).success) return;
  await withTenant(ctx.businessId, (c) => c.query("DELETE FROM services WHERE id=$1", [id]));
  revalidatePath("/estudio");
}

export async function guardarFactAction(formData: FormData): Promise<void> {
  const ctx = await requireSession();
  const id = formData.get("id") ? String(formData.get("id")) : null;
  const question = String(formData.get("question") ?? "").trim();
  const answer = String(formData.get("answer") ?? "").trim();
  if (!question || !answer) return;
  const order = Number(formData.get("sort_order") ?? 0) || 0;
  await withTenant(ctx.businessId, async (c) => {
    if (id && z.uuid().safeParse(id).success) {
      await c.query("UPDATE business_facts SET question=$1, answer=$2, sort_order=$3 WHERE id=$4", [question, answer, order, id]);
    } else {
      await c.query("INSERT INTO business_facts (business_id, question, answer, sort_order) VALUES ($1,$2,$3,$4)", [ctx.businessId, question, answer, order]);
    }
  });
  revalidatePath("/estudio");
}

export async function eliminarFactAction(formData: FormData): Promise<void> {
  const ctx = await requireSession();
  const id = String(formData.get("id") ?? "");
  if (!z.uuid().safeParse(id).success) return;
  await withTenant(ctx.businessId, (c) => c.query("DELETE FROM business_facts WHERE id=$1", [id]));
  revalidatePath("/estudio");
}

// Publicar usa useActionState (state) en PublishButton → firma (prev, formData).
export async function publicarAction(_prev: unknown, _formData: FormData) {
  const ctx = await requireSession();
  const res = await publishAssistant(ctx.businessId);
  revalidatePath("/estudio");
  revalidatePath("/panel");
  if (!res.ok) return { error: res.error ?? "No se pudo publicar." };
  return { ok: true, assistantId: res.assistantId, mode: res.mode };
}