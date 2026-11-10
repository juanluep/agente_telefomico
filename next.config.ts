import type { NextConfig } from "next";

const securityHeaders: { key: string; value: string }[] = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "geolocation=(), microphone=(), camera=()" },
];

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  // En desarrollo la app se abre a través del Funnel de Tailscale (§15); Next
  // bloquea por defecto los recursos cross-origin desde ese host y eso rompe
  // las server actions (crear cita manual, publicar…). Se permite el host aquí.
  allowedDevOrigins: ["macbook-pro-de-juanlu.tailfe1719.ts.net"],
  // Next traza imports estáticos; @swc/helpers se requiere de forma dinámica desde
  // el require-hook del runtime de producción y el standalone no lo copia solo.
  // Forzamos su inclusión (con pnpm vive bajo el store .pnpm).
  outputFileTracingIncludes: {
    "/": ["./node_modules/.pnpm/@swc+helpers@*/node_modules/@swc/helpers/**/*"],
  },
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
};

export default nextConfig;