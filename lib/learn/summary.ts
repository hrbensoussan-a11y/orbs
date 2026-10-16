// Résumé de la progression Apprendre, envoyé au serveur pour l'espace
// famille. Uniquement des compteurs : jamais le contenu des fiches.
import type { State } from "./types";
import { mastery } from "./sm2";
import { levelFromXp, dateKey } from "./progress";

export type LearnSummary = {
  xp: number;
  level: number;
  streak: number;
  lastDay: string; // AAAA-MM-JJ
  reviews: number;
  focus: number;
  mastered: number;
  badges: string[];
  days: Record<string, number>; // 60 derniers jours : AAAA-MM-JJ -> actions
  decks: { name: string; subject: string; cards: number; mastered: number }[];
};

export function summarize(state: State): LearnSummary {
  const since = new Date();
  since.setDate(since.getDate() - 60);
  const minKey = dateKey(since);
  const days: Record<string, number> = {};
  for (const [k, v] of Object.entries(state.stats.journal))
    if (k >= minKey) days[k] = v;

  let mastered = 0;
  const decks = Object.values(state.decks).map((d) => {
    const m = d.cards.filter((c) => mastery(c) === "mastered").length;
    mastered += m;
    return { name: d.name, subject: d.subject, cards: d.cards.length, mastered: m };
  });

  return {
    xp: state.stats.xp,
    level: levelFromXp(state.stats.xp),
    streak: state.stats.streak,
    lastDay: state.stats.lastDay,
    reviews: state.stats.reviews,
    focus: state.stats.focus,
    mastered,
    badges: state.stats.badges,
    days,
    decks,
  };
}
