/**
 * Semillero idempotente (§5). Crea un negocio de demostración para talleres
 * mecánicos con contactos, llamadas y citas de ejemplo, para que la app no
 * se abra vacía. El usuario de demo es el del README.
 *
 * Corre con el rol PROPIETARIO (superuser), que salta RLS, por simplicidad del
 * setup. La app en runtime usa app_user + withTenant; el aislamiento real lo
 * demuestra el test de integración (tests/), no el seed.
 */
process.loadEnvFile?.();

import bcryptjs from "bcryptjs";
import pg from "pg";

import { ownerDatabaseUrl } from "../lib/env";

const DEMO_EMAIL = "demo@taller.es";
const DEMO_PASSWORD = "demo1234";
const BUSINESS_NAME = "Agente Taller";
const TZ = "Europe/Madrid";

async function main() {
  const { Pool } = pg;
  const pool = new Pool({ connectionString: ownerDatabaseUrl() });
  const c = await pool.connect();
  try {
    const existing = await c.query("SELECT id FROM users WHERE email = $1", [DEMO_EMAIL]);
    if (existing.rowCount && existing.rowCount > 0) {
      console.log("El seed ya estaba aplicado (usuario demo existe). Nada que hacer.");
      return;
    }

    const passwordHash = bcryptjs.hashSync(DEMO_PASSWORD, 12);

    await c.query("BEGIN");

    // Negocio
    const baseSlug = BUSINESS_NAME.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    let slug = baseSlug;
    let n = 1;
    while ((await c.query("SELECT 1 FROM businesses WHERE slug = $1", [slug])).rowCount) {
      slug = `${baseSlug}-${n++}`;
    }
    const biz = await c.query(
      `INSERT INTO businesses (name, slug, timezone, phone, email, address)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [BUSINESS_NAME, slug, TZ, "+34910000000", "taller@agente.dev", "Polígono Industrial El Pino, nave 14, Albacete"],
    );
    const businessId = biz.rows[0].id;

    // Usuario
    const usr = await c.query(
      `INSERT INTO users (email, password_hash, full_name) VALUES ($1, $2, $3) RETURNING id`,
      [DEMO_EMAIL, passwordHash, "Josema Fernández"],
    );
    const userId = usr.rows[0].id;
    await c.query(
      `INSERT INTO memberships (user_id, business_id, role) VALUES ($1, $2, 'owner')`,
      [userId, businessId],
    );

    // Voice agent
    await c.query(
      `INSERT INTO voice_agents (
         business_id, first_message, tone, language, slot_capacity,
         min_notice_minutes, booking_horizon_days, max_duration_seconds)
       VALUES ($1, $2, $3, 'es', 3, 60, 60, 600)`,
      [
        businessId,
        "Agente Taller, buenas. Soy el asistente virtual, ¿en qué te puedo ayudar?",
        "cercano y resolutivo",
      ],
    );

    // Horario semanal (0=dom … 6=sáb). Lun-vie 9-14 y 16-19; sáb 9-14; dom cerrado.
    const hours: [number, string, string, boolean][] = [
      [1, "09:00", "14:00", false], [1, "16:00", "19:00", false],
      [2, "09:00", "14:00", false], [2, "16:00", "19:00", false],
      [3, "09:00", "14:00", false], [3, "16:00", "19:00", false],
      [4, "09:00", "14:00", false], [4, "16:00", "19:00", false],
      [5, "09:00", "14:00", false], [5, "16:00", "19:00", false],
      [6, "09:00", "14:00", false],
      [0, "00:00", "00:00", true],
    ];
    for (const [wd, o, cl, closed] of hours) {
      await c.query(
        `INSERT INTO business_hours (business_id, weekday, opens_at, closes_at, is_closed)
         VALUES ($1, $2, $3, $4, $5)`,
        [businessId, wd, o, cl, closed],
      );
    }

    // Servicios del nicho
    const svc: { name: string; dur: number; price: number | null; desc: string }[] = [
      { name: "Cambio de aceite", dur: 60, price: 4500, desc: "Aceite y filtro incluidos." },
      { name: "Revisión general", dur: 90, price: 6000, desc: "Revisión de frenos, líquidos y suspensiones." },
      { name: "Frenos", dur: 75, price: 9000, desc: "Pastillas y/o discos." },
      { name: "Diagnóstico electrónico", dur: 45, price: 3500, desc: "Lectura de errores del cuadro." },
      { name: "Neumáticos", dur: 60, price: 2000, desc: "Montaje y equilibrado por neumático (precio orientativo)." },
    ];
    for (let i = 0; i < svc.length; i++) {
      const s = svc[i]!;
      await c.query(
        `INSERT INTO services (business_id, name, duration_minutes, price_cents, description, sort_order)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [businessId, s.name, s.dur, s.price, s.desc, i],
      );
    }

    // FAQ
    const facts: [string, string][] = [
      ["¿Tienen aparcamiento?", "Sí, plaza delante de la nave."],
      ["¿Hay coche de cortesía?", "No, lo sentimos. Pero hay parada de autobús a 100 m."],
      ["¿Admiten pago con tarjeta?", "Sí, tarjeta y Bizum."],
    ];
    for (let i = 0; i < facts.length; i++) {
      const [q, a] = facts[i]!;
      await c.query(
        `INSERT INTO business_facts (business_id, question, answer, sort_order) VALUES ($1, $2, $3, $4)`,
        [businessId, q, a, i],
      );
    }

    // Contactos de ejemplo
    const contacts = await c.query(
      `WITH ins AS (
         INSERT INTO contacts (business_id, full_name, phone, email, status, source, custom_fields, outbound_consent)
         VALUES
           ($1, 'Javier Ruiz',   '+34600123456', 'javier.ruiz@example.com', 'cliente', 'manual',     '{"matricula":"1234 FGH","vehiculo":"VW Golf"}', true),
           ($1, 'María López',   '+34600987654', NULL,                      'lead',    'agente_voz', '{"matricula":"9876 BCD","vehiculo":"Seat León"}', false),
           ($1, 'Carlos Sánchez', '+34655112233', 'carlos@example.com',      'cliente', 'importado',  '{"matricula":"5511 XYZ","vehiculo":"Audi A3"}', true)
         RETURNING id, full_name
       ) SELECT * FROM ins`,
      [businessId],
    );

    // Una llamada con transcripción y una cita asociada
    const startedAt = new Date(Date.now() - 1000 * 60 * 60 * 26);
    const endedAt = new Date(startedAt.getTime() + 1000 * 60 * 4);
    const callRes = await c.query(
      `INSERT INTO calls (
         business_id, contact_id, vapi_call_id, direction, from_number,
         started_at, ended_at, duration_seconds, status, ended_reason,
         summary, cost_cents, recording_url)
       VALUES ($1, $2, $3, 'inbound', '+34600987654',
               $4, $5, 240, 'ended', 'customer-ended-call',
               'La clienta pidió cita para un cambio de aceite el próximo jueves. Cerrada la cita.',
               26, NULL) RETURNING id`,
      [businessId, contacts.rows[1].id, `seed-call-${Date.now()}`, startedAt, endedAt],
    );
    const callId = callRes.rows[0].id;
    const msgs: [string, string, number, number][] = [
      ["assistant", "Agente Taller, buenas. Soy el asistente virtual, ¿en qué te puedo ayudar?", 0, 0],
      ["user", "Hola, quería una cita para cambiar el aceite.", 2, 1],
      ["assistant", "Claro. El cambio de aceite nos lleva una hora. ¿Qué día te viene bien?", 4, 2],
      ["user", "El jueves por la mañana si puede ser.", 6, 3],
      ["assistant", "Déjame mirar la agenda un segundo.", 7, 4],
      ["assistant", "El jueves tengo a las nueve y media o a las once. ¿Cuál prefieres?", 9, 5],
      ["user", "A las once.", 11, 6],
      ["assistant", "Perfecto. ¿Me dices la matrícula y el modelo del coche?", 12, 7],
      ["user", "Es un León, 9876 BCD.", 14, 8],
      ["assistant", "Y tu nombre, por favor.", 15, 9],
      ["user", "María.", 16, 10],
      ["assistant", "Vale María. Cambio de aceite, el jueves catorce a las once, para el León con matrícula 9876 BCD. ¿Lo confirmo?", 17, 11],
      ["user", "Sí.", 19, 12],
      ["assistant", "Hecho. Te esperamos el jueves a las once. Hasta luego, María.", 20, 13],
    ];
    for (const [role, content, secs, order] of msgs) {
      await c.query(
        `INSERT INTO call_messages (business_id, call_id, role, content, seconds_from_start, sort_order)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [businessId, callId, role, content, secs, order],
      );
    }

    // Cita futura + una pasada completada
    const futureStart = new Date();
    futureStart.setDate(futureStart.getDate() + 3);
    futureStart.setHours(11, 0, 0, 0);
    const futureEnd = new Date(futureStart.getTime() + 60 * 60 * 1000);
    await c.query(
      `INSERT INTO appointments (business_id, contact_id, call_id, service_name, starts_at, ends_at, status, created_via, notes)
       VALUES ($1, $2, $3, 'Cambio de aceite', $4, $5, 'confirmada', 'agente_voz', 'Matrícula 9876 BCD · Seat León')`,
      [businessId, contacts.rows[1].id, callId, futureStart, futureEnd],
    );

    const pastStart = new Date(Date.now() - 1000 * 60 * 60 * 24 * 7);
    pastStart.setHours(10, 0, 0, 0);
    const pastEnd = new Date(pastStart.getTime() + 60 * 60 * 1000);
    await c.query(
      `INSERT INTO appointments (business_id, contact_id, service_name, starts_at, ends_at, status, created_via)
       VALUES ($1, $2, 'Revisión general', $3, $4, 'completada', 'panel')`,
      [businessId, contacts.rows[0].id, pastStart, pastEnd],
    );

    await c.query(
      `INSERT INTO contact_notes (business_id, contact_id, body, author_user_id)
       VALUES ($1, $2, 'Cliente recurrente. Prefiere avisos por WhatsApp.', $3)`,
      [businessId, contacts.rows[0].id, userId],
    );

    await c.query("COMMIT");

    console.log("Seed aplicado.");
    console.log(`  Negocio: ${BUSINESS_NAME} (slug ${slug})`);
    console.log(`  Usuario: ${DEMO_EMAIL} / ${DEMO_PASSWORD}`);
    console.log("  Verás contactos, una llamada con transcripción y dos citas (una futura).");
  } catch (err) {
    await c.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    c.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});