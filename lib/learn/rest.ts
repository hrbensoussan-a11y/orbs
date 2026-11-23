// Jours de repos (Réglages → Apprentissage).
//
// L'élève choisit les jours de la semaine où il se repose. Ces jours-là :
//   - l'objectif quotidien de révision n'est pas imposé (pas d'échec) ;
//   - la série (streak) ne se casse pas : un jour de repos sans révision
//     n'interrompt pas les jours d'affilée ; réviser quand même compte en
//     bonus ;
//   - le rappel « cartes à réviser » de l'accueil se fait discret.
//
// Mêmes numéros de jour que l'agenda : 0 = lundi … 6 = dimanche. Au plus six
// jours de repos : il reste toujours au moins un jour pour avancer.
//
// Module pur (aucun stockage) : utilisé par la progression Apprendre, par les
// Réglages et, côté serveur, par l'espace famille (série « vivante »).

export const MAX_REST_DAYS = 6;

export const WEEKDAYS = [
  { id: 0, short: "Lun", long: "Lundi" },
  { id: 1, short: "Mar", long: "Mardi" },
  { id: 2, short: "Mer", long: "Mercredi" },
  { id: 3, short: "Jeu", long: "Jeudi" },
  { id: 4, short: "Ven", long: "Vendredi" },
  { id: 5, short: "Sam", long: "Samedi" },
  { id: 6, short: "Dim", long: "Dimanche" },
] as const;

/** 0 = lundi … 6 = dimanche (getDay() part du dimanche). */
export function weekdayIndex(d: Date): number {
  return (d.getDay() + 6) % 7;
}

/** Jours valides, sans doublon, triés ; au plus MAX_REST_DAYS. */
export function sanitizeRestDays(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  const days = new Set<number>();
  for (const v of value) {
    if (typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= 6) days.add(v);
  }
  return [...days].sort((a, b) => a - b).slice(0, MAX_REST_DAYS);
}

export function isRestDay(restDays: readonly number[], d: Date = new Date()): boolean {
  return restDays.includes(weekdayIndex(d));
}

/** « AAAA-MM-JJ » → date locale à midi (à l'abri des changements d'heure). */
function parseDayKey(key: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0, 0);
  return Number.isNaN(d.getTime()) ? null : d;
}

function dayKeyOf(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

/**
 * Vrai si une série dont le dernier jour actif est `lastDay` se poursuit
 * `today` : tous les jours ENTRE les deux (exclus) sont des jours de repos.
 * Sans jour de repos, c'est la règle habituelle : `lastDay` est hier.
 */
export function streakContinues(lastDay: string, today: Date, restDays: readonly number[]): boolean {
  const last = parseDayKey(lastDay);
  if (!last) return false;
  const todayKey = dayKeyOf(today);
  if (lastDay >= todayKey) return false;
  const cursor = new Date(last);
  // Au plus une semaine à parcourir : sur sept jours d'affilée, au moins un
  // n'est pas un jour de repos (MAX_REST_DAYS = 6).
  for (let i = 0; i < 8; i++) {
    cursor.setDate(cursor.getDate() + 1);
    if (dayKeyOf(cursor) >= todayKey) return true;
    if (!restDays.includes(weekdayIndex(cursor))) return false;
  }
  return false;
}

/**
 * Série « vivante » à l'instant `now` : actif aujourd'hui, ou série qui peut
 * encore se poursuivre aujourd'hui (seulement des jours de repos depuis).
 */
export function isStreakAlive(lastDay: string, now: Date, restDays: readonly number[]): boolean {
  return lastDay === dayKeyOf(now) || streakContinues(lastDay, now, restDays);
}
