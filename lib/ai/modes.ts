// Modes IA d'Orbs — métadonnées PARTAGÉES client/serveur.
//
// Ce module ne lit AUCUN secret et n'importe rien de serveur : il peut donc
// être importé côté navigateur (sélecteur de mode) comme côté serveur (route
// de chat). Les IDENTIFIANTS de modèles et l'effort de raisonnement, eux, sont
// résolus UNIQUEMENT côté serveur (voir lib/ai/config.ts, resolveMode) — jamais
// renvoyés au client.
//
// Deux modes, une seule conversation :
//   - Luna  : réflexion moyenne — tâches quotidiennes, questions courantes.
//   - Terra : réflexion poussée — problèmes complexes, analyse approfondie.
// Le mode change la PROFONDEUR du raisonnement, pas la personnalité : la voix,
// la langue, le ton et les préférences restent communs (voir lib/ai/persona.ts).

export type AiModeId = "luna" | "terra";

export type AiModeMeta = {
  id: AiModeId;
  /** Libellé affiché à l'élève (par profondeur de réflexion). */
  label: string;
  /** Phrase explicative courte affichée dans le sélecteur. */
  description: string;
};

/** Les deux modes proposés à l'élève (ordre d'affichage). */
export const AI_MODES: readonly AiModeMeta[] = [
  {
    id: "luna",
    label: "Moyenne",
    description: "Devoirs, tâches quotidiennes et questions courantes.",
  },
  {
    id: "terra",
    label: "Poussée",
    description: "Problèmes complexes, projets et analyse approfondie.",
  },
] as const;

/** Mode par défaut d'une nouvelle discussion (le mode « quotidien »). */
export const DEFAULT_MODE_ID: AiModeId = "luna";

/**
 * Mode imposé aux interactions VOCALES (l'élève parle / écoute la réponse),
 * quel que soit le mode choisi dans le chat texte. Voir route /api/ai/chat.
 */
export const AUDIO_MODE_ID: AiModeId = "luna";

const MODE_IDS = new Set<AiModeId>(AI_MODES.map((m) => m.id));

export const MODE_BY_ID: ReadonlyMap<AiModeId, AiModeMeta> = new Map(
  AI_MODES.map((m) => [m.id, m]),
);

/** Garde-type : renvoie un `AiModeId` valide, sinon le mode par défaut. */
export function toModeId(value: unknown): AiModeId {
  return typeof value === "string" && MODE_IDS.has(value as AiModeId)
    ? (value as AiModeId)
    : DEFAULT_MODE_ID;
}
