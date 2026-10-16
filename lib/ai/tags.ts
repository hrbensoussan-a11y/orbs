// Système de « # » de l'assistant IA.
//
// Les tags sont des RACCOURCIS de contexte/mode : en tapant « #agenda » (ou le
// déclencheur choisi par l'élève : # / ou ;), l'élève oriente l'assistant.
// Chaque tag porte une consigne (desc) qui est à la fois affichée dans les
// réglages ET envoyée à l'IA pour qu'elle adopte le bon mode.
//
// Ce module est pur (données + fonctions) : il est utilisé côté client
// (chat, réglages) ET côté serveur (construction du prompt). Aucun accès à
// localStorage au niveau module — uniquement dans les fonctions, protégées.

export type AiTag = {
  id: string; // le mot après le #, ex. "agenda"
  label: string; // libellé affiché, ex. "Agenda"
  emoji: string;
  category: string;
  desc: string; // consigne : affichée en réglages + envoyée à l'IA
};

export const TAG_CATEGORIES = [
  "Apprendre & scolarité",
  "Vie personnelle & organisation",
  "Modes pédagogiques",
  "Orbs & communication",
] as const;

export const AI_TAGS: AiTag[] = [
  // Apprendre & scolarité
  { id: "apprendre", label: "Apprendre", emoji: "📚", category: TAG_CATEGORIES[0], desc: "Accès au module Apprendre (paquets, cartes, matières, progression) : explique une carte, propose des révisions, repère les notions à retravailler." },
  { id: "reviser", label: "Réviser", emoji: "🔁", category: TAG_CATEGORIES[0], desc: "Coach de révision : regarde les cartes dues et les notions faibles, puis fait une session question → réponse → correction → suivante." },
  { id: "cours", label: "Cours", emoji: "📖", category: TAG_CATEGORIES[0], desc: "Travaille à partir du cours fourni ou enregistré : résume, explique, repère les notions clés, crée des exercices, sans inventer un autre programme." },
  { id: "devoirs", label: "Devoirs", emoji: "📝", category: TAG_CATEGORIES[0], desc: "Consulte les devoirs de l'Agenda (matière, intitulé, échéance, statut), dit ce qui est prioritaire et aide sur un devoir précis." },
  { id: "agenda", label: "Agenda", emoji: "📅", category: TAG_CATEGORIES[0], desc: "Consulte l'emploi du temps et les événements (ex. « que dois-je faire demain ? »)." },
  { id: "examens", label: "Examens", emoji: "🎯", category: TAG_CATEGORIES[0], desc: "Se concentre sur les contrôles/examens à venir : échéances proches et organisation des révisions." },
  { id: "matiere", label: "Matière", emoji: "🧪", category: TAG_CATEGORIES[0], desc: "Travaille sur une matière précise ; les demandes suivantes sont comprises dans ce contexte." },
  { id: "erreurs", label: "Erreurs", emoji: "❌", category: TAG_CATEGORIES[0], desc: "Utilise les erreurs des sessions de révision pour repérer les notions qui posent problème et proposer un travail ciblé." },
  { id: "quiz", label: "Quiz", emoji: "❓", category: TAG_CATEGORIES[0], desc: "Crée un quiz à partir d'un cours, d'un paquet ou d'une matière : questions une par une, correction, difficulté adaptée." },
  { id: "fiches", label: "Fiches", emoji: "🗂️", category: TAG_CATEGORIES[0], desc: "Transforme un cours en fiche de révision : définitions, idées clés, exemples, pièges, points à mémoriser." },
  { id: "flashcards", label: "Flashcards", emoji: "🃏", category: TAG_CATEGORIES[0], desc: "Transforme un contenu en cartes compatibles avec Apprendre, prêtes à enregistrer dans un paquet." },
  { id: "planning", label: "Planning", emoji: "🗓️", category: TAG_CATEGORIES[0], desc: "Combine devoirs + examens + agenda + disponibilité pour proposer un planning de travail réaliste." },
  // Vie personnelle & organisation
  { id: "journal", label: "Journal", emoji: "📓", category: TAG_CATEGORIES[1], desc: "Accès aux entrées du Journal UNIQUEMENT si l'élève l'autorise : résumé, souvenir, aide à réfléchir." },
  { id: "humeur", label: "Humeur", emoji: "🌤️", category: TAG_CATEGORIES[1], desc: "Utilise les données d'humeur du Journal (évolution, tendances). Jamais de diagnostic médical." },
  { id: "objectifs", label: "Objectifs", emoji: "🏁", category: TAG_CATEGORIES[1], desc: "Consulte les objectifs et aide à les transformer en petites actions concrètes et à suivre leur progression." },
  { id: "habitudes", label: "Habitudes", emoji: "🔗", category: TAG_CATEGORIES[1], desc: "Analyse les habitudes (régularité des révisions, activité, séries) et repère ce qui marche le mieux." },
  { id: "semaine", label: "Semaine", emoji: "📊", category: TAG_CATEGORIES[1], desc: "Bilan de la semaine à partir des données disponibles (devoirs, révisions, agenda, et journal/humeur si autorisés)." },
  { id: "journee", label: "Journée", emoji: "☀️", category: TAG_CATEGORIES[1], desc: "Regroupe l'essentiel de la journée (cours, devoirs, révisions, événements) : « qu'est-ce qui est important aujourd'hui ? »." },
  { id: "priorites", label: "Priorités", emoji: "⭐", category: TAG_CATEGORIES[1], desc: "Analyse tâches et échéances pour dire ce qui passe en premier, en expliquant pourquoi." },
  { id: "organisation", label: "Organisation", emoji: "🧭", category: TAG_CATEGORIES[1], desc: "Mode organisation générale : structurer devoirs, révisions, tâches et temps, sans accéder au contenu privé." },
  { id: "concentration", label: "Concentration", emoji: "🎧", category: TAG_CATEGORIES[1], desc: "Crée une session de travail : objectif, durée, étapes, pauses, tâche précise." },
  { id: "bilan", label: "Bilan", emoji: "📈", category: TAG_CATEGORIES[1], desc: "Bilan plus complet d'une période (journée, semaine, mois), uniquement avec les sources autorisées." },
  // Modes pédagogiques
  { id: "explique", label: "Explique", emoji: "💡", category: TAG_CATEGORIES[2], desc: "Mode explication pédagogique : part du niveau de l'élève, explique progressivement, vérifie la compréhension." },
  { id: "apprends-moi", label: "Apprends-moi", emoji: "👩‍🏫", category: TAG_CATEGORIES[2], desc: "Mode professeur interactif : explication → exemple → question → réponse → correction → suite." },
  { id: "interroge-moi", label: "Interroge-moi", emoji: "🙋", category: TAG_CATEGORIES[2], desc: "Mode examinateur : pose une question, attend la réponse, corrige, continue, en adaptant la difficulté." },
  { id: "simplifie", label: "Simplifie", emoji: "🔎", category: TAG_CATEGORIES[2], desc: "Reformule un contenu compliqué avec des mots simples, en gardant les informations importantes." },
  { id: "approfondis", label: "Approfondis", emoji: "🔬", category: TAG_CATEGORIES[2], desc: "Va plus loin sur une notion : explications supplémentaires, exemples, liens entre concepts, cas particuliers." },
  { id: "corrige", label: "Corrige", emoji: "✅", category: TAG_CATEGORIES[2], desc: "Analyse une réponse ou un raisonnement : ce qui est juste, ce qui ne l'est pas, et surtout pourquoi." },
  { id: "exercice", label: "Exercice", emoji: "✏️", category: TAG_CATEGORIES[2], desc: "Crée des exercices personnalisés ; la correction vient après la tentative de l'élève." },
  { id: "oral", label: "Oral", emoji: "🎤", category: TAG_CATEGORIES[2], desc: "Mode oral : simule des questions, demande des réponses développées, donne un retour sur la clarté et la structure." },
  { id: "methode", label: "Méthode", emoji: "🧠", category: TAG_CATEGORIES[2], desc: "Aide à choisir une méthode de travail (mémorisation, exercices, contrôle, texte, dissertation…)." },
  // Orbs & communication
  { id: "prof", label: "Prof", emoji: "✉️", category: TAG_CATEGORIES[3], desc: "Aide à rédiger un message à un professeur (absence, question, précision…), au bon niveau de politesse." },
  { id: "compte", label: "Compte", emoji: "👤", category: TAG_CATEGORIES[3], desc: "Utilise seulement les infos générales utiles du profil (classe, matières, établissement). Jamais d'infos sensibles inutiles." },
  { id: "recherche", label: "Recherche", emoji: "🔍", category: TAG_CATEGORIES[3], desc: "Cherche dans les données locales d'Orbs (Journal, cartes, devoirs, cours, agenda). Ex. « où ai-je parlé des fractions ? »." },
  { id: "orbs", label: "Orbs", emoji: "🟢", category: TAG_CATEGORIES[3], desc: "Contexte global intelligent : choisit seulement les sources Orbs utiles pour répondre, pas tout le compte automatiquement." },
];

export const TAG_BY_ID: Map<string, AiTag> = new Map(AI_TAGS.map((t) => [t.id, t]));
export const AI_TAG_IDS: Set<string> = new Set(AI_TAGS.map((t) => t.id));

/** Minuscule + sans accents, pour comparer « é » et « e ». */
export function normalizeTag(s: string): string {
  return String(s)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

/**
 * Classe les tags pour une saisie partielle.
 * Priorité : favoris d'abord, puis « commence par », puis « contient ».
 * Un `query` vide renvoie tous les tags (favoris d'abord).
 */
export function matchTags(query: string, favorites: string[] = [], limit = 6): AiTag[] {
  const q = normalizeTag(query);
  const favSet = new Set(favorites);
  const scored = AI_TAGS.map((t) => {
    const nid = normalizeTag(t.id);
    const nlabel = normalizeTag(t.label);
    let rank = 3; // ne correspond pas
    if (!q) rank = 1;
    else if (nid.startsWith(q) || nlabel.startsWith(q)) rank = 0;
    else if (nid.includes(q) || nlabel.includes(q)) rank = 2;
    return { t, rank, fav: favSet.has(t.id) };
  }).filter((x) => x.rank < 3);

  scored.sort((a, b) => {
    if (a.fav !== b.fav) return a.fav ? -1 : 1; // favoris d'abord
    if (a.rank !== b.rank) return a.rank - b.rank; // meilleure correspondance
    return 0; // sinon ordre de la liste
  });
  return scored.slice(0, limit).map((x) => x.t);
}

// ---- Préférences (déclencheur + favoris), stockées en localStorage ----

export const TRIGGERS = ["#", "/", ";"] as const;
export type Trigger = (typeof TRIGGERS)[number];
export type TagPrefs = { trigger: Trigger; favorites: string[] };
export const TAG_PREFS_KEY = "orbs.ai.tags";

export function loadTagPrefs(): TagPrefs {
  try {
    const raw = localStorage.getItem(TAG_PREFS_KEY);
    if (raw) {
      const p = JSON.parse(raw);
      const trigger = (TRIGGERS as readonly string[]).includes(p?.trigger) ? p.trigger : "#";
      const favorites = Array.isArray(p?.favorites)
        ? p.favorites.filter((f: unknown) => typeof f === "string" && AI_TAG_IDS.has(f))
        : [];
      return { trigger, favorites };
    }
  } catch {
    /* par défaut */
  }
  return { trigger: "#", favorites: [] };
}

export function saveTagPrefs(prefs: TagPrefs): void {
  try {
    localStorage.setItem(TAG_PREFS_KEY, JSON.stringify(prefs));
  } catch {
    /* ignore */
  }
  try {
    window.dispatchEvent(new Event("orbs:aitags"));
  } catch {
    /* hors navigateur */
  }
}

/** Repère les tags connus présents dans un message, pour un déclencheur donné. */
export function extractTags(message: string, trigger: string): string[] {
  const found: string[] = [];
  // déclencheur échappé pour la regex, puis un mot (lettres/chiffres/-)
  const esc = trigger.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(esc + "([\\p{L}\\d-]+)", "gu");
  let m: RegExpExecArray | null;
  while ((m = re.exec(message))) {
    const id = normalizeTag(m[1]);
    if (AI_TAG_IDS.has(id) && !found.includes(id)) found.push(id);
  }
  return found;
}
