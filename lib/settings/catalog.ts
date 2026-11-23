// Catalogue des Réglages — catégories et index de recherche (client & serveur).
//
// Une seule source pour :
//   - l'ordre et les libellés des catégories (menu latéral, liste mobile) ;
//   - la recherche « Rechercher un réglage » : chaque entrée pointe vers une
//     ligne réelle de la page (ancre `reglage-<id>`), que la recherche ouvre
//     et met en évidence.
// Aucun réglage n'est listé ici sans contrôle correspondant dans la page
// (vérifié par tests/settings-catalog.test.ts).

export type SettingsCategoryId =
  | "apparence"
  | "notifications"
  | "agenda"
  | "apprentissage"
  | "assistant"
  | "compte";

export type SettingsTone = "green" | "amber" | "coral" | "sky" | "lilac" | "ink";

export type SettingsCategory = {
  id: SettingsCategoryId;
  label: string;
  /** Résumé d'une ligne (liste mobile, en-tête de catégorie). */
  desc: string;
  tone: SettingsTone;
};

export const SETTINGS_CATEGORIES: readonly SettingsCategory[] = [
  { id: "apparence", label: "Apparence", desc: "Thème, fond, lecture et confort visuel", tone: "coral" },
  { id: "notifications", label: "Notifications", desc: "Rappels, sonnerie et journal", tone: "amber" },
  { id: "agenda", label: "Agenda", desc: "Rappels de cours, de devoirs et du soir", tone: "sky" },
  { id: "apprentissage", label: "Apprentissage", desc: "Objectif, intensité, repos et concentration", tone: "green" },
  { id: "assistant", label: "Assistant IA", desc: "Style, profil, historique et commandes", tone: "lilac" },
  { id: "compte", label: "Compte et données", desc: "Profil, exports et déconnexion", tone: "ink" },
] as const;

export const DEFAULT_CATEGORY: SettingsCategoryId = "apparence";

const CATEGORY_IDS = new Set<string>(SETTINGS_CATEGORIES.map((c) => c.id));

/** Garde-type : une catégorie connue, sinon `null`. */
export function toCategoryId(value: unknown): SettingsCategoryId | null {
  return typeof value === "string" && CATEGORY_IDS.has(value) ? (value as SettingsCategoryId) : null;
}

export function categoryById(id: SettingsCategoryId): SettingsCategory {
  return SETTINGS_CATEGORIES.find((c) => c.id === id) ?? SETTINGS_CATEGORIES[0];
}

export type SettingEntry = {
  /** Ancre de la ligne dans la page : `reglage-<id>`. */
  id: string;
  category: SettingsCategoryId;
  title: string;
  /** Mots-clés supplémentaires (synonymes, termes voisins). */
  keywords: string;
};

export const SETTINGS_INDEX: readonly SettingEntry[] = [
  // Apparence
  { id: "theme", category: "apparence", title: "Thème", keywords: "clair sombre nuit mode sombre dark anti lumière bleue chaud couleurs" },
  { id: "fond", category: "apparence", title: "Fond d’écran", keywords: "arrière-plan background arc-en-ciel menthe coucher soleil océan uni" },
  { id: "luminosite", category: "apparence", title: "Luminosité", keywords: "atténuer sombre yeux fatigue éclairage" },
  { id: "taille-texte", category: "apparence", title: "Taille du texte", keywords: "police lecture écriture journal assistant grand petit lisibilité accessibilité confort" },
  { id: "espacement-texte", category: "apparence", title: "Espacement du texte", keywords: "interligne lignes paragraphes lecture aéré serré confort lisibilité" },
  { id: "animations", category: "apparence", title: "Réduire les animations", keywords: "mouvements transitions accessibilité lent téléphone confort" },
  { id: "reinitialiser-apparence", category: "apparence", title: "Réinitialiser l’apparence", keywords: "défaut remettre à zéro" },
  // Notifications
  { id: "rappels", category: "notifications", title: "Activer les rappels", keywords: "notifications alertes permission navigateur" },
  { id: "sonnerie", category: "notifications", title: "Sonnerie", keywords: "son alerte cloche carillon marimba silence" },
  { id: "volume", category: "notifications", title: "Volume", keywords: "son sonnerie fort faible" },
  { id: "tester-rappel", category: "notifications", title: "Tester le rappel", keywords: "essai essayer son" },
  { id: "rappel-journal", category: "notifications", title: "Rappel d’écriture du journal", keywords: "écrire page jour soir oubli" },
  // Agenda
  { id: "avant-cours", category: "agenda", title: "Rappel avant un cours", keywords: "cours emploi du temps minutes avant prévenir" },
  { id: "devoirs-du-jour", category: "agenda", title: "Résumé des devoirs du jour", keywords: "devoirs heure matin résumé" },
  { id: "devoirs-week-end", category: "agenda", title: "Résumé des devoirs le week-end", keywords: "samedi dimanche repos" },
  { id: "preparer-demain", category: "agenda", title: "Préparer ma journée de demain", keywords: "soir veille lendemain récapitulatif cours devoirs affaires sac rappel" },
  // Apprentissage
  { id: "objectif-quotidien", category: "apprentissage", title: "Objectif quotidien de révision", keywords: "cartes flashcards révisions par jour but série" },
  { id: "intensite-revisions", category: "apprentissage", title: "Intensité des révisions", keywords: "légère équilibrée intensive répétition espacée rythme fréquence cartes" },
  { id: "jours-repos", category: "apprentissage", title: "Jours de repos", keywords: "pause congé week-end samedi dimanche série streak objectif" },
  { id: "minuteur", category: "apprentissage", title: "Minuteur de concentration", keywords: "pomodoro durée travail pause focus" },
  { id: "mode-concentration", category: "apprentissage", title: "Mode Concentration", keywords: "focus silence sourdine rappels attente ne pas déranger notifications" },
  // Assistant IA
  { id: "style-ia", category: "assistant", title: "Style d’accompagnement", keywords: "guide équilibré direct explication indices réponse pédagogie apprentissage" },
  { id: "mode-ia", category: "assistant", title: "Mode de réflexion", keywords: "core ultra profondeur raisonnement intelligence" },
  { id: "voix", category: "assistant", title: "Voix de l’assistant", keywords: "vocal nova alloy shimmer parler" },
  { id: "lecture-auto", category: "assistant", title: "Lire les réponses à voix haute", keywords: "lecture automatique audio écouter" },
  { id: "profil-classe", category: "assistant", title: "Ce que l’assistant sait de toi", keywords: "profil d'apprentissage classe niveau préférences matières difficultés personnalisation" },
  { id: "conservation-conversations", category: "assistant", title: "Conservation des conversations", keywords: "historique discussions 30 jours supprimer garder confidentialité" },
  { id: "supprimer-historique", category: "assistant", title: "Supprimer l’historique", keywords: "effacer conversations discussions confidentialité" },
  { id: "profil-vider", category: "assistant", title: "Vider mon profil d’apprentissage", keywords: "effacer supprimer profil informations assistant" },
  { id: "bulle", category: "assistant", title: "Bulle de l’assistant", keywords: "rond flottant afficher masquer taille style" },
  { id: "commandes", category: "assistant", title: "Commandes de l’IA", keywords: "raccourcis hashtag # dièse favoris symbole court détaillé longueur" },
  // Compte et données
  { id: "centre-compte", category: "compte", title: "Centre de compte", keywords: "profil nom e-mail mot de passe sécurité abonnement supprimer" },
  { id: "export-journal", category: "compte", title: "Exporter mon journal", keywords: "sauvegarde json markdown télécharger données" },
  { id: "deconnexion", category: "compte", title: "Se déconnecter", keywords: "quitter déconnexion sortir" },
] as const;

/** Minuscules, sans accents ni ponctuation superflue. */
export function normalizeSearch(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[’'`]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Mots d'un texte normalisé (les traits d'union restent dans le mot). */
function wordsOf(text: string): string[] {
  return normalizeSearch(text).split(/[^a-z0-9-]+/).filter(Boolean);
}

/**
 * Réglages correspondant à une recherche : chaque mot tapé doit être le DÉBUT
 * d'un mot du titre, des mots-clés ou du nom de la catégorie (« son » trouve
 * « sonnerie », pas « json »). Les réglages dont le TITRE correspond passent
 * en premier.
 */
export function searchSettings(query: string, limit = 8): SettingEntry[] {
  const words = wordsOf(query);
  if (words.length === 0) return [];
  const scored: { entry: SettingEntry; score: number; order: number }[] = [];
  SETTINGS_INDEX.forEach((entry, order) => {
    const title = wordsOf(entry.title);
    const hay = [...title, ...wordsOf(entry.keywords), ...wordsOf(categoryById(entry.category).label)];
    const hit = (pool: string[], w: string) => pool.some((h) => h.startsWith(w));
    if (!words.every((w) => hit(hay, w))) return;
    const score = words.filter((w) => hit(title, w)).length;
    scored.push({ entry, score, order });
  });
  scored.sort((a, b) => b.score - a.score || a.order - b.order);
  return scored.slice(0, limit).map((s) => s.entry);
}

export const settingAnchor = (id: string) => `reglage-${id}`;
