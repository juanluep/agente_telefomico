/** Hash y verificación de contraseña con bcryptjs, coste 12 (§6). */
import bcryptjs from "bcryptjs";

export function hashPassword(plain: string): string {
  return bcryptjs.hashSync(plain, 12);
}

export function verifyPassword(plain: string, hash: string): boolean {
  try {
    return bcryptjs.compareSync(plain, hash);
  } catch {
    return false;
  }
}