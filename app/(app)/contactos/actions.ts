"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireSession } from "../../../lib/auth/context";
import { withTenant } from "../../../lib/db/tenant";
import { normalizePhone } from "../../../lib/phone";

const contactSchema = z.object({
  fullName: z.string().trim().min(1, "Dime el nombre."),
  phone: z.string().optional(),
  email: z.email().optional().or(z.literal("")),
  company: z.string().optional(),
  notes: z.string().optional(),
  tags: z.string().optional(),
  status: z.enum(["lead", "cliente", "inactivo"]).optional(),
});

export async function crearContactoAction(_prev: unknown, formData: FormData) {
  const ctx = await requireSession();
  const parsed = contactSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  const d = parsed.data;
  const phone = d.phone ? normalizePhone(d.phone) : null;

  await withTenant(ctx.businessId, async (c) => {
    const dup = phone ? await c.query("SELECT 1 FROM contacts WHERE business_id=$1 AND phone=$2", [ctx.businessId, phone]) : null;
    if (dup && dup.rowCount && dup.rowCount > 0) throw new Error("Ya existe un contacto con ese teléfono.");
    await c.query(
      `INSERT INTO contacts (business_id, full_name, phone, email, company, notes, tags, status, source)
       VALUES ($1,$2,$3,NULLIF($4,''),$5,$6,$7,$8,'manual')`,
      [
        ctx.businessId, d.fullName, phone, d.email ?? "", d.company ?? "", d.notes ?? "",
        d.tags ? d.tags.split(",").map((t) => t.trim()).filter(Boolean) : [],
        d.status ?? "lead",
      ],
    );
  });
  revalidatePath("/contactos");
  return { ok: true };
}

export async function actualizarContactoAction(_prev: unknown, formData: FormData) {
  const ctx = await requireSession();
  const id = String(formData.get("id") ?? "");
  if (!z.uuid().safeParse(id).success) return { error: "Contacto inválido." };
  const parsed = contactSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  const d = parsed.data;
  const phone = d.phone ? normalizePhone(d.phone) : null;
  await withTenant(ctx.businessId, async (c) => {
    await c.query(
      `UPDATE contacts SET full_name=$2, phone=$3, email=NULLIF($4,''), company=$5, notes=$6,
       tags=$7, status=$8, updated_at=now() WHERE id=$1 AND business_id=$9`,
      [
        id, d.fullName, phone, d.email ?? "", d.company ?? "", d.notes ?? "",
        d.tags ? d.tags.split(",").map((t) => t.trim()).filter(Boolean) : [],
        d.status ?? "lead", ctx.businessId,
      ],
    );
  });
  revalidatePath(`/contactos/${id}`);
  revalidatePath("/contactos");
  return { ok: true };
}

export async function eliminarContactoAction(_prev: unknown, formData: FormData) {
  const ctx = await requireSession();
  const id = String(formData.get("id") ?? "");
  if (!z.uuid().safeParse(id).success) return { error: "Contacto inválido." };
  // Las llamadas y citas sobreviven (contact_id a NULL); las notas caen en cascada (§8.3).
  await withTenant(ctx.businessId, (c) => c.query("DELETE FROM contacts WHERE id=$1 AND business_id=$2", [id, ctx.businessId]));
  revalidatePath("/contactos");
  return { ok: true };
}

export async function anadirNotaAction(_prev: unknown, formData: FormData) {
  const ctx = await requireSession();
  const id = String(formData.get("id") ?? "");
  const body = String(formData.get("body") ?? "").trim();
  if (!z.uuid().safeParse(id).success || !body) return { error: "Nota vacía." };
  await withTenant(ctx.businessId, (c) =>
    c.query("INSERT INTO contact_notes (business_id, contact_id, body, author_user_id) VALUES ($1,$2,$3,$4)",
      [ctx.businessId, id, body, ctx.userId]),
  );
  revalidatePath(`/contactos/${id}`);
  return { ok: true };
}