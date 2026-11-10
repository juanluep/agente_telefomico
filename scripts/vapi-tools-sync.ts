/**
 * vapi:tools:sync (§4.4, §11). Crea o actualiza en VAPI las 7 tools de función
 * compartidas (con su server.url apuntando al webhook) y guarda sus IDs en
 * vapi_tools, con un checksum de la definición para detectar cambios. Se
 * ejecuta al desplegar y cada vez que cambien las definiciones de §9.
 *
 * Idempotente. Necesita VAPI_API_KEY. Las tools son recursos compartidos: NO se
 * duplican por negocio — cada asistente las referencia por toolIds.
 */
process.loadEnvFile?.();

import { createHash } from "node:crypto";
const { pool } = await import("../lib/db/pool");
const { env, webhookUrl } = await import("../lib/env");
import { FUNCTION_TOOLS, type ToolDefinition } from "../lib/vapi/tools-definitions";

const API = "https://api.vapi.ai";

function checksum(def: ToolDefinition): string {
  return createHash("sha256").update(JSON.stringify(def)).digest("hex").slice(0, 16);
}

async function main() {
  if (!env().VAPI_API_KEY) {
    console.error("Falta VAPI_API_KEY. No se puede sincronizar tools.");
    process.exit(1);
  }
  const headers = { Authorization: `Bearer ${env().VAPI_API_KEY}`, "Content-Type": "application/json" };
  const url = webhookUrl();

  for (const def of FUNCTION_TOOLS) {
    const cs = checksum(def);
    const payload: Record<string, unknown> = {
      type: "function",
      function: def.function,
      ...(def.messages ? { messages: def.messages } : {}),
      // El server.url a nivel de tool (§14.2): prioridad tool > asistente.
      server: { url, credentialId: env().VAPI_SERVER_CREDENTIAL_ID },
    };

    const existing = await pool.query<{ vapi_tool_id: string; checksum: string }>(
      "SELECT vapi_tool_id, checksum FROM vapi_tools WHERE name = $1",
      [def.function.name],
    );
    const row = existing.rows[0];

    if (row && row.checksum === cs) {
      console.log(`  = ${def.function.name} (sin cambios)`);
      continue;
    }

    if (row) {
      const r = await fetch(`${API}/tool/${row.vapi_tool_id}`, { method: "PATCH", headers, body: JSON.stringify(payload) });
      if (!r.ok) {
        console.error(`  ✗ ${def.function.name} PATCH falló ${r.status}: ${await r.text()}`);
        continue;
      }
      await pool.query("UPDATE vapi_tools SET checksum=$1, synced_at=now() WHERE name=$2", [cs, def.function.name]);
      console.log(`  ↻ ${def.function.name} actualizada (${row.vapi_tool_id})`);
    } else {
      const r = await fetch(`${API}/tool`, { method: "POST", headers, body: JSON.stringify(payload) });
      if (!r.ok) {
        console.error(`  ✗ ${def.function.name} POST falló ${r.status}: ${await r.text()}`);
        continue;
      }
      const created = (await r.json()) as { id: string };
      await pool.query(
        "INSERT INTO vapi_tools (name, vapi_tool_id, checksum, synced_at) VALUES ($1,$2,$3,now())",
        [def.function.name, created.id, cs],
      );
      console.log(`  + ${def.function.name} creada (${created.id})`);
    }
  }
  await pool.end();
  console.log("Sincronización de tools terminada.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});