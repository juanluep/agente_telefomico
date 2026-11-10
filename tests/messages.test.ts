import { describe, it, expect } from "vitest";

import { extractToolArgs, extractToolName, type ToolCallItem } from "../lib/vapi/messages";

/**
 * Test del fallo silencioso más caro (§9.4). VAPI envía el nombre de la tool
 * dentro de `function.name` y los argumentos como STRING JSON. Si solo leyeras
 * `toolCall.name` (que es undefined en el formato real), el bucle se saltaría
 * todas las invocaciones y devolverías {results:[]} sin error. Este test usa
 * el formato REAL además del plano de los ejemplos.
 */
describe("extractToolName / extractToolArgs", () => {
  it("lee el nombre dentro de function y los argumentos en string JSON (formato REAL)", () => {
    const real: ToolCallItem = {
      id: "call_mlQ2OK3KlvhB1uKMuxOMQKms",
      type: "function",
      function: { name: "consultarHuecos", arguments: '{"servicio":"cambio de aceite","diasVista":7}' },
    };
    expect(extractToolName(real)).toBe("consultarHuecos");
    const args = extractToolArgs(real);
    expect(args.servicio).toBe("cambio de aceite");
    expect(args.diasVista).toBe(7);
  });

  it("acepta también la forma plana {name, parameters} de los ejemplos", () => {
    const flat: ToolCallItem = { id: "c1", name: "reservarCita", parameters: { servicio: "frenos" } };
    expect(extractToolName(flat)).toBe("reservarCita");
    expect(extractToolArgs(flat).servicio).toBe("frenos");
  });

  it("tolera arguments no-JSON sin reventar", () => {
    const bad: ToolCallItem = { id: "c1", type: "function", function: { name: "anularCita", arguments: "{no es json" } };
    expect(extractToolName(bad)).toBe("anularCita");
    expect(extractToolArgs(bad)).toEqual({});
  });

  it("devuelve null/{} cuando no hay nombre ni argumentos", () => {
    const empty: ToolCallItem = { id: "c1", type: "function", function: {} };
    expect(extractToolName(empty)).toBeNull();
    expect(extractToolArgs(empty)).toEqual({});
  });
});