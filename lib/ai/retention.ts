// Conservation des conversations avec l'assistant (Réglages → Assistant IA).
//
// Où vivent les conversations : UNIQUEMENT dans l'espace local du compte, sur
// chaque appareil ("orbs.ai.v2", lib/userStorage). Le serveur ne les stocke
// jamais : /api/ai/chat transmet le message au modèle le temps de la réponse,
// sans l'enregistrer ni le journaliser (seul un nombre de jetons est noté).
//
// La règle choisie est enregistrée sur le compte (Settings.aiRetention) et
// appliquée par chaque appareil sur ses propres données (lib/ai/history) :
//   - keep : rien n'est supprimé automatiquement ;
//   - 30d  : une conversation sans activité depuis 30 jours est supprimée
//            (dernière activité, pas date de création) ;
//   - none : les nouvelles conversations restent en mémoire le temps de la
//            visite, sans être enregistrées ; l'historique déjà présent n'est
//            pas effacé en silence.
// « Supprimer l'historique » pose Settings.aiHistoryClearedAt : chaque
// appareil efface alors tout son historique, une fois, à sa prochaine
// ouverture d'Orbs (sans comparer d'horloges entre appareils).

export type AiRetention = "keep" | "30d" | "none";

export const AI_RETENTIONS: readonly { id: AiRetention; label: string; desc: string }[] = [
  { id: "keep", label: "Conserver", desc: "Tes conversations restent dans l’historique." },
  { id: "30d", label: "30 jours", desc: "Supprimées après 30 jours sans activité." },
  { id: "none", label: "Ne pas conserver", desc: "Les nouvelles discussions disparaissent en quittant Orbs." },
] as const;

export const DEFAULT_AI_RETENTION: AiRetention = "keep";
export const RETENTION_DAYS = 30;
export const DAY_MS = 86_400_000;

export function isAiRetention(v: unknown): v is AiRetention {
  return v === "keep" || v === "30d" || v === "none";
}

export function toAiRetention(v: unknown): AiRetention {
  return isAiRetention(v) ? v : DEFAULT_AI_RETENTION;
}

/** Vrai si une conversation dont la dernière activité est `at` doit être supprimée. */
export function isExpired(at: number, retention: AiRetention, now: number): boolean {
  return retention === "30d" && at < now - RETENTION_DAYS * DAY_MS;
}
