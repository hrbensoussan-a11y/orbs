// Sauvegarde & portabilité (spec §9). Tout est local ; rien ne sort sauf
// export/partage explicite.
import type { Deck, Kind, State } from "./types";
import { KIND_META } from "./types";
import { heal, newCard, uid } from "./store";

function toB64(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function fromB64(s: string): string {
  const norm = s.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(norm);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

// ---- Partage d'un paquet (chaîne URL-safe) ----
export function encodeDeckShare(deck: Deck): string {
  const payload = {
    n: deck.name,
    s: deck.subject,
    k: deck.kind,
    p: deck.cards.map((c) => [c.t, c.d]),
  };
  return toB64(JSON.stringify(payload));
}

export function decodeDeckShare(code: string):
  | { name: string; subject: string; kind: Kind; pairs: { t: string; d: string }[] }
  | null {
  try {
    const o = JSON.parse(fromB64(code.trim()));
    const kind: Kind = o.k in KIND_META ? o.k : "definitions";
    const pairs = Array.isArray(o.p)
      ? o.p.map((x: unknown[]) => ({ t: String(x[0] ?? ""), d: String(x[1] ?? "") }))
      : [];
    return { name: String(o.n ?? "Paquet"), subject: String(o.s ?? "Autre"), kind, pairs };
  } catch {
    return null;
  }
}

// ---- Export / import complet ----
export function exportJSON(state: State): string {
  return JSON.stringify(state, null, 2);
}

/** Fusionne un export (complet ou d'un seul paquet) dans l'état courant,
 *  sans écraser : nouveaux ids, journal fusionné par max. Renvoie le nombre
 *  de paquets ajoutés. */
export function importJSON(state: State, text: string): number {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return 0;
  }
  const incoming = data as Partial<State> & { cards?: unknown; kind?: Kind };
  let decksToAdd: Deck[] = [];

  if (incoming && incoming.decks && typeof incoming.decks === "object") {
    const healed = heal(incoming);
    decksToAdd = Object.values(healed.decks);
    // journal fusionné (max par jour)
    for (const day of Object.keys(healed.stats.journal)) {
      state.stats.journal[day] = Math.max(
        state.stats.journal[day] || 0,
        healed.stats.journal[day],
      );
    }
  } else if (incoming && Array.isArray(incoming.cards)) {
    const healed = heal({ decks: { tmp: incoming } });
    decksToAdd = Object.values(healed.decks);
  }

  let added = 0;
  for (const deck of decksToAdd) {
    const id = uid("d");
    state.decks[id] = { ...deck, id, fav: false, updated: Date.now() };
    added += 1;
  }
  return added;
}

/** Crée un paquet à partir d'un code de partage décodé. */
export function deckFromShare(
  state: State,
  share: { name: string; subject: string; kind: Kind; pairs: { t: string; d: string }[] },
): Deck {
  const deck: Deck = {
    id: uid("d"),
    name: share.name,
    subject: share.subject,
    fav: false,
    created: Date.now(),
    updated: Date.now(),
    kind: share.kind,
    cards: share.pairs.map((p) => newCard(p.t, p.d)),
  };
  state.decks[deck.id] = deck;
  return deck;
}
