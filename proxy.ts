/**
 * Middleware renombrado en Next 16: proxy.ts, función exportada `proxy` (no
 * `middleware`). Comprueba la PRESENCIA de la cookie (§6): la validación real
 * contra base de datos la hace requireSession() en el layout y en cada Server
 * Action. No confiar la seguridad al proxy.
 */
import { NextResponse, type NextRequest } from "next/server";

import { SESSION_COOKIE } from "./lib/auth/constants";

const PRIVATE_PREFIXES = [
  "/panel",
  "/agenda",
  "/contactos",
  "/conversaciones",
  "/estudio",
  "/conexiones",
  "/perfil",
  "/dev",
];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hasCookie = Boolean(request.cookies.get(SESSION_COOKIE)?.value);

  const isPrivate =
    PRIVATE_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`)) || pathname === "/";

  if (isPrivate && !hasCookie) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }

  if ((pathname === "/login" || pathname === "/signup") && hasCookie) {
    const url = request.nextUrl.clone();
    url.pathname = "/panel";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/health).*)"],
};