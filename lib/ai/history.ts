// Historique des conversations avec l'assistant — stockage LOCAL du compte.
//
// Une seule clé ("orbs.ai.v2") dans l'espace local du compte connecté
// (lib/userStorage), comme avant : discussions libres (`convs`) et une
// discussion par matière (`threads`). Ajouts pour la conservation
// (lib/ai/retention) :
//   - la date de dernière activité de chaque discussion (`updatedAt`,
//     `threadsAt`). Un historique plus ancien, sans date, reçoit la date du
//     jour à sa première lecture : rien n'est supprimé du seul fait de la
//     mise à jour ; le délai de 30 jours part de là ;
//   - la mémoire de visite (mode « ne pas conserver ») : en mémoire seulement,
//     perdue au rechargement ou à la fermeture.
// Le serveur ne reçoit jamais cet historique.

import type { ChatMessage } from "./types";
import { getActiveUser, readUserItem, writeUserItem } from "@/lib/userStorage";
import { isExpired, type AiRetention } from "./retention";

export const AI_STORE_KEY = "orbs.ai.v2";
/** Dernière demande « Supprimer l'historique » déjà appliquée sur cet appareil. */
export const AI_CLEARED_KEY = "orbs.ai.cleared";
/** Des discussions viennent d'être supprimées (détail : HistoryRemoval). */
export const AI_HISTORY_EVENT = "orbs:aihistory";

export type StoredConv = { id: string; title: string; messages: ChatMessage[]; updatedAt: number };
export type AiHistory = {
  threads: Record<string, ChatMessage[]>;
  threadsAt: Record<string, number>;
  convs: StoredConv[];
};
export type HistoryRemoval = { convs: string[]; threads: string[] };

export function emptyHistory(): AiHistory {
  return { threads: {}, threadsAt: {}, convs: [] };
}

function isMessage(m: unknown): m is ChatMessage {
  const o = m as ChatMessage | null;
  return !!o && (o.role === "user" || o.role === "assistant") && typeof o.content === "string";
}

const validTime = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v > 0;

/**
 * Lecture défensive. Les dates manquantes reçoivent `now` (`stamped` = vrai :
 * il faut alors les enregistrer pour que le délai ne reparte pas à chaque
 * lecture).
 */
export function parseHistory(raw: unknown, now: number): { history: AiHistory; stamped: boolean } {
  const o = (raw ?? {}) as { threads?: unknown; threadsAt?: unknown; convs?: unknown };
  const history = emptyHistory();
  let stamped = false;
  const at = (o.threadsAt && typeof o.threadsAt === "object" ? o.threadsAt : {}) as Record<string, unknown>;
  if (o.threads && typeof o.threads === "object") {
    for (const [subject, msgs] of Object.entries(o.threads as Record<string, unknown>)) {
      if (!Array.isArray(msgs)) continue;
      history.threads[subject] = msgs.filter(isMessage);
      if (validTime(at[subject])) history.threadsAt[subject] = at[subject];
      else {
        history.threadsAt[subject] = now;
        stamped = true;
      }
    }
  }
  if (Array.isArray(o.convs)) {
    for (const c of o.convs as Partial<StoredConv>[]) {
      if (!c || typeof c.id !== "string") continue;
      const updatedAt = validTime(c.updatedAt) ? c.updatedAt : now;
      if (!validTime(c.updatedAt)) stamped = true;
      history.convs.push({
        id: c.id,
        title: typeof c.title === "string" ? c.title : "",
        messages: Array.isArray(c.messages) ? c.messages.filter(isMessage) : [],
        updatedAt,
      });
    }
  }
  return { history, stamped };
}

/** Historique enregistré sur cet appareil (vide sans compte actif). */
export function loadHistory(now: number = Date.now()): AiHistory {
  try {
    const raw = readUserItem(AI_STORE_KEY);
    if (!raw) return emptyHistory();
    const { history, stamped } = parseHistory(JSON.parse(raw), now);
    if (stamped) saveHistory(history);
    return history;
  } catch {
    return emptyHistory();
  }
}

export function saveHistory(h: AiHistory): void {
  try {
    writeUserItem(AI_STORE_KEY, JSON.stringify({ version: 4, threads: h.threads, threadsAt: h.threadsAt, convs: h.convs }));
  } catch {
    /* quota plein / mode privé */
  }
}

/**
 * Mode « ne pas conserver » : seules les SUPPRESSIONS sont enregistrées.
 * L'historique déjà présent garde sa version enregistrée (une discussion
 * ancienne poursuivie n'y est pas complétée) ; ce que l'élève a supprimé ou
 * vidé disparaît. Rien de nouveau n'est écrit.
 */
export function persistDeletionsOnly(current: AiHistory): void {
  const stored = loadHistory();
  const keep = new Set(current.convs.map((c) => c.id));
  const next: AiHistory = { threads: {}, threadsAt: {}, convs: stored.convs.filter((c) => keep.has(c.id)) };
  for (const [subject, msgs] of Object.entries(stored.threads)) {
    if ((current.threads[subject] ?? []).length > 0) {
      next.threads[subject] = msgs;
      next.threadsAt[subject] = stored.threadsAt[subject];
    }
  }
  const changed =
    next.convs.length !== stored.convs.length ||
    Object.keys(next.threads).length !== Object.keys(stored.threads).length;
  if (changed) saveHistory(next);
}

/** Applique la règle de conservation à un historique (fonction pure). */
export function applyRetention(
  h: AiHistory,
  retention: AiRetention,
  now: number,
  wipeAll = false,
): { history: AiHistory; removed: HistoryRemoval } {
  const removed: HistoryRemoval = { convs: [], threads: [] };
  const history: AiHistory = { threads: {}, threadsAt: {}, convs: [] };
  for (const c of h.convs) {
    if (wipeAll || isExpired(c.updatedAt, retention, now)) removed.convs.push(c.id);
    else history.convs.push(c);
  }
  for (const [subject, msgs] of Object.entries(h.threads)) {
    const at = h.threadsAt[subject] ?? now;
    if (wipeAll || isExpired(at, retention, now)) removed.threads.push(subject);
    else {
      history.threads[subject] = msgs;
      history.threadsAt[subject] = at;
    }
  }
  return { history, removed };
}

/**
 * Applique, sur cet appareil, la règle du compte : suppression après 30 jours
 * sans activité, et « Supprimer l'historique » demandé (une fois par demande).
 * Prévient l'assistant ouvert pour qu'il retire aussi ces discussions.
 */
export function enforceRetention(
  retention: AiRetention,
  clearedAt: number | null,
  now: number = Date.now(),
): HistoryRemoval {
  const none: HistoryRemoval = { convs: [], threads: [] };
  if (!getActiveUser()) return none;
  let wipeAll = false;
  if (clearedAt) {
    // Seule une demande PLUS RÉCENTE que la dernière appliquée efface : une
    // valeur périmée (onglet resté ouvert, page en cache) ne doit jamais
    // relancer un effacement qui emporterait les discussions créées depuis.
    // Les deux dates viennent du serveur : aucune horloge d'appareil n'entre
    // en jeu.
    const applied = Number(readUserItem(AI_CLEARED_KEY) ?? "0") || 0;
    if (clearedAt > applied) {
      wipeAll = true;
      try {
        writeUserItem(AI_CLEARED_KEY, String(clearedAt));
      } catch {
        /* ignore */
      }
    }
  }
  const stored = loadHistory(now);
  const { history, removed } = applyRetention(stored, retention, now, wipeAll);
  if (removed.convs.length || removed.threads.length) {
    saveHistory(history);
    dropFromVisit(removed);
    try {
      window.dispatchEvent(new CustomEvent<HistoryRemoval>(AI_HISTORY_EVENT, { detail: removed }));
    } catch {
      /* hors navigateur */
    }
  }
  if (wipeAll) forgetVisit();
  return removed;
}

/** Nombre de discussions qui seraient supprimées tout de suite avec cette règle. */
export function countExpiring(retention: AiRetention, now: number = Date.now()): number {
  const { removed } = applyRetention(loadHistory(now), retention, now);
  return removed.convs.length + removed.threads.length;
}

// ---- Mémoire de la visite (mode « ne pas conserver ») ----
// En mémoire du navigateur seulement : garde la discussion en cours quand on
// change de page dans Orbs, disparaît au rechargement ou à la fermeture.

let visit: { user: string; history: AiHistory } | null = null;

export function rememberVisit(h: AiHistory): void {
  const user = getActiveUser();
  visit = user ? { user, history: h } : null;
}

export function recallVisit(): AiHistory | null {
  const user = getActiveUser();
  return visit && user && visit.user === user ? visit.history : null;
}

export function forgetVisit(): void {
  visit = null;
}

/** Les discussions supprimées par la règle ne reviennent pas par la mémoire de visite. */
function dropFromVisit(removed: HistoryRemoval): void {
  if (!visit) return;
  const h = visit.history;
  const threads = { ...h.threads };
  const threadsAt = { ...h.threadsAt };
  for (const s of removed.threads) {
    delete threads[s];
    delete threadsAt[s];
  }
  visit = { user: visit.user, history: { threads, threadsAt, convs: h.convs.filter((c) => !removed.convs.includes(c.id)) } };
}
