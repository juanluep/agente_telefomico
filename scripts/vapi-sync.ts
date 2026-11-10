/**
 * vapi:sync (§15.3). Reescribe el server.url de TODOS los asistentes de este
 * despliegue Y de las tools compartidas a partir de APP_URL. Si solo
 * actualizaras el asistente, las tool calls seguirían yendo a la URL vieja y el
 * agente contestaría pero no agenda — el fallo más desconcertante (§15.3, §14.6).
 */
process.loadEnvFile?.();

import pg from "pg";
const { env, webhookUrl } = await import("../lib/env");
const { syncPhoneDetails } = await import("../lib/vapi/phone");

const API = "https://api.vapi.ai";

async function main() {
  if (!env().VAPI_API_KEY) {
    console.error("Falta VAPI_API_KEY.");
    process.exit(1);
  }
  const url = webhookUrl();
  const headers = { Authorization: `Bearer ${env().VAPI_API_KEY}`, "Content-Type": "application/json" };

  const pool = new pg.Pool({ connectionString: (await import("../lib/env")).ownerDatabaseUrl() });
  const assistants = (await pool.query("SELECT vapi_assistant_id, vapi_phone_number_id FROM voice_agents WHERE vapi_assistant_id IS NOT NULL")).rows as { vapi_assistant_id: string; vapi_phone_number_id: string | null }[];
  const tools = (await pool.query("SELECT name, vapi_tool_id FROM vapi_tools")).rows as { name: string; vapi_tool_id: string }[];

  console.log(`Reescribiendo server.url → ${url}`);
  for (const a of assistants) {
    const r = await fetch(`${API}/assistant/${a.vapi_assistant_id}`, {
      method: "PATCH", headers,
      body: JSON.stringify({ server: { url, credentialId: env().VAPI_SERVER_CREDENTIAL_ID } }),
    });
    console.log(r.ok ? `  ✓ asistente ${a.vapi_assistant_id}` : `  ✗ asistente ${a.vapi_assistant_id} (${r.status})`);

    const phone = await syncPhoneDetails(pool, a.vapi_phone_number_id);
    if (phone) console.log(`  ✓ número ${phone.number ?? phone.id} (${phone.provider ?? "?"})`);
  }
  for (const t of tools) {
    const r = await fetch(`${API}/tool/${t.vapi_tool_id}`, {
      method: "PATCH", headers,
      body: JSON.stringify({ server: { url, credentialId: env().VAPI_SERVER_CREDENTIAL_ID } }),
    });
    console.log(r.ok ? `  ✓ tool ${t.name}` : `  ✗ tool ${t.name} (${r.status})`);
  }
  await pool.end();
  console.log("Sincronización de server.url terminada.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});