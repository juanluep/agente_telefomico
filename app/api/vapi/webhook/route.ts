import { NextResponse } from "next/server";

import { verifyBearer } from "../../../../lib/vapi/verify";
import { processVapiMessage } from "../../../../lib/vapi/handler";
import type { VapiMessage } from "../../../../lib/vapi/messages";

export async function POST(request: Request): Promise<NextResponse> {
  // 1) Verificar ANTES de parsear nada útil (§7). Sin tocar DB si falla.
  if (!verifyBearer(request.headers.get("authorization"))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({}, { status: 200 }); // cuerpo no válido → 200 vacío
  }

  const message = (body as { message?: VapiMessage })?.message;
  if (!message || !message.type) {
    return NextResponse.json({}, { status: 200 });
  }

  const result = await processVapiMessage(message);
  return NextResponse.json(result.body, { status: result.status });
}