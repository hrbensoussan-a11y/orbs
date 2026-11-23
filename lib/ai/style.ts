// Style d'accompagnement de l'assistant (Réglages → Assistant IA).
//
// L'élève choisit COMMENT Orbs lui explique les choses :
//   - Guide     : questions, indices, étape par étape, sans donner tout de
//                 suite la réponse finale ;
//   - Équilibré : explique, guide quand c'est utile, donne la réponse quand
//                 c'est pertinent (comportement par défaut) ;
//   - Direct    : la réponse d'abord, puis une courte explication.
//
// La préférence est enregistrée sur le compte (Settings.aiStyle) et relue par
// /api/ai/chat CÔTÉ SERVEUR à chaque message : elle s'applique à toutes les
// discussions, sur tous les appareils, sans que le navigateur l'envoie.
//
// Module pur (aucun accès serveur) : utilisé par les Réglages et par la
// construction du prompt (lib/ai/persona.ts).

export type AiStyleId = "guide" | "balanced" | "direct";

export type AiStyleMeta = {
  id: AiStyleId;
  /** Libellé affiché à l'élève. */
  label: string;
  /** Phrase courte affichée dans les Réglages. */
  desc: string;
};

export const AI_STYLES: readonly AiStyleMeta[] = [
  {
    id: "guide",
    label: "Guide",
    desc: "Des questions et des indices pour trouver par toi-même, étape par étape.",
  },
  {
    id: "balanced",
    label: "Équilibré",
    desc: "Il explique, te guide quand c’est utile et donne la réponse quand c’est pertinent.",
  },
  {
    id: "direct",
    label: "Direct",
    desc: "La réponse d’abord, puis une courte explication pour comprendre.",
  },
] as const;

export const DEFAULT_AI_STYLE: AiStyleId = "balanced";

const STYLE_IDS = new Set<string>(AI_STYLES.map((s) => s.id));

export function isAiStyle(value: unknown): value is AiStyleId {
  return typeof value === "string" && STYLE_IDS.has(value);
}

/** Garde-type : un style connu, sinon le style par défaut. */
export function toAiStyle(value: unknown): AiStyleId {
  return isAiStyle(value) ? value : DEFAULT_AI_STYLE;
}

export function styleLabel(id: AiStyleId): string {
  return AI_STYLES.find((s) => s.id === id)?.label ?? id;
}

/**
 * Consignes envoyées au modèle pour chaque style. Elles remplacent l'ancienne
 * règle fixe « privilégie l'explication plutôt que la réponse », désormais
 * portée par les styles Guide et Équilibré.
 */
export const STYLE_INSTRUCTIONS: Record<AiStyleId, readonly string[]> = {
  guide: [
    "- Ne donne pas tout de suite la réponse finale d'un exercice : aide l'élève à la trouver lui-même.",
    "- Commence par vérifier ce qu'il sait déjà, puis avance étape par étape, une étape à la fois.",
    "- Pose une question qui fait réfléchir à chaque étape et donne des indices progressifs plutôt que la solution.",
    "- Si l'élève bloque encore après plusieurs essais, ou s'il demande explicitement la réponse, donne-la avec la démarche complète.",
    "- Pour une simple question de cours (une définition, une date…), réponds puis vérifie qu'il a compris.",
  ],
  balanced: [
    "- Explique les notions clairement et guide l'élève quand c'est utile pour qu'il comprenne.",
    "- Donne la réponse quand c'est pertinent (question de cours, vérification, blocage), toujours avec l'explication qui va avec.",
    "- Pour un exercice, privilégie la compréhension de la méthode plutôt que la seule réponse.",
    "- Adapte le niveau de détail à la question.",
  ],
  direct: [
    "- Commence par la réponse, clairement, dès la première ligne.",
    "- Ajoute ensuite une explication courte (deux ou trois phrases, ou quelques points) pour comprendre.",
    "- Évite les longues étapes et les questions en retour, sauf si la demande est ambiguë.",
  ],
};
