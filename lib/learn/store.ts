// Persistance locale (spec §1, §9) : une seule clé, sauvegarde à chaque
// mutation, « healing » au chargement. Aucun serveur.
import type { Card, Deck, Kind, State } from "./types";
import { KIND_META } from "./types";

export const STORAGE_KEY = "orbs.learn.v1";
const VERSION = 1;

export function defaultState(): State {
  return {
    version: VERSION,
    decks: {},
    settings: { dailyGoal: 20 },
    stats: {
      xp: 0,
      streak: 0,
      lastDay: "",
      reviews: 0,
      focus: 0,
      badges: [],
      journal: {},
    },
  };
}

export function uid(prefix = "id"): string {
  return prefix + "_" + Math.random().toString(36).slice(2, 10);
}

export function newCard(t: string, d: string): Card {
  return { id: uid("c"), t, d, ef: 2.5, iv: 0, reps: 0, due: 0, lapses: 0 };
}

function healCard(raw: unknown): Card {
  const c = (raw ?? {}) as Partial<Card>;
  return {
    id: typeof c.id === "string" ? c.id : uid("c"),
    t: typeof c.t === "string" ? c.t : "",
    d: typeof c.d === "string" ? c.d : "",
    ef: num(c.ef, 2.5),
    iv: num(c.iv, 0),
    reps: num(c.reps, 0),
    due: num(c.due, 0),
    lapses: num(c.lapses, 0),
  };
}
function num(v: unknown, def: number): number {
  return typeof v === "number" && Number.isFinite(v) ? v : def;
}

function healDeck(raw: unknown): Deck | null {
  const d = (raw ?? {}) as Partial<Deck>;
  if (typeof d.id !== "string") return null;
  const kind: Kind = d.kind && d.kind in KIND_META ? d.kind : "definitions";
  return {
    id: d.id,
    name: typeof d.name === "string" ? d.name : "Sans titre",
    subject: typeof d.subject === "string" ? d.subject : "Autre",
    fav: !!d.fav,
    created: num(d.created, Date.now()),
    updated: num(d.updated, Date.now()),
    kind,
    cards: Array.isArray(d.cards) ? d.cards.map(healCard) : [],
  };
}

export function heal(raw: unknown): State {
  try {
    const s = (raw ?? {}) as Partial<State>;
    const base = defaultState();
    const decks: Record<string, Deck> = {};
    if (s.decks && typeof s.decks === "object") {
      for (const id of Object.keys(s.decks)) {
        const healed = healDeck((s.decks as Record<string, unknown>)[id]);
        if (healed) decks[healed.id] = healed;
      }
    }
    return {
      version: VERSION,
      decks,
      settings: {
        dailyGoal: num(s.settings?.dailyGoal, base.settings.dailyGoal),
      },
      stats: {
        xp: num(s.stats?.xp, 0),
        streak: num(s.stats?.streak, 0),
        lastDay: typeof s.stats?.lastDay === "string" ? s.stats.lastDay : "",
        reviews: num(s.stats?.reviews, 0),
        focus: num(s.stats?.focus, 0),
        badges: Array.isArray(s.stats?.badges) ? s.stats.badges.filter((b) => typeof b === "string") : [],
        journal:
          s.stats?.journal && typeof s.stats.journal === "object"
            ? sanitizeJournal(s.stats.journal)
            : {},
      },
    };
  } catch {
    return defaultState();
  }
}
function sanitizeJournal(j: Record<string, unknown>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const k of Object.keys(j)) if (typeof j[k] === "number") out[k] = j[k] as number;
  return out;
}

export function load(): State {
  if (typeof window === "undefined") return defaultState();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState();
    return heal(JSON.parse(raw));
  } catch {
    return defaultState();
  }
}

export function save(state: State): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // quota / mode privé : on ignore silencieusement
  }
}

// ---- Mutations de paquets (spec §2) ----

export function createDeck(
  state: State,
  name: string,
  subject: string,
  kind: Kind,
  pairs: { t: string; d: string }[],
): Deck {
  const deck: Deck = {
    id: uid("d"),
    name: name.trim() || "Sans titre",
    subject: subject || "Autre",
    fav: false,
    created: Date.now(),
    updated: Date.now(),
    kind,
    cards: pairs.map((p) => newCard(p.t, p.d)),
  };
  state.decks[deck.id] = deck;
  return deck;
}

/** Met à jour un paquet en conservant la planification des cartes dont le
 *  champ 1 (t) n'a pas changé (appariement par t). */
export function updateDeck(
  state: State,
  id: string,
  patch: { name?: string; subject?: string; pairs: { t: string; d: string }[] },
): void {
  const deck = state.decks[id];
  if (!deck) return;
  const byT = new Map<string, Card>();
  for (const c of deck.cards) if (!byT.has(c.t)) byT.set(c.t, c);
  deck.cards = patch.pairs.map((p) => {
    const prev = byT.get(p.t);
    if (prev) return { ...prev, d: p.d };
    return newCard(p.t, p.d);
  });
  if (patch.name !== undefined) deck.name = patch.name.trim() || "Sans titre";
  if (patch.subject !== undefined) deck.subject = patch.subject;
  deck.updated = Date.now();
}

export function deleteDeck(state: State, id: string): void {
  delete state.decks[id];
}

export function toggleFav(state: State, id: string): void {
  const deck = state.decks[id];
  if (deck) {
    deck.fav = !deck.fav;
    deck.updated = Date.now();
  }
}

/** Paquets triés : favoris d'abord, puis les plus récents. */
export function listDecks(state: State): Deck[] {
  return Object.values(state.decks).sort((a, b) => {
    if (a.fav !== b.fav) return a.fav ? -1 : 1;
    return b.updated - a.updated;
  });
}
