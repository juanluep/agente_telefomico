import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    globals: false,
    setupFiles: ["tests/setup.ts"],
  },
  resolve: {
    // permite imports sin extensión como en el resto del proyecto
    extensions: [".ts", ".tsx", ".js", ".json"],
  },
});