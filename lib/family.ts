// Espace famille : lecture de la progression d'un élève par ses parents,
// encouragements et défis. Le contenu du journal n'est JAMAIS partagé :
// seulement le nombre de pages écrites (et l'humeur si l'élève l'a permis).
import { z } from "zod";
import { prisma } from "./prisma";
import type { LearnSummary } from "./learn/summary";
import { levelFromXp, levelProgress } from "./learn/progress";

// ------- Résumé Apprendre -------

const SummarySchema = z.object({
  xp: z.number().int().min(0).max(10_000_000),
  level: z.number().int().min(1).max(10_000),
  streak: z.number().int().min(0).max(100_000),
  lastDay: z.string().max(10),
  reviews: z.number().int().min(0).max(100_000_000),
  focus: z.number().int().min(0).max(1_000_000),
  mastered: z.number().int().min(0).max(1_000_000),
  badges: z.array(z.string().max(40)).max(50),
  days: z.record(z.string().regex(/^\d{4}-\d{2}-\d{2}$/), z.number().int().min(0).max(100_000)),
  decks: z
    .array(
      z.object({
        name: z.string().max(120),
        subject: z.string().max(60),
        cards: z.number().int().min(0).max(100_000),
        mastered: z.number().int().min(0).max(100_000),
      }),
    )
    .max(500),
});

export function validateSummary(raw: unknown): LearnSummary | null {
  const parsed = SummarySchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

export const EMPTY_SUMMARY: LearnSummary = {
  xp: 0, level: 1, streak: 0, lastDay: "", reviews: 0, focus: 0,
  mastered: 0, badges: [], days: {}, decks: [],
};

export function readSummary(json: string | null): LearnSummary {
  if (!json) return EMPTY_SUMMARY;
  try {
    return validateSummary(JSON.parse(json)) ?? EMPTY_SUMMARY;
  } catch {
    return EMPTY_SUMMARY;
  }
}

export function dayKey(d: Date = new Date()): string {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

export function daysAgo(n: number): Date {
  return new Date(Date.now() - n * 86_400_000);
}

/** Série « vivante » : retombe à 0 si l'élève n'a rien fait hier ni aujourd'hui. */
export function liveStreak(s: LearnSummary): number {
  const y = new Date();
  y.setDate(y.getDate() - 1);
  return s.lastDay === dayKey() || s.lastDay === dayKey(y) ? s.streak : 0;
}

export function levelInfo(s: LearnSummary) {
  return { level: levelFromXp(s.xp), progress: levelProgress(s.xp) };
}

// ------- Code famille -------

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // sans 0/O, 1/I
export const CODE_TTL_MS = 24 * 60 * 60 * 1000;

export function newFamilyCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return Array.from(bytes, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join("");
}

/** « abc-123 » -> « ABC123 » */
export function normalizeCode(input: string): string {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

// ------- Accès -------

/** Vérifie qu'un parent est bien lié à cet élève. */
export async function isLinked(parentId: string, childId: string): Promise<boolean> {
  const link = await prisma.familyLink.findUnique({
    where: { parentId_childId: { parentId, childId } },
    select: { id: true },
  });
  return !!link;
}

// ------- Stickers -------

export const STICKERS = [
  { emoji: "🌟", label: "Super !" },
  { emoji: "💪", label: "Courage !" },
  { emoji: "🔥", label: "En feu !" },
  { emoji: "🎉", label: "Bravo !" },
  { emoji: "❤️", label: "Fier·e de toi" },
  { emoji: "🚀", label: "Fusée !" },
  { emoji: "🧠", label: "Cerveau XXL" },
  { emoji: "🌱", label: "Ça pousse !" },
] as const;

// ------- Défis -------

export type ChallengeKind = "streak" | "reviews" | "mastered" | "focus" | "journal";

export const CHALLENGE_KINDS: Record<
  ChallengeKind,
  { label: (n: number) => string; emoji: string; tone: string; presets: number[]; cumulative: boolean }
> = {
  streak: {
    label: (n) => `Réviser ${n} jours d’affilée`,
    emoji: "🔥", tone: "amber", presets: [3, 5, 7, 14], cumulative: false,
  },
  reviews: {
    label: (n) => `Réviser ${n} cartes`,
    emoji: "🃏", tone: "sky", presets: [50, 100, 200, 500], cumulative: true,
  },
  mastered: {
    label: (n) => `Maîtriser ${n} nouvelles cartes`,
    emoji: "🧠", tone: "lilac", presets: [10, 20, 50, 100], cumulative: true,
  },
  focus: {
    label: (n) => `Faire ${n} sessions de concentration`,
    emoji: "⏱️", tone: "green", presets: [3, 5, 10, 20], cumulative: true,
  },
  journal: {
    label: (n) => `Écrire ${n} pages de journal`,
    emoji: "📓", tone: "coral", presets: [3, 5, 7, 10], cumulative: true,
  },
};

export function isChallengeKind(k: string): k is ChallengeKind {
  return k in CHALLENGE_KINDS;
}

/** Valeur brute servant de base au lancement d'un défi cumulatif. */
export function rawValue(kind: ChallengeKind, s: LearnSummary): number {
  switch (kind) {
    case "streak": return 0;
    case "reviews": return s.reviews;
    case "mastered": return s.mastered;
    case "focus": return s.focus;
    case "journal": return 0; // compté en base depuis la création
  }
}

/** Nombre de jours calendaires écoulés depuis `start`, jour de départ inclus. */
function daysSinceStart(start: Date): number {
  const a = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const now = new Date();
  const b = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((b.getTime() - a.getTime()) / 86_400_000) + 1;
}

export type ChallengeView = {
  id: string;
  kind: ChallengeKind;
  title: string;
  emoji: string;
  tone: string;
  target: number;
  current: number;
  reward: string | null;
  createdAt: Date;
  completedAt: Date | null;
  fromName: string;
};

/**
 * Charge les défis d'un élève et calcule leur avancement. Un défi atteint
 * est marqué terminé une fois pour toutes (il ne se « dé-réussit » pas).
 */
export async function loadChallenges(
  childId: string,
  summary: LearnSummary,
  opts: { fromId?: string } = {},
): Promise<ChallengeView[]> {
  const rows = await prisma.challenge.findMany({
    where: { toId: childId, cancelled: false, ...(opts.fromId ? { fromId: opts.fromId } : {}) },
    orderBy: { createdAt: "desc" },
    take: 30,
    include: { from: { select: { name: true, firstName: true, email: true } } },
  });

  const out: ChallengeView[] = [];
  for (const c of rows) {
    if (!isChallengeKind(c.kind)) continue;
    const meta = CHALLENGE_KINDS[c.kind];
    let current: number;
    if (c.completedAt) current = c.target;
    else if (c.kind === "streak")
      // Seuls les jours depuis le lancement comptent (sinon une série déjà
      // en cours validerait le défi immédiatement).
      current = Math.min(liveStreak(summary), daysSinceStart(c.createdAt));
    else if (c.kind === "journal")
      current = await prisma.entry.count({
        where: { userId: childId, createdAt: { gte: c.createdAt }, content: { not: "" } },
      });
    else current = Math.max(0, rawValue(c.kind, summary) - c.baseline);

    let completedAt = c.completedAt;
    if (!completedAt && current >= c.target) {
      completedAt = new Date();
      await prisma.challenge.update({ where: { id: c.id }, data: { completedAt } });
    }

    out.push({
      id: c.id,
      kind: c.kind,
      title: meta.label(c.target),
      emoji: meta.emoji,
      tone: meta.tone,
      target: c.target,
      current: Math.min(current, c.target),
      reward: c.reward,
      createdAt: c.createdAt,
      completedAt,
      fromName: c.from.firstName || c.from.name || c.from.email.split("@")[0],
    });
  }
  return out;
}

export function displayName(u: { name: string | null; firstName?: string | null; email: string }): string {
  return u.firstName?.trim() || u.name?.trim() || u.email.split("@")[0];
}
