// Configuration centrale de l'IA Orbs.
//
// TOUT est lu depuis des variables d'environnement (jamais en dur, jamais
// côté client). Changer de modèle ou d'endpoint plus tard = changer une
// variable ici, sans toucher au reste de l'application.
//
// La clé OpenAI n'est lue QUE dans ce module serveur et n'est jamais
// renvoyée au navigateur.

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
