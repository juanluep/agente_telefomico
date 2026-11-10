import { describe, it, expect } from "vitest";
import pg from "pg";

import { ownerDatabaseUrl } from "../lib/env";
import { withTenant } from "../lib/db/tenant";
import { handleToolCalls } from "../lib/vapi/tools";
import type { ToolCallItem } from "../lib/vapi/messages";

/**
 * Test de integración del webhook: el dispatcher debe resolver tools con el
 * formato REAL de VAPI (function.name + arguments como string) y devolver un
 * resultado por cada toolCallId. Usa el negocio de demo sembrado.
 */
async function getDemoBusinessId(): Promise<string> {
  const pool = new pg.Pool({ connectionString: ownerDatabaseUrl() });
  try {
    const r = await pool.query("SELECT id FROM businesses WHERE slug = 'agente-taller' LIMIT 1");
    if (!r.rows[0]) throw new Error("Ejecuta `pnpm db:seed` antes de este test.");
    return r.rows[0].id as string;
  } finally {
    await pool.end();
  }
}

function realFormat(id: string, name: string, args: Record<string, unknown>): ToolCallItem {
  return { id, type: "function", function: { name, arguments: JSON.stringify(args) } };
}

describe("handleToolCalls (integración)", () => {
  it("resuelve tools con formato REAL y empareja por toolCallId", async () => {
    const businessId = await getDemoBusinessId();
    const vapiCallId = `test-call-${Date.now()}`;

    await withTenant(businessId, async (client) => {
      const toolCallList: ToolCallItem[] = [
        realFormat("c1", "identificarLlamante", {}),
        realFormat("c2", "consultarHuecos", { servicio: "Cambio de aceite", diasVista: 14 }),
        realFormat("c3", "datosDelNegocio", {}),
        realFormat("c4", "inventadaQueNoExiste", {}),
      ];

      const out = await handleToolCalls(client, businessId, vapiCallId, "+34600123456", toolCallList);

      expect(out.results.length).toBe(4);
      expect(out.results[0]!.toolCallId).toBe("c1");
      // +34600123456 es Javier Ruiz en el seed → lo saluda por nombre.
      expect(out.results[0]!.result).toContain("Javier");
      expect(out.results[1]!.toolCallId).toBe("c2");
      expect(out.results[1]!.result.length).toBeGreaterThan(0); // huecos hablables
      expect(out.results[2]!.result).toContain("Dirección");
      expect(out.results[3]!.result).toBe("No tengo esa herramienta disponible.");

      // limpiamos la fila de llamada de test creada por ensureCallRow
      await client.query("DELETE FROM calls WHERE vapi_call_id = $1", [vapiCallId]);
    });
  }, 30000);
});