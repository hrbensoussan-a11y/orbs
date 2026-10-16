// Types partagés entre le backend IA et le frontend.

/** Rôles autorisés dans une conversation (jamais "system" côté client). */
export type ChatRole = "user" | "assistant";

export type ChatMessage = {
  role: ChatRole;
  content: string;
};

/**
 * Contexte scolaire, EXPLICITEMENT choisi par l'utilisateur.
 * Rien n'est envoyé automatiquement : le Journal personnel n'y figure jamais.
 * Tous les champs sont optionnels — on n'envoie que ce qui est utile.
 */
export type OrbsContext = {
  subject?: string; // matière, ex. « Mathématiques »
  chapter?: string; // chapitre, ex. « Le théorème de Pythagore »
  question?: string; // la question / l'énoncé en cours
  cards?: { q: string; a: string }[]; // cartes de révision sélectionnées
  homework?: string; // devoir sélectionné
  lesson?: string; // contenu de cours sélectionné
  mistake?: string; // une erreur à expliquer
};

/** Actions rapides proposées dans l'interface. */
export type QuickAction =
  | "explain"
  | "summarize"
  | "flashcards"
  | "questions"
  | "revise"
  | "mistake";

/** Corps de la requête POST /api/ai/chat envoyé par le frontend. */
export type ChatRequest = {
  message: string;
  history?: ChatMessage[];
  context?: OrbsContext;
  action?: QuickAction;
};

/** Réponse renvoyée par le backend (aucun secret, aucune donnée inutile). */
export type ChatResponse = {
  reply: string;
  model: string;
  usage?: { inputTokens: number; outputTokens: number };
};

/** Réponse d'erreur normalisée. */
export type ChatError = {
  error: string; // code machine : "unauthorized" | "not_configured" | ...
  message: string; // message lisible, en français, affichable tel quel
  retryAfter?: number; // secondes avant nouvelle tentative (429)
};
