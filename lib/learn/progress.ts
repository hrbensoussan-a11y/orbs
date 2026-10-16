// Progression / motivation (spec §7).
import type { State, Stats } from "./types";
import { mastery } from "./sm2";

export const XP = { correct: 10, attempt: 3, focus: 25 };

export function dateKey(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function yesterdayKey(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return dateKey(d);
}

/** XP cumulée nécessaire pour atteindre le début du niveau L (L≥1). */
export function xpForLevel(L: number): number {
  return 50 * (L - 1) * L; // niveau 1: 0, 2: 100, 3: 300, 4: 600…
}
export function levelFromXp(xp: number): number {
  let L = 1;
  while (xpForLevel(L + 1) <= xp) L += 1;
  return L;
}
/** Progression 0..1 dans le niveau courant. */
export function levelProgress(xp: number): number {
  const L = levelFromXp(xp);
  const lo = xpForLevel(L);
  const hi = xpForLevel(L + 1);
  return hi > lo ? (xp - lo) / (hi - lo) : 0;
}

function touchDay(stats: Stats): void {
  const today = dateKey();
  if (stats.lastDay !== today) {
    stats.streak = stats.lastDay === yesterdayKey() ? stats.streak + 1 : 1;
    stats.lastDay = today;
  }
  stats.journal[today] = (stats.journal[today] || 0) + 1;
}

/** Récompense une action d'étude. Renvoie l'ancien niveau si montée de niveau. */
export function award(
  state: State,
  kind: "correct" | "attempt" | "focus",
): { leveledFrom: number | null } {
  const before = levelFromXp(state.stats.xp);
  state.stats.xp += XP[kind];
  if (kind !== "focus") state.stats.reviews += 1;
  touchDay(state.stats);
  const after = levelFromXp(state.stats.xp);
  return { leveledFrom: after > before ? before : null };
}

export function dailyProgress(state: State): number {
  return state.stats.journal[dateKey()] || 0;
}
export function goalReached(state: State): boolean {
  return dailyProgress(state) >= state.settings.dailyGoal;
}
export function activeDays(stats: Stats): number {
  return Object.keys(stats.journal).length;
}
export function bestDay(stats: Stats): number {
  return Object.values(stats.journal).reduce((m, v) => Math.max(m, v), 0);
}

export function masteredCount(state: State): number {
  let n = 0;
  for (const id in state.decks)
    for (const c of state.decks[id].cards) if (mastery(c) === "mastered") n += 1;
  return n;
}

type Badge = { id: string; label: string; ok: (s: State) => boolean };
export const BADGES: Badge[] = [
  { id: "first-deck", label: "Premier paquet", ok: (s) => Object.keys(s.decks).length >= 1 },
  { id: "streak-3", label: "3 jours d'affilée", ok: (s) => s.stats.streak >= 3 },
  { id: "streak-7", label: "7 jours d'affilée", ok: (s) => s.stats.streak >= 7 },
  { id: "streak-30", label: "30 jours d'affilée", ok: (s) => s.stats.streak >= 30 },
  { id: "goal", label: "Objectif atteint", ok: (s) => goalReached(s) },
  { id: "mastered-20", label: "20 cartes maîtrisées", ok: (s) => masteredCount(s) >= 20 },
  { id: "focus-5", label: "5 concentrations", ok: (s) => s.stats.focus >= 5 },
];

/** Ajoute les badges nouvellement obtenus et renvoie leurs libellés. */
export function recomputeBadges(state: State): string[] {
  const earned = new Set(state.stats.badges);
  const fresh: string[] = [];
  for (const b of BADGES) {
    if (!earned.has(b.id) && b.ok(state)) {
      state.stats.badges.push(b.id);
      earned.add(b.id);
      fresh.push(b.label);
    }
  }
  return fresh;
}
