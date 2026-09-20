// Moteur d'apprentissage — modèle de données (spec §1).
// Un seul modèle de carte + un seul planificateur (SM-2) + une seule
// progression, réutilisés par tous les types (kind).

export type Kind =
  | "definitions" // t=terme, d=définition
  | "questions" // t=question, d=réponse
  | "cloze" // t=passage avec [[mot]] — phase suivante
  | "memorize" // t=titre, d=texte — phase suivante
  | "order"; // t=titre, d=éléments — phase suivante

export interface Card {
  id: string;
  t: string; // champ 1 (sens selon kind)
  d: string; // champ 2
  // Planification SM-2
  ef: number; // facilité
  iv: number; // intervalle (jours)
  reps: number; // réussites d'affilée
  due: number; // horodatage prochaine révision (ms)
  lapses: number; // oublis
}

export interface Deck {
  id: string;
  name: string;
  subject: string;
  fav: boolean;
  created: number;
  updated: number;
  kind: Kind;
  cards: Card[];
}

export interface Settings {
  dailyGoal: number; // 10 | 20 | 30 | 50
}

export interface Stats {
  xp: number;
  streak: number;
  lastDay: string; // AAAA-MM-JJ
  reviews: number;
  focus: number; // sessions de concentration terminées
  badges: string[];
  journal: Record<string, number>; // AAAA-MM-JJ -> actions
}

export interface State {
  version: number;
  decks: Record<string, Deck>;
  settings: Settings;
  stats: Stats;
}

export const KIND_META: Record<
  Kind,
  { label: string; f1: string; f2: string; ready: boolean; desc: string }
> = {
  definitions: {
    label: "Définitions",
    f1: "Mot ou terme",
    f2: "Sa définition",
    ready: true,
    desc: "Mot → définition. Flashcards, quiz, association…",
  },
  questions: {
    label: "Questions de cours",
    f1: "Question",
    f2: "Réponse modèle",
    ready: true,
    desc: "Des questions ouvertes ; tu réponds de tête puis tu te corriges.",
  },
  cloze: {
    label: "Texte à trous",
    f1: "Passage",
    f2: "",
    ready: false,
    desc: "Cache des mots dans ton cours et retrouve-les dans le contexte.",
  },
  memorize: {
    label: "Apprendre par cœur",
    f1: "Titre",
    f2: "Texte",
    ready: false,
    desc: "Un poème, une citation, une définition exacte, mot pour mot.",
  },
  order: {
    label: "Remettre dans l'ordre",
    f1: "Titre",
    f2: "Éléments (un par ligne)",
    ready: false,
    desc: "Des événements ou des étapes à replacer dans le bon ordre.",
  },
};

export const SUBJECTS = [
  "SVT",
  "Physique-Chimie",
  "Maths",
  "Histoire-Géo",
  "SES",
  "Philo",
  "Français",
  "Anglais",
] as const;

// Une couleur d'accent par matière (codage catégoriel — DA §5).
export const SUBJECT_TONE: Record<string, string> = {
  SVT: "green",
  "Physique-Chimie": "sky",
  Maths: "lilac",
  "Histoire-Géo": "amber",
  SES: "sky",
  Philo: "lilac",
  Français: "amber",
  Anglais: "coral",
  Autre: "green",
};
