// Prépare une base SQLite jetable pour les tests du service de crédits.
//
// On copie la base de dev (qui porte déjà le schéma le plus récent, migrations
// de crédits incluses) vers un fichier temporaire. Les tests créent des
// utilisateurs à identifiants uniques et nettoient derrière eux : aucune
// interférence avec d'éventuelles données de dev présentes dans la copie.

import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "../..");
const DEV_DB = path.join(ROOT, "prisma/dev.db");
const TMP_DIR = path.join(ROOT, "tests/.tmp");
const TEST_DB = path.join(TMP_DIR, "test.db");

export default function setup() {
  fs.mkdirSync(TMP_DIR, { recursive: true });
  if (!fs.existsSync(DEV_DB)) {
    throw new Error(
      "prisma/dev.db introuvable : lance `npx prisma migrate dev` avant les tests.",
    );
  }
  fs.copyFileSync(DEV_DB, TEST_DB);

  return () => {
    // Teardown : on efface la base jetable (et ses fichiers annexes SQLite).
    for (const f of [TEST_DB, `${TEST_DB}-journal`, `${TEST_DB}-wal`, `${TEST_DB}-shm`]) {
      try {
        fs.rmSync(f, { force: true });
      } catch {
        /* ignore */
      }
    }
  };
}
