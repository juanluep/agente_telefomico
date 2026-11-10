import { describe, it, expect } from "vitest";

import { findSlots, type AvailabilityContext, type BusinessHour } from "../lib/scheduling/availability";

const monday = "2026-08-17T08:00:00"; // lunes, 8:00 Europe/Madrid

function ctx(overrides: Partial<AvailabilityContext> = {}): AvailabilityContext {
  const hours: BusinessHour[] = [
    { weekday: 1, opensAt: "09:00", closesAt: "14:00", isClosed: false },
    { weekday: 1, opensAt: "16:00", closesAt: "19:00", isClosed: false },
  ];
  return {
    timezone: "Europe/Madrid",
    mode: "horas",
    hours,
    closures: [],
    capacity: 1,
    minNoticeMinutes: 60,
    horizonDays: 60,
    appointments: [],
    ...overrides,
  };
}

describe("availability.findSlots", () => {
  it("devuelve hasta 3 huecos de la mañana del día pedido", () => {
    const slots = findSlots(ctx(), { serviceDurationMinutes: 60, diasVista: 1, nowIso: monday });
    expect(slots.length).toBe(3);
    expect(slots[0]!.texto).toContain("las nueve de la mañana");
    expect(slots[1]!.texto).toContain("nueve y media");
  });

  it("respeta la antelación mínima", () => {
    // ahora 10:30 lunes → antelación 60 min → earliest 11:30
    const now = "2026-08-17T10:30:00";
    const slots = findSlots(ctx({ minNoticeMinutes: 60 }), {
      serviceDurationMinutes: 60, diasVista: 1, nowIso: now,
    });
    expect(slots.length).toBeGreaterThan(0);
    // ningún slot antes de las 11:30 de la mañana
    for (const s of slots) {
      expect(s.texto).not.toContain("las diez de la mañana");
    }
  });

  it("filtra por franja (tarde)", () => {
    const slots = findSlots(ctx(), {
      serviceDurationMinutes: 60, diasVista: 1, franja: "tarde", nowIso: monday,
    });
    expect(slots.length).toBe(3);
    for (const s of slots) expect(s.texto).toContain("de la tarde");
  });

  it("excluye huecos ocupados según capacidad", () => {
    // cita 09:00–10:00; con capacidad 1, 09:00 y 09:30 caen; primero libre 10:00
    const startUtc = new Date("2026-08-17T07:00:00Z").toISOString(); // 9:00 Madrid
    const endUtc = new Date("2026-08-17T08:00:00Z").toISOString();
    const slots = findSlots(
      ctx({ appointments: [{ startsAt: startUtc, endsAt: endUtc, status: "agendada" }] }),
      { serviceDurationMinutes: 60, diasVista: 1, nowIso: monday },
    );
    expect(slots.length).toBe(3);
    expect(slots[0]!.texto).toContain("las diez de la mañana");
  });

  it("ignora las citas anuladas", () => {
    const startUtc = new Date("2026-08-17T07:00:00Z").toISOString();
    const endUtc = new Date("2026-08-17T08:00:00Z").toISOString();
    const slots = findSlots(
      ctx({ appointments: [{ startsAt: startUtc, endsAt: endUtc, status: "anulada" }] }),
      { serviceDurationMinutes: 60, diasVista: 1, nowIso: monday },
    );
    expect(slots[0]!.texto).toContain("las nueve de la mañana");
  });

  it("omite días dentro de un cierre", () => {
    const startUtc = new Date("2026-08-17T00:00:00Z").toISOString();
    const endUtc = new Date("2026-08-18T00:00:00Z").toISOString();
    const slots = findSlots(
      ctx({ closures: [{ startsAt: startUtc, endsAt: endUtc }], horizonDays: 5 }),
      { serviceDurationMinutes: 60, diasVista: 2, nowIso: monday },
    );
    // lunes entero cerrado → slots vienen del martes
    for (const s of slots) expect(s.texto).toContain("martes");
  });
});

describe("availability.findSlots (modo días)", () => {
  const hotelHours: BusinessHour[] = [
    { weekday: 1, opensAt: "00:00", closesAt: "23:59", isClosed: false },
    { weekday: 2, opensAt: "00:00", closesAt: "23:59", isClosed: false },
    { weekday: 3, opensAt: "00:00", closesAt: "23:59", isClosed: false },
    { weekday: 4, opensAt: "00:00", closesAt: "23:59", isClosed: false },
    { weekday: 5, opensAt: "00:00", closesAt: "23:59", isClosed: false },
    { weekday: 6, opensAt: "00:00", closesAt: "23:59", isClosed: false },
    { weekday: 0, opensAt: "00:00", closesAt: "00:00", isClosed: true },
  ];
  const hotel = (overrides: Partial<AvailabilityContext> = {}) => ctx({ mode: "dias", hours: hotelHours, capacity: 3, ...overrides });

  it("devuelve días completos con texto hablable", () => {
    // a las 8:00 del lunes con antelación de 60 min, el check-in de HOY (00:00) ya pasó
    const slots = findSlots(hotel(), { serviceDurationMinutes: 60, serviceDurationDays: 1, diasVista: 3, nowIso: monday });
    expect(slots.length).toBe(2);
    expect(slots[0]!.texto).toMatch(/el martes \d+ de/);
    expect(slots[1]!.texto).toMatch(/el miércoles \d+ de/);
  });

  it("una estancia de 2 noches salta el día en el que la noche siguiente está ocupada", () => {
    // el martes 18 está completo (3 reservas) → la entrada del lunes 17 (2 noches) no vale
    const tueStart = new Date("2026-08-18T00:00:00Z").toISOString();
    const tueEnd = new Date("2026-08-19T00:00:00Z").toISOString();
    const appts = [
      { startsAt: tueStart, endsAt: tueEnd, status: "agendada" },
      { startsAt: tueStart, endsAt: tueEnd, status: "agendada" },
      { startsAt: tueStart, endsAt: tueEnd, status: "agendada" },
    ];
    const slots = findSlots(hotel({ appointments: appts }), {
      serviceDurationMinutes: 60, serviceDurationDays: 2, diasVista: 5, nowIso: monday,
    });
    for (const s of slots) {
      expect(s.texto).not.toMatch(/el lunes \d+ de/);
      expect(s.texto).toMatch(/del .* al /);
    }
  });

  it("respeta el domingo cerrado en estancias", () => {
    // domingo 23 cerrado → entrada del sábado 22 con 2 noches no vale; el viernes 21 sí
    const slots = findSlots(hotel(), {
      serviceDurationMinutes: 60, serviceDurationDays: 2, diasVista: 7, nowIso: "2026-08-17T08:00:00",
    });
    for (const s of slots) {
      expect(s.texto).not.toMatch(/el sábado \d+ de/);
    }
  });
});