// Configuration centrale de l'IA Orbs.
//
// TOUT est lu depuis des variables d'environnement (jamais en dur, jamais
// côté client). Changer de modèle ou d'endpoint plus tard = changer une
// variable ici, sans toucher au reste de l'application.
//
// La clé OpenAI n'est lue QUE dans ce module serveur et n'est jamais
// renvoyée au navigateur.

import type { AiModeId } from "./modes";

function num(name: string, fallback: number): number {
  const raw = process.env[name];
  const n = raw == null || raw === "" ? NaN : Number(raw);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

const REASONING_EFFORTS = new Set([
  "none",
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
]);

function effort(): string {
  const v = (process.env.OPENAI_REASONING_EFFORT || "low").toLowerCase();
  return REASONING_EFFORTS.has(v) ? v : "low";
}

export const AI_CONFIG = {
  // --- Secret & modèle (serveur uniquement) ---
  apiKey: process.env.OPENAI_API_KEY ?? "",
  model: process.env.OPENAI_MODEL || "gpt-5.6-terra",
  baseUrl: (process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(
    /\/+$/,
    "",
  ),
  // Les modèles de raisonnement (gpt-5.6+) facturent les tokens de
  // raisonnement comme de la sortie : "low" garde un bon niveau scolaire
  // sans exploser le coût. Valeurs possibles : none/low/medium/high/xhigh/max.
  reasoningEffort: effort(),

  // --- Voix (assistant vocal : écoute + réponse à voix haute) ---
  // Modèle de transcription (voix → texte). `whisper-1` détecte seul la
  // langue (FR/EN) sans configuration. Changer ce seul champ suffit.
  sttModel: process.env.OPENAI_STT_MODEL || "whisper-1",
  // Modèle de synthèse (texte → voix). `gpt-4o-mini-tts` est naturel et
  // bilingue (langue détectée depuis le texte). Les voix (nova/alloy/…)
  // sont choisies par l'élève, voir lib/ai/voices.ts.
  ttsModel: process.env.OPENAI_TTS_MODEL || "gpt-4o-mini-tts",
  // Taille maximale d'un extrait audio envoyé pour transcription (octets).
  // Garde-fou coût/abus : ~4 Mo ≈ 1 à 2 min de parole compressée.
  maxAudioBytes: num("AI_MAX_AUDIO_BYTES", 4 * 1024 * 1024),
  // Longueur maximale d'un texte lu à voix haute (caractères).
  maxSpeakChars: num("AI_MAX_SPEAK_CHARS", 4000),

  // --- Limites de coût / taille ---
  // Les modèles de raisonnement consomment une partie de ce budget en
  // « réflexion » : trop bas => réponse coupée, voire vide. 1400 laisse de
  // la marge pour une vraie explication.
  maxCompletionTokens: num("OPENAI_MAX_COMPLETION_TOKENS", 1400),
  maxMessageChars: num("AI_MAX_MESSAGE_CHARS", 4000),
  maxContextChars: num("AI_MAX_CONTEXT_CHARS", 6000),
  maxHistoryMessages: num("AI_MAX_HISTORY_MESSAGES", 10),
  timeoutMs: num("AI_TIMEOUT_MS", 30000),

  // --- Limitation du débit (par utilisateur connecté) ---
  rateMaxPerMin: num("AI_RATE_MAX_PER_MIN", 12),
  rateMaxPerDay: num("AI_RATE_MAX_PER_DAY", 300),
} as const;

/** L'IA est-elle configurée côté serveur ? (clé présente) */
export function aiConfigured(): boolean {
  return AI_CONFIG.apiKey.length > 0;
}

// ---------------------------------------------------------------------------
// Résolution SERVEUR du modèle + effort pour chaque mode (Luna / Terra).
//
// Les deux modes partagent toute la chaîne (persona, contexte, streaming) :
// seuls le MODÈLE et l'EFFORT de raisonnement changent. Tout est piloté par des
// variables d'environnement, jamais en dur côté client :
//
//   OPENAI_MODEL_LUNA             (défaut: gpt-5.6-luna)
//   OPENAI_MODEL_TERRA            (défaut: OPENAI_MODEL ou gpt-5.6-terra)
//   OPENAI_REASONING_EFFORT_LUNA  (défaut: medium)
//   OPENAI_REASONING_EFFORT_TERRA (défaut: OPENAI_REASONING_EFFORT ou high)
//
// Terra conserve son comportement actuel : s'il n'a pas de variable dédiée, il
// retombe sur OPENAI_MODEL / OPENAI_REASONING_EFFORT (la configuration
// existante). Luna est le nouveau mode « quotidien », plus léger.
//
// NOTE : les modèles gpt-5.6 Luna/Terra sont la famille de raisonnement déjà
// visée par le projet (voir lib/ai/openai.ts). Si votre fournisseur nomme le
// modèle « moyen » autrement, renseignez OPENAI_MODEL_LUNA en conséquence.

function env(name: string): string | undefined {
  const v = process.env[name];
  return v == null || v === "" ? undefined : v;
}

function validEffort(value: string | undefined, fallback: string): string {
  const v = (value ?? fallback).toLowerCase();
  return REASONING_EFFORTS.has(v) ? v : fallback;
}

/** Identifiant de modèle utilisé par un mode donné. */
export function modeModel(mode: AiModeId): string {
  if (mode === "luna") return env("OPENAI_MODEL_LUNA") || "gpt-5.6-luna";
  // Terra : rétro-compatible avec l'ancienne variable unique OPENAI_MODEL.
  return env("OPENAI_MODEL_TERRA") || AI_CONFIG.model;
}

/** Effort de raisonnement utilisé par un mode donné. */
export function modeReasoningEffort(mode: AiModeId): string {
  if (mode === "luna") {
    return validEffort(env("OPENAI_REASONING_EFFORT_LUNA"), "medium");
  }
  // Terra : variable dédiée, sinon l'ancienne globale, sinon « high » (poussé).
  return validEffort(
    env("OPENAI_REASONING_EFFORT_TERRA") || env("OPENAI_REASONING_EFFORT"),
    "high",
  );
}

/** Couple { modèle, effort } prêt à être envoyé à l'API pour ce mode. */
export function resolveMode(mode: AiModeId): {
  model: string;
  reasoningEffort: string;
} {
  return { model: modeModel(mode), reasoningEffort: modeReasoningEffort(mode) };
}
