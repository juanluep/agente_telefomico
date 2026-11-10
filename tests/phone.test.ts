import { describe, it, expect } from "vitest";

import { normalizePhone, isE164 } from "../lib/phone";

describe("lib/phone", () => {
  it("normaliza formatos españoles al mismo E.164", () => {
    expect(normalizePhone("600 123 456")).toBe("+34600123456");
    expect(normalizePhone("+34600123456")).toBe("+34600123456");
    expect(normalizePhone("0034600123456")).toBe("+34600123456");
    expect(normalizePhone("660 12 34 56")).toBe("+34660123456");
  });

  it("respeta el prefijo explícito aunque cambie DEFAULT_COUNTRY_CODE", () => {
    expect(normalizePhone("+33123456789")).toBe("+33123456789");
  });

  it("devuelve null para basura", () => {
    expect(normalizePhone("")).toBeNull();
    expect(normalizePhone(null)).toBeNull();
    expect(normalizePhone("hola")).toBeNull();
  });

  it("isE164 reconoce E.164", () => {
    expect(isE164("+34600123456")).toBe(true);
    expect(isE164("600123456")).toBe(false);
  });
});