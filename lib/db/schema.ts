/**
 * Esquema Drizzle que espeja db/migrations/0001_init.sql. Sirve para selects
 * tipados (la conversión de timestamptz a Date la hace Drizzle; con db.execute
 * llegarían como string, §5). Los enums TS de aquí alimentan lib/labels.ts.
 *
 * Las migraciones las manda el SQL, no este fichero: drizzle-kit queda como
 * herramienta de introspección y tipos (§2).
 */
import { sql } from "drizzle-orm";
import {
  boolean,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  time,
  timestamp,
  uuid,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";

export const membershipRole = pgEnum("membership_role", ["owner", "staff"]);
export const contactStatus = pgEnum("contact_status", ["lead", "cliente", "inactivo"]);
export const contactSource = pgEnum("contact_source", ["agente_voz", "manual", "importado"]);
export const callDirection = pgEnum("call_direction", ["inbound", "outbound"]);
export const callStatus = pgEnum(
  "call_status",
  ["scheduled", "queued", "ringing", "in-progress", "forwarding", "ended"],
);
export const callMsgRole = pgEnum("call_msg_role", ["assistant", "user", "system", "tool"]);
export const appointmentStatus = pgEnum(
  "appointment_status",
  ["agendada", "confirmada", "completada", "anulada", "no_show"],
);
export const appointmentCreatedVia = pgEnum("appointment_created_via", ["agente_voz", "panel"]);

export const businesses = pgTable("businesses", {
  id: uuid("id").primaryKey().default(sql`uuidv7()`),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  timezone: text("timezone").notNull().default("Europe/Madrid"),
  phone: text("phone"),
  email: text("email"),
  website: text("website"),
  address: text("address"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const users = pgTable("users", {
  id: uuid("id").primaryKey().default(sql`uuidv7()`),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  fullName: text("full_name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const memberships = pgTable("memberships", {
  userId: uuid("user_id").notNull(),
  businessId: uuid("business_id").notNull(),
  role: membershipRole("role").notNull().default("owner"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const sessions = pgTable("sessions", {
  id: uuid("id").primaryKey().default(sql`uuidv7()`),
  userId: uuid("user_id").notNull(),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  userAgent: text("user_agent"),
  ip: text("ip"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const voiceAgents = pgTable("voice_agents", {
  businessId: uuid("business_id").primaryKey(),
  systemPrompt: text("system_prompt"),
  systemPromptOverride: text("system_prompt_override"),
  firstMessage: text("first_message"),
  tone: text("tone").notNull().default("cercano y resolutivo"),
  voiceProvider: text("voice_provider"),
  voiceId: text("voice_id"),
  voiceModel: text("voice_model"),
  voiceLanguage: text("voice_language"),
  language: text("language").notNull().default("es"),
  model: jsonb("model").notNull().default({}),
  transcriber: jsonb("transcriber").notNull().default({}),
  handoffNumber: text("handoff_number"),
  handoffMessage: text("handoff_message"),
  slotCapacity: integer("slot_capacity").notNull().default(1),
  minNoticeMinutes: integer("min_notice_minutes").notNull().default(60),
  bookingHorizonDays: integer("booking_horizon_days").notNull().default(60),
  bookingMode: text("booking_mode").notNull().default("horas"),
  maxDurationSeconds: integer("max_duration_seconds").notNull().default(600),
  vapiAssistantId: text("vapi_assistant_id"),
  vapiPhoneNumberId: text("vapi_phone_number_id"),
  publishedAt: timestamp("published_at", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const businessFacts = pgTable("business_facts", {
  id: uuid("id").primaryKey().default(sql`uuidv7()`),
  businessId: uuid("business_id").notNull(),
  question: text("question").notNull(),
  answer: text("answer").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const services = pgTable("services", {
  id: uuid("id").primaryKey().default(sql`uuidv7()`),
  businessId: uuid("business_id").notNull(),
  name: text("name").notNull(),
  durationMinutes: integer("duration_minutes").notNull().default(60),
  durationDays: integer("duration_days"),
  priceCents: integer("price_cents"),
  description: text("description"),
  isActive: boolean("is_active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const businessHours = pgTable("business_hours", {
  id: uuid("id").primaryKey().default(sql`uuidv7()`),
  businessId: uuid("business_id").notNull(),
  weekday: integer("weekday").notNull(),
  opensAt: time("opens_at", { withTimezone: false }).notNull(),
  closesAt: time("closes_at", { withTimezone: false }).notNull(),
  isClosed: boolean("is_closed").notNull().default(false),
});

export const closures = pgTable("closures", {
  id: uuid("id").primaryKey().default(sql`uuidv7()`),
  businessId: uuid("business_id").notNull(),
  startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
  endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
  reason: text("reason"),
});

export const contacts = pgTable(
  "contacts",
  {
    id: uuid("id").primaryKey().default(sql`uuidv7()`),
    businessId: uuid("business_id").notNull(),
    fullName: text("full_name"),
    phone: text("phone"),
    email: text("email"),
    company: text("company"),
    notes: text("notes"),
    tags: text("tags").notNull().default(sql`'{}'::text[]`),
    status: contactStatus("status").notNull().default("lead"),
    source: contactSource("source").notNull().default("manual"),
    customFields: jsonb("custom_fields").notNull().default({}),
    outboundConsent: boolean("outbound_consent").notNull().default(false),
    lastContactedAt: timestamp("last_contacted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("contacts_business_phone_uniq")
      .on(t.businessId, t.phone)
      .where(sql`${t.phone} IS NOT NULL`),
    index("contacts_name_trgm_idx").using("gin", sql`f_unaccent(${t.fullName}) gin_trgm_ops`),
  ],
);

export const contactNotes = pgTable("contact_notes", {
  id: uuid("id").primaryKey().default(sql`uuidv7()`),
  businessId: uuid("business_id").notNull(),
  contactId: uuid("contact_id").notNull(),
  body: text("body").notNull(),
  authorUserId: uuid("author_user_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const calls = pgTable("calls", {
  id: uuid("id").primaryKey().default(sql`uuidv7()`),
  businessId: uuid("business_id").notNull(),
  contactId: uuid("contact_id"),
  vapiCallId: text("vapi_call_id").notNull().unique(),
  direction: callDirection("direction").notNull().default("inbound"),
  fromNumber: text("from_number"),
  startedAt: timestamp("started_at", { withTimezone: true }),
  endedAt: timestamp("ended_at", { withTimezone: true }),
  durationSeconds: integer("duration_seconds"),
  status: callStatus("status").notNull().default("queued"),
  endedReason: text("ended_reason"),
  summary: text("summary"),
  costCents: integer("cost_cents"),
  recordingUrl: text("recording_url"),
  needsReview: boolean("needs_review").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const callMessages = pgTable("call_messages", {
  id: uuid("id").primaryKey().default(sql`uuidv7()`),
  businessId: uuid("business_id").notNull(),
  callId: uuid("call_id").notNull(),
  role: callMsgRole("role").notNull(),
  content: text("content").notNull(),
  secondsFromStart: integer("seconds_from_start"),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const appointments = pgTable("appointments", {
  id: uuid("id").primaryKey().default(sql`uuidv7()`),
  businessId: uuid("business_id").notNull(),
  contactId: uuid("contact_id"),
  callId: uuid("call_id"),
  serviceId: uuid("service_id"),
  serviceName: text("service_name"),
  startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
  endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
  status: appointmentStatus("status").notNull().default("agendada"),
  notes: text("notes"),
  createdVia: appointmentCreatedVia("created_via").notNull().default("panel"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const webhookEvents = pgTable("webhook_events", {
  id: uuid("id").primaryKey().default(sql`uuidv7()`),
  businessId: uuid("business_id"),
  provider: text("provider").notNull().default("vapi"),
  eventType: text("event_type").notNull(),
  externalId: text("external_id").notNull().unique(),
  payload: jsonb("payload").notNull().default({}),
  processedAt: timestamp("processed_at", { withTimezone: true }),
  error: text("error"),
});

export const vapiTools = pgTable("vapi_tools", {
  name: text("name").primaryKey(),
  vapiToolId: text("vapi_tool_id").notNull(),
  checksum: text("checksum").notNull(),
  syncedAt: timestamp("synced_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Business = typeof businesses.$inferSelect;
export type User = typeof users.$inferSelect;
export type VoiceAgent = typeof voiceAgents.$inferSelect;
export type Service = typeof services.$inferSelect;
export type Contact = typeof contacts.$inferSelect;
export type Call = typeof calls.$inferSelect;
export type Appointment = typeof appointments.$inferSelect;
export type CallMessage = typeof callMessages.$inferSelect;
export type BusinessFact = typeof businessFacts.$inferSelect;