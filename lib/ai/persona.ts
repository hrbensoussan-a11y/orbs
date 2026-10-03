// La « personnalité Orbs » : le message système envoyé à l'IA.
//
// On garde ce texte court et stable. Il définit le ton (pédagogue, calme,
// encourageant), la langue (français par défaut) et adapte le niveau à la
// classe de l'élève. Le contexte scolaire (matière, cours, devoir…) n'est
// ajouté QUE s'il a été explicitement sélectionné par l'utilisateur.

import { AI_CONFIG } from "./config";
import type { OrbsContext, QuickAction } from "./types";

type Profile = {
  firstName?: string | null;
  schoolClass?: string | null;
};

const ACTION_HINTS: Record<QuickAction, string> = {
  explain:
    "L'élève veut COMPRENDRE. Explique pas à pas, avec un exemple simple, sans te contenter de donner la réponse.",
  summarize:
    "Résume l'essentiel en points clés courts et faciles à mémoriser.",
  flashcards:
    "Crée une fiche de révision : titre, puis 5 à 10 points clés (recto → verso) au format liste.",
  questions:
    "Crée 5 questions d'entraînement sur le contenu fourni, puis donne les réponses dans une section séparée en dessous.",
  revise:
    "Aide l'élève à réviser : rappelle les points essentiels puis pose-lui 2 ou 3 questions pour vérifier sa compréhension.",
  mistake:
    "Explique l'erreur avec bienveillance : pourquoi c'est faux, la bonne démarche, et un moyen de ne plus la refaire.",
};

/** Construit le message système (personnalité + niveau + action). */
export function buildSystemPrompt(
  profile: Profile,
  action?: QuickAction,
): string {
  const name = (profile.firstName || "").trim();
  const klass = (profile.schoolClass || "").trim();

  const lines = [
    "Tu es l'assistant scolaire d'Orbs, une application d'étude pour les élèves.",
    "Ton rôle : aider à comprendre les cours, réviser, et t'entraîner.",
    "",
    "Ton et style :",
    "- Réponds en français par défaut.",
    "- Sois clair, calme, pédagogue et encourageant.",
    "- Sois concis quand la question est simple ; détaillé seulement quand c'est nécessaire.",
    "- Pour un sujet scolaire, privilégie l'EXPLICATION et la compréhension plutôt que de donner seulement la réponse.",
    "- Utilise un Markdown simple (titres courts, listes, **gras**) pour rester lisible.",
    "",
    "Règles :",
    "- Tu es une IA, pas un professeur humain : ne prétends jamais l'être.",
    "- Si tu n'es pas sûr, dis-le simplement plutôt que d'inventer.",
    "- Reste dans un cadre scolaire et bienveillant.",
  ];

  if (name) lines.push("", `Le prénom de l'élève est ${name}.`);
  if (klass)
    lines.push(
      name ? "" : "",
      `L'élève est en « ${klass} » : adapte le vocabulaire et le niveau à cette classe.`,
    );

  if (action && ACTION_HINTS[action]) {
    lines.push("", `Consigne pour cette demande : ${ACTION_HINTS[action]}`);
  }

  return lines.join("\n");
}

/**
 * Formate le contexte scolaire sélectionné en un bloc compact, tronqué à la
 * limite configurée. Renvoie "" si aucun contexte n'a été fourni.
 */
export function buildContextBlock(context?: OrbsContext): string {
  if (!context) return "";
  const parts: string[] = [];

  if (context.subject) parts.push(`Matière : ${context.subject}`);
  if (context.chapter) parts.push(`Chapitre : ${context.chapter}`);
  if (context.question) parts.push(`Question : ${context.question}`);
  if (context.lesson) parts.push(`Cours sélectionné :\n${context.lesson}`);
  if (context.homework) parts.push(`Devoir sélectionné :\n${context.homework}`);
  if (context.mistake) parts.push(`Erreur à expliquer :\n${context.mistake}`);
  if (context.cards && context.cards.length) {
    const cards = context.cards
      .slice(0, 50)
      .map((c, i) => `${i + 1}. ${c.q} → ${c.a}`)
      .join("\n");
    parts.push(`Cartes de révision sélectionnées :\n${cards}`);
  }

  if (!parts.length) return "";
  let block = "Contexte fourni par l'élève :\n\n" + parts.join("\n\n");
  if (block.length > AI_CONFIG.maxContextChars) {
    block = block.slice(0, AI_CONFIG.maxContextChars) + "\n…(contexte tronqué)";
  }
  return block;
}
