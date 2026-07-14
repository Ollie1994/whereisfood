import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Node environment — the validators are pure Node modules (crypto, no DOM). The
// `@/` alias is mapped manually to ./src to mirror tsconfig's paths, avoiding a
// vite-tsconfig-paths dependency (issue #28).
export default defineConfig({
  test: {
    environment: "node",
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
