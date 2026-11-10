import { NextResponse } from "next/server";
import https from "node:https";
import { Readable } from "node:stream";

import { requireSession } from "../../../../../lib/auth/context";
import { withTenant } from "../../../../../lib/db/tenant";
import { env } from "../../../../../lib/env";

/**
 * Sirve la grabación de una llamada por una ruta PROPIA (§14.1): valida sesión y
 * pertenencia al negocio, pide un enlace firmado FRESCO a VAPI (GET
 * /call/{vapiCallId}/mono-recording → 302) y lo reenvía EN STREAMING al
 * navegador. El <audio> apunta aquí, no a la URL privada de VAPI (que
 * devolvería 400).
 *
 * No se responde con 302 a la URL firmada: el bucket de grabaciones de VAPI
 * (r2.cloudflarestorage.com) resuelve a IPs 172.64.x.x que ciertas redes/ISPs
 * bloquean, y entonces el audio no carga en el navegador. Descargar por el
 * servidor con un edge alternativo de Cloudflare (104.18.x.x) evita el bloqueo;
 * el coste es que los megas pasan por nuestra app.
 *
 * Se cachea el enlace firmado ~20 min en memoria (las firmas caducan a ~30 min).
 */
const CACHE_MS = 20 * 60 * 1000;
const cache = new Map<string, { url: string; expiresAt: number }>();

// Edges alternativos de Cloudflare para sortear el bloqueo de 172.64.x.x
// (verificados contra api.vapi.ai, que sí es alcanzable). Se prueban en orden.
const ALTERNATE_IPS = ["104.18.25.64", "104.18.24.64"];

interface StreamResult {
  status: number;
  headers: Record<string, string>;
  body: ReadableStream<Uint8Array>;
}

/** Descarga la URL firmada con soporte de rangos, probando IPs alternativas. */
function download(url: string, range: string | null): Promise<StreamResult> {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const headers: Record<string, string> = {};
    if (range) headers["Range"] = range;

    let attempt = 0;
    const tryIp = (ip: string) => {
      attempt++;
      const req = https.request(
        {
          host: ip,
          port: 443,
          path: u.pathname + u.search,
          headers: { ...headers, Host: u.host },
          servername: u.host, // SNI correcto aunque conectemos por IP
          lookup: (_hostname, _opts, cb) => cb(null, ip, 4), // forzar el edge elegido
        },
        (res) => {
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            const out: Record<string, string> = {};
            for (const [k, v] of Object.entries(res.headers)) {
              if (v === undefined) continue;
              out[k] = Array.isArray(v) ? v.join(", ") : v;
            }
            resolve({
              status: res.statusCode,
              headers: out,
              body: Readable.toWeb(res) as unknown as ReadableStream<Uint8Array>,
            });
          } else {
            res.resume(); // drena
            const ips = ALTERNATE_IPS[attempt - 1];
            if (ips === ip && attempt < ALTERNATE_IPS.length) tryIp(ALTERNATE_IPS[attempt]!);
            else reject(new Error(`Respuesta inesperada del bucket: ${res.statusCode}`));
          }
        },
      );
      req.setTimeout(8000, () => req.destroy(new Error("timeout")));
      req.on("error", (err) => {
        if (attempt < ALTERNATE_IPS.length) tryIp(ALTERNATE_IPS[attempt]!);
        else reject(err);
      });
      req.end();
    };
    tryIp(ALTERNATE_IPS[0]!);
  });
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params;
  const ctx = await requireSession();
  const e = env();
  if (!e.VAPI_API_KEY) return new NextResponse("VAPI no configurado", { status: 503 });

  const vapiCallId = await withTenant(ctx.businessId, (c) =>
    c.query<{ vapi_call_id: string }>("SELECT vapi_call_id FROM calls WHERE id = $1 AND business_id = $2", [id, ctx.businessId]),
  ).then((r) => r.rows[0]?.vapi_call_id);

  if (!vapiCallId) return new NextResponse("Grabación no encontrada", { status: 404 });

  const cached = cache.get(vapiCallId);
  let url = cached && cached.expiresAt > Date.now() ? cached.url : null;
  if (!url) {
    // GET /call/{id}/mono-recording → 302 con Location a una URL firmada fresca.
    const r = await fetch(`https://api.vapi.ai/call/${vapiCallId}/mono-recording`, {
      method: "GET",
      headers: { Authorization: `Bearer ${e.VAPI_API_KEY}` },
      redirect: "manual",
    });
    const location = r.headers.get("location");
    if (!location) return new NextResponse("La grabación no está disponible", { status: 404 });
    url = location;
    cache.set(vapiCallId, { url, expiresAt: Date.now() + CACHE_MS });
  }

  try {
    const stream = await download(url, request.headers.get("range"));
    const headers = new Headers();
    for (const [k, v] of Object.entries(stream.headers)) {
      if (["content-type", "content-length", "content-range", "accept-ranges"].includes(k.toLowerCase())) {
        headers.set(k, v);
      }
    }
    headers.set("Content-Type", stream.headers["content-type"] ?? "audio/wav");
    return new Response(stream.body, { status: stream.status, headers });
  } catch {
    return new NextResponse("No se pudo obtener la grabación", { status: 502 });
  }
}