// Planificateur : répétition espacée SM-2 (spec §3).
//
// Intensité des révisions (Réglages → Apprentissage) : elle agit sur la DATE
// réelle de la prochaine révision, pas sur la mesure SM-2 elle-même.
//   - `card.iv` reste l'intervalle SM-2 standard (ce que l'élève sait) : la
//     progression (maîtrise), les XP et les séries n'en dépendent donc pas ;
//   - `card.due` = maintenant + spacedDays(iv, intensité) : plus espacé en
//     « Légère », identique en « Équilibrée » (défaut), plus rapproché en
//     « Intensive ». Les erreurs (q < 3) restent revues tout de suite.
import type { Card, Deck, Intensity } from "./types";

const DAY = 86_400_000;
const MIN = 60_000;

export const DEFAULT_INTENSITY: Intensity = "balanced";
const INTENSITY_IDS: readonly string[] = ["light", "balanced", "intensive"];

/** Garde-type : une intensité connue, sinon « Équilibrée ». */
export function toIntensity(value: unknown): Intensity {
  return typeof value === "string" && INTENSITY_IDS.includes(value) ? (value as Intensity) : DEFAULT_INTENSITY;
}

/**
 * Jours à attendre avant la prochaine révision, pour un intervalle SM-2 `iv`.
 * L'ordre Légère > Équilibrée > Intensive est garanti pour tout intervalle
 * (même 1 jour : 2 j / 1 j / 12 h).
 */
export function spacedDays(iv: number, intensity: Intensity = DEFAULT_INTENSITY): number {
  if (intensity === "light") return Math.max(iv + 1, Math.round(iv * 1.5));
  if (intensity === "intensive") return iv <= 1 ? 0.5 : Math.max(1, Math.min(iv - 1, Math.round(iv * 0.6)));
  return iv;
}

/** Intervalle (jours) pour la prochaine révision, selon la qualité q (3..5). */
export function nextInterval(card: Card, q: number): number {
  let iv: number;
  if (card.reps === 0) iv = q === 3 ? 1 : q === 4 ? 2 : 4;
  else if (card.reps === 1) iv = q === 3 ? 4 : q === 4 ? 6 : 10;
  else iv = q === 3 ? card.iv * 1.25 : q === 4 ? card.iv * card.ef : card.iv * card.ef * 1.3;
  return Math.max(1, Math.round(iv));
}

/** Applique une note q (1,3,4,5) à une carte (mutation planifiée, renvoie la carte). */
export function grade(card: Card, q: number, intensity: Intensity = DEFAULT_INTENSITY): Card {
  const now = Date.now();
  if (q < 3) {
    card.reps = 0;
    card.iv = 0;
    card.lapses += 1;
    card.due = now + 1 * MIN;
  } else {
    card.iv = nextInterval(card, q);
    card.reps += 1;
    card.due = now + spacedDays(card.iv, intensity) * DAY;
  }
  card.ef = Math.max(1.3, card.ef + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02)));
  return card;
}

/** Prévisualise le délai (jours, peut être 0,5) pour une note q, sans rien modifier. */
export function previewInterval(card: Card, q: number, intensity: Intensity = DEFAULT_INTENSITY): number {
  if (q < 3) return 0;
  return spacedDays(nextInterval(card, q), intensity);
}

/** Libellé court du délai : « < 1 j », « 12 h », « 1 j », « 6 j ». */
export function delayLabel(card: Card, q: number, intensity: Intensity = DEFAULT_INTENSITY): string {
  if (q < 3) return "< 1 j";
  const d = previewInterval(card, q, intensity);
  if (d < 1) return `${Math.round(d * 24)} h`;
  return `${d} j`;
}

export function isDue(card: Card, at: number = Date.now()): boolean {
  return card.due <= at; // carte neuve (due=0) => due tout de suite
}

/** Cartes dues d'un paquet, mélangées. */
export function dueCards(deck: Deck, at: number = Date.now()): Card[] {
  return shuffle(deck.cards.filter((c) => isDue(c, at)));
}

/** File globale : dues de tous les paquets question→réponse, triées par échéance. */
export function globalQueue(
  decks: Deck[],
  at: number = Date.now(),
): { card: Card; deck: Deck }[] {
  const items: { card: Card; deck: Deck }[] = [];
  for (const deck of decks) {
    if (deck.kind !== "definitions" && deck.kind !== "questions") continue;
    for (const card of deck.cards) if (isDue(card, at)) items.push({ card, deck });
  }
  items.sort((a, b) => a.card.due - b.card.due);
  return items;
}

export type Mastery = "new" | "learning" | "mastered";
export function mastery(card: Card): Mastery {
  if (card.reps === 0) return "new";
  if (card.reps < 3 || card.iv < 7) return "learning";
  return "mastered";
}

/** Progression d'un paquet : (maîtrisées + 0,4×en cours) / total. */
export function deckProgress(deck: Deck): number {
  if (!deck.cards.length) return 0;
  let m = 0;
  for (const c of deck.cards) {
    const s = mastery(c);
    if (s === "mastered") m += 1;
    else if (s === "learning") m += 0.4;
  }
  return m / deck.cards.length;
}

export function dueCount(deck: Deck, at: number = Date.now()): number {
  return deck.cards.filter((c) => isDue(c, at)).length;
}

export function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
