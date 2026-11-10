import { pool } from "../../../lib/db/pool";
import { requireSession } from "../../../lib/auth/context";
import { membershipRoleLabel, type MembershipRole } from "../../../lib/labels";
import { dateShort } from "../../../lib/format";

export const dynamic = "force-dynamic";

export default async function PerfilPage() {
  const ctx = await requireSession();

  const u = (await pool.query<{ full_name: string; created_at: Date }>("SELECT full_name, created_at FROM users WHERE id = $1", [ctx.userId])).rows[0];
  const sessions = (await pool.query("SELECT count(*)::int AS n FROM sessions WHERE user_id = $1 AND expires_at > now()", [ctx.userId])).rows[0].n as number;
  const initial = ctx.fullName?.[0]?.toUpperCase() ?? "·";

  return (
    <div className="max-w-xl space-y-6">
      <h1 className="text-2xl font-semibold">Mi perfil</h1>
      <div className="card card-pad">
        <div className="flex items-center gap-4">
          <span className="grid place-items-center w-16 h-16 rounded-full bg-brand-600 text-white text-2xl font-semibold">{initial}</span>
          <div>
            <h2 className="text-xl font-semibold">{ctx.fullName}</h2>
            <p className="text-sm text-surface-700">{u?.created_at ? dateShort(u.created_at, ctx.timezone) : ""}</p>
          </div>
        </div>
        <dl className="text-sm mt-5 space-y-3">
          <div className="flex justify-between"><dt className="text-surface-700">Correo</dt><dd>{ctx.email}</dd></div>
          <div className="flex justify-between"><dt className="text-surface-700">Rol</dt><dd><span className="badge-brand">{membershipRoleLabel[ctx.role as MembershipRole]}</span></dd></div>
          <div className="flex justify-between"><dt className="text-surface-700">Negocio</dt><dd>{ctx.businessName}</dd></div>
          <div className="flex justify-between"><dt className="text-surface-700">Fecha de alta</dt><dd>{u?.created_at ? dateShort(u.created_at, ctx.timezone) : "—"}</dd></div>
          <div className="flex justify-between"><dt className="text-surface-700">Sesiones abiertas</dt><dd>{sessions} {sessions === 1 ? "dispositivo" : "dispositivos"}</dd></div>
        </dl>
      </div>
      <p className="hint">Vista de solo lectura. La gestión de usuarios se sale del alcance de esta versión.</p>
    </div>
  );
}