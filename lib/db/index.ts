import { drizzle } from "drizzle-orm/node-postgres";

import { pool } from "./pool";
import * as schema from "./schema";

/** Instancia Drizzle sobre el pool compartido, con el esquema tipado. */
export const db = drizzle(pool, { schema });

export { pool } from "./pool";
export { withTenant, tenantQuery } from "./tenant";
export * as schema from "./schema";