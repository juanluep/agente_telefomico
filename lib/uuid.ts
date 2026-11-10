/**
 * uuidv7 en JS — para generar el id del negocio ANTES de insertarlo, de forma
 * que el registro atómico pueda fijar set_config('app.business_id') y dejar
 * la fila visible para RETURNING / inserts dependientes (§5, §6). Postgres 18
 * usa uuidv7() nativo como DEFAULT; aquí lo reproducimos para mantener el
 * mismo tipo ordenable en el tiempo.
 */
import { randomBytes } from "node:crypto";

export function uuidv7(): string {
  const b = randomBytes(16);
  const ms = BigInt(Date.now());
  b[0] = Number((ms >> 40n) & 0xffn);
  b[1] = Number((ms >> 32n) & 0xffn);
  b[2] = Number((ms >> 24n) & 0xffn);
  b[3] = Number((ms >> 16n) & 0xffn);
  b[4] = Number((ms >> 8n) & 0xffn);
  b[5] = Number(ms & 0xffn);
  b[6] = (b[6]! & 0x0f) | 0x70; // version 7
  b[8] = (b[8]! & 0x3f) | 0x80; // variant
  const hex = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}