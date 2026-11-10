import { NextResponse } from "next/server";

import { destroySession } from "../../../../lib/auth/session";

export async function POST(): Promise<NextResponse> {
  await destroySession();
  const res = NextResponse.redirect(new URL("/login", process.env.APP_URL ?? "http://localhost:3000"));
  return res;
}