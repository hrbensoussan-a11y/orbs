import { z } from "zod";

// ------- Auth -------

export const SignupSchema = z.object({
  name: z.string().trim().max(80).optional(),
  role: z.enum(["student", "parent"]).default("student"),
  email: z.email({ error: "Adresse e-mail invalide." }),
  password: z
    .string()
    .min(8, { error: "Le mot de passe doit faire au moins 8 caractères." })
    .max(200),
});

export const LoginSchema = z.object({
  email: z.email({ error: "Adresse e-mail invalide." }),
  password: z.string().min(1, { error: "Mot de passe requis." }),
});

/** Construit un dictionnaire champ -> messages, sans dépendre de l'API
 *  `.flatten()` (dépréciée en zod v4). */
export function fieldErrorsFrom(error: z.ZodError): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "_");
    (out[key] ??= []).push(issue.message);
  }
  return out;
}

// ------- Humeur -------

export const MOODS = [
  { value: 1, emoji: "😔", label: "Difficile" },
  { value: 2, emoji: "😕", label: "Bof" },
  { value: 3, emoji: "😐", label: "Neutre" },
  { value: 4, emoji: "🙂", label: "Bien" },
  { value: 5, emoji: "😄", label: "Radieux" },
] as const;

export function moodEmoji(value: number | null | undefined): string | null {
  if (!value) return null;
  return MOODS.find((m) => m.value === value)?.emoji ?? null;
}

// ------- Prompts suggérés (ignorables) -------
// Petit déclencheur contre la page blanche. La couche « prompts guidés »
// complète (phase 2) viendra plus tard ; ceci reste volontairement léger.

export const PROMPTS: string[] = [
  "Qu'est-ce qui a marqué ta journée ?",
  "De quoi es-tu reconnaissant·e aujourd'hui ?",
  "Qu'est-ce qui t'a demandé de l'énergie, et qu'est-ce qui t'en a donné ?",
  "Si tu devais retenir un seul moment d'aujourd'hui, lequel ?",
  "À quoi penses-tu, là, maintenant ?",
  "Qu'aimerais-tu que demain t'apporte ?",
  "Quelque chose t'a-t-il surpris·e aujourd'hui ?",
  "Qu'est-ce que tu remets à plus tard, et pourquoi ?",
  "Comment te sens-tu, vraiment, en ce moment ?",
  "Qu'as-tu appris récemment sur toi ?",
];

/** Prompt stable pour un jour donné (change chaque jour, pas à chaque rendu). */
export function promptForDate(date = new Date()): string {
  const dayIndex = Math.floor(date.getTime() / 86_400_000);
  return PROMPTS[dayIndex % PROMPTS.length];
}

// ------- Entrées : parsing des champs côté API -------

/** Transforme une saisie "un, deux ,trois" en liste normalisée unique. */
export function parseTags(input: unknown): string[] {
  if (Array.isArray(input)) {
    return dedupe(input.map((t) => String(t).trim()).filter(Boolean));
  }
  if (typeof input === "string") {
    return dedupe(
      input
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
    );
  }
  return [];
}

function dedupe(list: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of list) {
    const key = item.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      out.push(item);
    }
  }
  return out;
}
