import { NextResponse } from "next/server";

import { pool } from "../../../lib/db/pool";

export const dynamic = "force-dynamic";

/** Sonda de salud: SELECT 1 contra Postgres. Pública y sin datos sensibles
 *  (§16.3). La usan el healthcheck del contenedor y Dokploy. */
export async function GET() {
  const started = Date.now();
  try {
    await pool.query("SELECT 1");
    return NextResponse.json({
      status: "ok",
      db: "ok",
      version: process.env.npm_package_version ?? "1.0.0",
      uptime: Math.round(process.uptime()),
      time: started,
    });
  } catch (err) {
    return NextResponse.json(
      {
        status: "error",
        db: "down",
        version: process.env.npm_package_version ?? "1.0.0",
        uptime: Math.round(process.uptime()),
        error: err instanceof Error ? err.message : "db error",
      },
      { status: 503 },
    );
  }
}