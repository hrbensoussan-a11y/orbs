// Profil d'apprentissage (Réglages → Assistant IA → « Ce que l'assistant sait
// de toi »).
//
// Entièrement FACULTATIF et rempli par l'élève lui-même : Orbs ne le complète
// jamais tout seul. Il sert à adapter les explications de l'assistant
// (niveau, exemples, matières à accompagner davantage).
//
// Stockage : la classe reste celle du compte (User.schoolClass, la même que
// dans Compte → Profil) ; le reste vit dans Settings.learningProfile (JSON).
// Les préférences et difficultés sont des CHOIX FERMÉS (identifiants connus) :
// on ne collecte pas d'information sensible inutile, et aucun diagnostic
// n'est demandé. Seule la note libre (« Autre chose à savoir ») est un texte,
// court et nettoyé.
//
// Module pur : validation partagée entre l'action serveur (écriture), la
// route /api/ai/chat (lecture, défensive) et l'interface des Réglages.

import { z } from "zod";

export const PROFILE_LIMITS = {
  schoolClass: 40, // même limite que le formulaire du compte
  about: 300,
} as const;

export const LEARNING_PREFERENCES = [
  { id: "exemples", label: "Avec des exemples concrets", prompt: "avec des exemples concrets" },
  { id: "schemas", label: "Avec des schémas ou des tableaux", prompt: "avec des schémas ou des tableaux" },
  { id: "etapes", label: "Étape par étape", prompt: "étape par étape" },
  { id: "resumes", label: "Avec des résumés courts", prompt: "avec des résumés courts" },
  { id: "exercices", label: "En m’entraînant", prompt: "en s'entraînant sur des exercices" },
  { id: "memo", label: "Avec des astuces pour mémoriser", prompt: "avec des astuces pour mémoriser" },
] as const;

export const LEARNING_DIFFICULTIES = [
  { id: "concentration", label: "Rester concentré·e", prompt: "rester concentré" },
  { id: "memoriser", label: "Mémoriser", prompt: "mémoriser" },
  { id: "consignes", label: "Comprendre les consignes", prompt: "comprendre les consignes" },
  { id: "rediger", label: "Rédiger", prompt: "rédiger" },
  { id: "calcul", label: "Le calcul", prompt: "le calcul" },
  { id: "organisation", label: "M’organiser", prompt: "s'organiser" },
  { id: "stress", label: "Le stress des contrôles", prompt: "le stress des contrôles" },
  { id: "lecture", label: "Lire des textes longs", prompt: "lire des textes longs" },
] as const;

/** Les matières de l'assistant (mêmes noms que ses discussions par matière). */
export const PROFILE_SUBJECTS = [
  "Maths",
  "Français",
  "Histoire-Géo",
  "Anglais",
  "SVT",
  "Physique-Chimie",
  "SES",
  "Philo",
] as const;

export type LearningProfile = {
  prefs: string[];
  subjects: string[];
  difficulties: string[];
  about: string;
};

export const EMPTY_PROFILE: LearningProfile = { prefs: [], subjects: [], difficulties: [], about: "" };

const PREF_IDS: readonly string[] = LEARNING_PREFERENCES.map((p) => p.id);
const DIFF_IDS: readonly string[] = LEARNING_DIFFICULTIES.map((d) => d.id);
const SUBJECTS: readonly string[] = PROFILE_SUBJECTS;

/**
 * Texte libre sûr : pas de caractères de contrôle ni de retours à la ligne
 * (le texte est cité tel quel dans le prompt), espaces resserrés, longueur
 * bornée.
 */
export function cleanText(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  return value
    .replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max)
    .trim();
}

/** Garde les seuls identifiants connus, sans doublon, dans l'ordre du catalogue. */
function pick(values: unknown, allowed: readonly string[]): string[] {
  if (!Array.isArray(values)) return [];
  const set = new Set(values.filter((v): v is string => typeof v === "string"));
  return allowed.filter((id) => set.has(id));
}

/** Lecture défensive d'un profil stocké (JSON) : jamais d'exception. */
export function parseLearningProfile(json: string | null | undefined): LearningProfile {
  if (!json) return { ...EMPTY_PROFILE };
  try {
    const o = JSON.parse(json) as Record<string, unknown>;
    return normalizeProfile(o);
  } catch {
    return { ...EMPTY_PROFILE };
  }
}

export function normalizeProfile(o: Record<string, unknown> | null | undefined): LearningProfile {
  return {
    prefs: pick(o?.prefs, PREF_IDS),
    subjects: pick(o?.subjects, SUBJECTS),
    difficulties: pick(o?.difficulties, DIFF_IDS),
    about: cleanText(o?.about, PROFILE_LIMITS.about),
  };
}

export function isProfileEmpty(p: LearningProfile): boolean {
  return !p.prefs.length && !p.subjects.length && !p.difficulties.length && !p.about;
}

/** Valeur à enregistrer : `null` quand le profil est vide (rien n'est gardé). */
export function serializeProfile(p: LearningProfile): string | null {
  return isProfileEmpty(p) ? null : JSON.stringify({ v: 1, ...p });
}

// ---------------------------------------------------------------------------
// Validation stricte d'une saisie (action serveur)
// ---------------------------------------------------------------------------

const inputSchema = z.object({
  schoolClass: z.string().max(200),
  prefs: z.array(z.string().max(40)).max(LEARNING_PREFERENCES.length),
  subjects: z.array(z.string().max(40)).max(PROFILE_SUBJECTS.length),
  difficulties: z.array(z.string().max(40)).max(LEARNING_DIFFICULTIES.length),
  about: z.string().max(PROFILE_LIMITS.about * 2),
});

export type ProfileInput = z.input<typeof inputSchema>;

export type ValidatedProfile = { schoolClass: string; profile: LearningProfile };

/**
 * Valide une saisie venue du navigateur. Refuse les valeurs inconnues (on ne
 * les ignore pas en silence : la saisie a été manipulée) et nettoie les
 * textes. Les textes trop longs de peu sont tronqués ; démesurés, refusés.
 */
export function validateProfileInput(
  raw: unknown,
): { ok: true; value: ValidatedProfile } | { ok: false; error: string } {
  const parsed = inputSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Profil invalide." };
  const d = parsed.data;
  const unknown =
    d.prefs.some((v) => !PREF_IDS.includes(v)) ||
    d.subjects.some((v) => !SUBJECTS.includes(v)) ||
    d.difficulties.some((v) => !DIFF_IDS.includes(v));
  if (unknown) return { ok: false, error: "Choix inconnu dans le profil." };
  return {
    ok: true,
    value: {
      schoolClass: cleanText(d.schoolClass, PROFILE_LIMITS.schoolClass),
      profile: normalizeProfile(d),
    },
  };
}

// ---------------------------------------------------------------------------
// Texte transmis à l'assistant
// ---------------------------------------------------------------------------

function labelsOf(ids: string[], catalog: readonly { id: string; prompt: string }[]): string {
  return catalog
    .filter((c) => ids.includes(c.id))
    .map((c) => c.prompt)
    .join(" ; ");
}

/**
 * Lignes du profil pour le prompt système (vide si rien n'est renseigné).
 * La classe est traitée à part par le prompt (elle existait déjà).
 */
export function profilePromptLines(p: LearningProfile): string[] {
  const lines: string[] = [];
  if (p.prefs.length) lines.push(`- Apprend mieux : ${labelsOf(p.prefs, LEARNING_PREFERENCES)}.`);
  if (p.subjects.length)
    lines.push(`- Souhaite plus d'accompagnement en : ${p.subjects.join(", ")}.`);
  if (p.difficulties.length)
    lines.push(`- Trouve plus difficile : ${labelsOf(p.difficulties, LEARNING_DIFFICULTIES)}.`);
  if (p.about) lines.push(`- Précise aussi : « ${p.about} »`);
  return lines;
}

/** Profil lisible pour l'archive « Mes données » (libellés, pas d'identifiants). */
export function profileForExport(p: LearningProfile): {
  preferences: string[];
  matieres: string[];
  difficultes: string[];
  precisions: string;
} {
  return {
    preferences: LEARNING_PREFERENCES.filter((c) => p.prefs.includes(c.id)).map((c) => c.label),
    matieres: [...p.subjects],
    difficultes: LEARNING_DIFFICULTIES.filter((c) => p.difficulties.includes(c.id)).map((c) => c.label),
    precisions: p.about,
  };
}
