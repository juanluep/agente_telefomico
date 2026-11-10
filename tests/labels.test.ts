import { describe, it, expect } from "vitest";

import {
  callStatusLabel,
  contactStatusLabel,
  contactSourceLabel,
  appointmentStatusLabel,
  appointmentCreatedViaLabel,
  membershipRoleLabel,
  callDirectionLabel,
  endedReasonInfo,
  type CallStatus,
  type ContactStatus,
  type AppointmentStatus,
} from "../lib/labels";

/**
 * Prueba de regresión de etiquetas (§12): añadir un estado sin etiqueta debe
 * romper este test. Tipado con Record<Enum,string>: si falta una clave, TS no
 * compila; este test asegura además que ninguna etiqueta queda vacía ni repite
 * el valor interno.
 */
describe("lib/labels", () => {
  const suites: Array<{ name: string; record: Record<string, string>; keys: string[] }> = [
    { name: "callStatusLabel", record: callStatusLabel, keys: ["scheduled", "queued", "ringing", "in-progress", "forwarding", "ended"] },
    { name: "contactStatusLabel", record: contactStatusLabel, keys: ["lead", "cliente", "inactivo"] },
    { name: "contactSourceLabel", record: contactSourceLabel, keys: ["agente_voz", "manual", "importado"] },
    { name: "appointmentStatusLabel", record: appointmentStatusLabel, keys: ["agendada", "confirmada", "completada", "anulada", "no_show"] },
    { name: "appointmentCreatedViaLabel", record: appointmentCreatedViaLabel, keys: ["agente_voz", "panel"] },
    { name: "membershipRoleLabel", record: membershipRoleLabel, keys: ["owner", "staff"] },
    { name: "callDirectionLabel", record: callDirectionLabel, keys: ["inbound", "outbound"] },
  ];

  for (const s of suites) {
    it(`${s.name} cubre todas las claves y no pinta el valor interno`, () => {
      for (const k of s.keys) {
        expect(s.record[k], `falta etiqueta para "${k}"`).toBeTruthy();
        expect(s.record[k], `la etiqueta no debe ser el valor interno "${k}"`).not.toBe(k);
      }
    });
  }

  it("endedReason traduce los códigos habituales de VAPI", () => {
    expect(endedReasonInfo("customer-ended-call").label).toBe("El cliente colgó");
    expect(endedReasonInfo("assistant-ended-call").label).toBe("El asistente colgó");
    expect(endedReasonInfo("assistant-said-goodbye").label).toBe("El asistente se despidió");
    expect(endedReasonInfo("silence-detection").label).toBe("Se cortó tras un silencio prolongado");
  });

  it("endedReason conserva el código original en title y agrupa por familias", () => {
    const e1 = endedReasonInfo("twilio-error-foo");
    expect(e1.label).toBe("Incidencia de operadora");
    expect(e1.title).toBe("twilio-error-foo");
    const e2 = endedReasonInfo("some-database-error-xyz");
    expect(e2.label).toBe("Error técnico");
    expect(endedReasonInfo(null).label).toBe("Llamada finalizada");
  });

  it("los tipos cubren los estados esperados (compila)", () => {
    const cs: CallStatus = "ended";
    const ct: ContactStatus = "lead";
    const ap: AppointmentStatus = "no_show";
    expect(cs).toBe("ended");
    expect(ct).toBe("lead");
    expect(ap).toBe("no_show");
  });
});