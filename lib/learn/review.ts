// Révision du jour — file entrelacée inter-paquets (interleaving).
// L'alternance des matières dans une même session est l'une des méthodes
// d'étude les mieux étayées (Dunlosky 2013). On rassemble les cartes dues de
// TOUS les paquets (tous types) puis on les tisse pour éviter, autant que
// possible, deux cartes du même paquet à la suite.
import type { Card, Deck, State } from "./types";
import { isDue, shuffle } from "./sm2";

export type ReviewItem = { card: Card; deck: Deck };

/** Cartes dues de tous les paquets, entrelacées par matière/paquet. */
export function interleavedDue(state: State, at: number = Date.now()): ReviewItem[] {
  const buckets: ReviewItem[][] = [];
  for (const deck of Object.values(state.decks)) {
    const due = deck.cards.filter((c) => isDue(c, at));
    if (due.length) buckets.push(shuffle(due).map((card) => ({ card, deck })));
  }
  return weave(buckets);
}

/** Nombre total de cartes dues (tous paquets). */
export function dueTotal(state: State, at: number = Date.now()): number {
  let n = 0;
  for (const deck of Object.values(state.decks))
    for (const c of deck.cards) if (isDue(c, at)) n += 1;
  return n;
}

/** Tissage : à chaque tour, le paquet qui a le plus de cartes restantes, en
 *  évitant le paquet précédent tant qu'un autre est disponible. */
function weave(buckets: ReviewItem[][]): ReviewItem[] {
  const lists = buckets.map((b) => b.slice());
  const out: ReviewItem[] = [];
  let prev: Deck | null = null;
  let remaining = lists.reduce((n, l) => n + l.length, 0);

  while (remaining > 0) {
    let pick = -1;
    for (let i = 0; i < lists.length; i++) {
      if (!lists[i].length) continue;
      // saute le paquet précédent s'il existe une autre source non vide
      if (lists[i][0].deck === prev && otherAvailable(lists, i)) continue;
      if (pick < 0 || lists[i].length > lists[pick].length) pick = i;
    }
    if (pick < 0) break; // sécurité
    const item = lists[pick].shift() as ReviewItem;
    out.push(item);
    prev = item.deck;
    remaining -= 1;
  }
  return out;
}

function otherAvailable(lists: ReviewItem[][], skip: number): boolean {
  for (let i = 0; i < lists.length; i++)
    if (i !== skip && lists[i].length) return true;
  return false;
}
