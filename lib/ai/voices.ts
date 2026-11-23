// Voix de l'assistant vocal Orbs — métadonnées PARTAGÉES client/serveur.
//
// Ce module ne lit AUCUN secret et n'importe rien de serveur : il peut donc
// être importé côté navigateur (sélecteur de voix) comme côté serveur (route
// de synthèse). Les identifiants correspondent aux voix OpenAI TTS, toutes
// bilingues (français ET anglais) et détectant automatiquement la langue du
// texte à lire.

export type VoiceId = "nova" | "alloy" | "shimmer";

export type VoiceOption = {
  id: VoiceId;
  /** Nom affiché à l'élève. */
  label: string;
  /** Courte description du timbre. */
  desc: string;
};

/** Les trois voix proposées à l'élève (ordre d'affichage). */
export const VOICES: readonly VoiceOption[] = [
  { id: "nova", label: "Nova", desc: "Chaleureuse" },
  { id: "alloy", label: "Alloy", desc: "Neutre et claire" },
  { id: "shimmer", label: "Shimmer", desc: "Douce" },
] as const;

/** Voix utilisée par défaut si l'élève n'a rien choisi. */
export const DEFAULT_VOICE: VoiceId = "nova";

const VOICE_IDS = new Set<string>(VOICES.map((v) => v.id));

/** Garde-type : renvoie une `VoiceId` valide, sinon la voix par défaut. */
export function toVoiceId(value: unknown): VoiceId {
  return typeof value === "string" && VOICE_IDS.has(value)
    ? (value as VoiceId)
    : DEFAULT_VOICE;
}
