import { defineConfig } from "drizzle-kit";

import { ownerDatabaseUrl } from "./lib/env";

export default defineConfig({
  schema: "./lib/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: ownerDatabaseUrl(),
  },
});