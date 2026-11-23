import { defineConfig } from "vitest/config";
import path from "node:path";

// Tests du service de crédits : base SQLite jetable isolée (voir tests/setup).
// DATABASE_URL pointe vers un fichier temporaire ABSOLU (évite l'ambiguïté de
// résolution des chemins SQLite relatifs). Le chemin est préparé par globalSetup.
const TEST_DB = path.resolve(__dirname, "tests/.tmp/test.db");

export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(__dirname) },
  },
  test: {
    environment: "node",
    globalSetup: ["./tests/setup/global.ts"],
    env: { DATABASE_URL: `file:${TEST_DB}` },
    // Un seul fichier SQLite partagé → pas de parallélisme inter-fichiers.
    fileParallelism: false,
    include: ["tests/**/*.test.ts"],
  },
});
