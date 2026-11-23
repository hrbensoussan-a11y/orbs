// Intensité des révisions — aides d'affichage (Réglages → Apprentissage).
// Le calcul lui-même est dans lib/learn/sm2 (spacedDays), utilisé à chaque
// réponse par les sessions de révision.

import type { Intensity } from "./types";
import { DEFAULT_INTENSITY, nextInterval, spacedDays } from "./sm2";
import { newCard } from "./store";

export { DEFAULT_INTENSITY };

/**
 * Exemple concret affiché à l'élève : délai (jours) avant de revoir une carte
 * déjà réussie une fois, qu'il connaît bien (« Bien »), selon l'intensité.
 */
export function newCardExampleDays(intensity: Intensity): number {
  const card = { ...newCard("", ""), reps: 1, iv: 2 };
  return spacedDays(nextInterval(card, 4), intensity);
}
