// Anciennes données locales, d'avant le cloisonnement par compte.
//
// Jusqu'ici Orbs rangeait tout sous des clés globales à l'appareil. Ces
// données n'ont aucun propriétaire connu : sur un appareil partagé, elles
// peuvent même mêler plusieurs comptes. Elles sont donc en QUARANTAINE :
//   - plus aucun code ne les lit pour les afficher (voir lib/userStorage) ;
//   - rien ne les efface ;
//   - elles ne rejoignent un compte que dans deux cas, décidés avec le
//     produit :
//       1. CONTINUITÉ — l'élève était déjà connecté au moment de la mise à
//          jour (sa session date d'avant) : ces données sont celles qu'il
//          voyait déjà, elles le suivent sans rien lui demander ;
//       2. CONFIRMATION — dans tous les autres cas, l'élève répond « oui »
//          à la question « ces données sont-elles à toi ? »
//          (components/LegacyDataPrompt).
//     Jamais d'office pour le premier compte qui se connecte.
//
// Le rattachement DÉPLACE chaque clé vers l'espace du compte. Si le compte a
// déjà des données au même endroit, on fusionne sans rien perdre.

import { heal as healAgenda } from "@/lib/agenda/store";
import { heal as healGrades } from "@/lib/grades/store";
import { heal as healLearn } from "@/lib/learn/store";
import { getActiveUser, isValidUserId, readUserItem, userKey, writeUserItem } from "@/lib/userStorage";

/** Les clés globales qu'utilisait Orbs avant le cloisonnement. */
export const LEGACY_KEYS = [
  "orbs.agenda.v1", // devoirs et emploi du temps
  "orbs.agenda.notif.v1", // réglages des rappels
  "orbs.agenda.notif.fired.v1", // rappels déjà déclenchés aujourd'hui
  "orbs.grades.v1", // notes
  "orbs.learn.v1", // paquets, cartes, progression
  "orbs.learn.ui", // tri et dossiers repliés
  "orbs.focus", // minuteur de concentration
  "orbs.ai.v2", // conversations IA
  "orbs.ai.panel", // colonne « Discussions » repliée
  "orbs.ai.voice", // voix de l'assistant
  "orbs.ai.voiceplay", // lecture automatique des réponses
  "orbs.ai.mode", // mode de réflexion
  "orbs.ai.tags", // déclencheur et tags favoris
  "orbs.aiorb.pos", // position de la bulle IA
  "orbs.aiorb.prefs", // réglages de la bulle IA
  "orbs.subjectColors", // couleurs des matières
  "orbs:draft:new", // brouillon du journal non enregistré
  "orbs.appearance", // thème, fond, luminosité
  "orbs.motion", // animations réduites
] as const;

export type LegacyKey = (typeof LEGACY_KEYS)[number];

/**
 * État des anciennes données sur l'appareil :
 *   - absent      : cette version ne les a pas encore examinées ;
 *   - "orphan"    : personne n'était connecté à la mise à jour → confirmation ;
 *   - "owner:<id>": attribuées à ce compte ; le déplacement reprend à sa
 *                   prochaine visite s'il n'a pas pu être terminé.
 */
export const LEGACY_STATUS_KEY = "orbs.device.legacy";

/** Dans l'espace du compte : il a répondu « non, ce n'est pas à moi ». */
export const LEGACY_DECLINED_KEY = "orbs.legacy.declined";

/**
 * Ce qu'une page a le droit de faire des anciennes données :
 *   - "continuity" : session antérieure à la mise à jour → rattachement direct ;
 *   - "ask"        : rattachement seulement sur confirmation ;
 *   - "ignore"     : compte qui n'a pas de données locales (espace parent).
 */
export type LegacyMode = "continuity" | "ask" | "ignore";

export type LegacyStatus =
  | { kind: "none" }
  | { kind: "orphan" }
  | { kind: "owner"; userId: string };

function storage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

/** Anciennes clés encore présentes sur l'appareil (non rattachées). */
export function legacyKeysPresent(): LegacyKey[] {
  const s = storage();
  if (!s) return [];
  return LEGACY_KEYS.filter((k) => {
    try {
      return s.getItem(k) !== null;
    } catch {
      return false;
    }
  });
}

export function readLegacyStatus(): LegacyStatus {
  try {
    const raw = storage()?.getItem(LEGACY_STATUS_KEY) ?? null;
    if (raw === "orphan") return { kind: "orphan" };
    if (raw?.startsWith("owner:")) {
      const userId = raw.slice("owner:".length);
      // Statut illisible : on retombe sur le cas le plus prudent.
      return isValidUserId(userId) ? { kind: "owner", userId } : { kind: "orphan" };
    }
    return raw === null ? { kind: "none" } : { kind: "orphan" };
  } catch {
    return { kind: "orphan" };
  }
}

/** Écrit le statut et vérifie qu'il a bien été enregistré. */
function writeLegacyStatus(value: string): boolean {
  const s = storage();
  if (!s) return false;
  try {
    s.setItem(LEGACY_STATUS_KEY, value);
    return s.getItem(LEGACY_STATUS_KEY) === value;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Décision au chargement d'une page
// ---------------------------------------------------------------------------

/**
 * À appeler au tout début du rendu d'une page, AVANT que les composants ne
 * lisent leurs données. Décide une fois pour toutes du sort des anciennes
 * données de l'appareil, puis ne fait plus rien (idempotent).
 */
export function resolveLegacy(userId: string | null, mode: LegacyMode): void {
  if (mode === "ignore" || !storage()) return;
  if (legacyKeysPresent().length === 0) return;

  const status = readLegacyStatus();
  if (status.kind === "none") {
    if (isValidUserId(userId) && mode === "continuity") {
      // On note d'abord à qui elles vont : si le déplacement est interrompu,
      // il reprendra pour ce compte et ne sera proposé à personne d'autre.
      if (writeLegacyStatus(`owner:${userId}`)) claimLegacy(userId);
    } else {
      writeLegacyStatus("orphan");
    }
    return;
  }
  // Reprise d'un déplacement inachevé (stockage plein la fois précédente).
  if (status.kind === "owner" && status.userId === userId) claimLegacy(userId);
}

// ---------------------------------------------------------------------------
// Rattachement à un compte
// ---------------------------------------------------------------------------

export type ClaimResult = { moved: LegacyKey[]; left: LegacyKey[] };

/**
 * Déplace les anciennes données dans l'espace du compte. Ne perd rien : une
 * clé qui ne peut pas être écrite (stockage plein) reste où elle est, et le
 * statut retient à qui elle appartient pour réessayer plus tard.
 */
export function claimLegacy(userId: string): ClaimResult {
  const result: ClaimResult = { moved: [], left: [] };
  const s = storage();
  if (!s || !isValidUserId(userId)) return result;

  for (const key of legacyKeysPresent()) {
    const legacy = s.getItem(key);
    if (legacy === null) continue;
    const target = userKey(userId, key);
    const current = s.getItem(target);
    const next = current === null ? legacy : mergeLegacy(key, legacy, current);
    let done: boolean;
    if (next === current) {
      // Déjà couverte par ce que le compte possède : l'ancienne n'a plus d'usage.
      s.removeItem(key);
      done = true;
    } else {
      done = moveInto(s, key, target, next);
    }
    (done ? result.moved : result.left).push(key);
  }

  if (result.left.length === 0) s.removeItem(LEGACY_STATUS_KEY);
  else writeLegacyStatus(`owner:${userId}`);
  return result;
}

/**
 * Écrit `next` dans la clé du compte puis retire l'ancienne. L'ancienne n'est
 * JAMAIS supprimée avant que la copie soit en place : si l'écriture échoue
 * (stockage plein, mode privé), la donnée reste où elle était et le
 * déplacement sera retenté à une prochaine visite.
 */
function moveInto(s: Storage, key: string, target: string, next: string): boolean {
  try {
    s.setItem(target, next);
    s.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Fusion quand le compte a déjà des données au même endroit
// ---------------------------------------------------------------------------

function parse(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function byId<T extends { id: string }>(current: T[], legacy: T[]): T[] {
  const seen = new Set(current.map((x) => x.id));
  return [...current, ...legacy.filter((x) => !seen.has(x.id))];
}

/**
 * Réunit une ancienne donnée et celle que le compte possède déjà. Les
 * contenus (devoirs, notes, paquets, conversations, brouillon) sont
 * additionnés ; pour un simple réglage, celui du compte l'emporte.
 */
export function mergeLegacy(key: LegacyKey, legacyRaw: string, currentRaw: string): string {
  switch (key) {
    case "orbs.agenda.v1": {
      const cur = healAgenda(parse(currentRaw));
      const old = healAgenda(parse(legacyRaw));
      return JSON.stringify({
        ...cur,
        homework: byId(cur.homework, old.homework),
        courses: byId(cur.courses, old.courses),
      });
    }
    case "orbs.grades.v1": {
      const cur = healGrades(parse(currentRaw));
      const old = healGrades(parse(legacyRaw));
      return JSON.stringify({ ...cur, grades: byId(cur.grades, old.grades) });
    }
    case "orbs.learn.v1": {
      const cur = healLearn(parse(currentRaw));
      const old = healLearn(parse(legacyRaw));
      const decks = { ...old.decks };
      for (const deck of Object.values(cur.decks)) {
        const twin = decks[deck.id];
        if (!twin || deck.updated >= twin.updated) decks[deck.id] = deck;
      }
      // Deux périodes d'activité distinctes : les compteurs s'additionnent.
      const journal = { ...old.stats.journal };
      for (const [day, n] of Object.entries(cur.stats.journal)) journal[day] = (journal[day] ?? 0) + n;
      return JSON.stringify({
        ...cur,
        decks,
        stats: {
          xp: cur.stats.xp + old.stats.xp,
          streak: Math.max(cur.stats.streak, old.stats.streak),
          lastDay: cur.stats.lastDay > old.stats.lastDay ? cur.stats.lastDay : old.stats.lastDay,
          reviews: cur.stats.reviews + old.stats.reviews,
          focus: cur.stats.focus + old.stats.focus,
          badges: [...new Set([...cur.stats.badges, ...old.stats.badges])],
          journal,
        },
      });
    }
    case "orbs.ai.v2": {
      const cur = aiStore(parse(currentRaw));
      const old = aiStore(parse(legacyRaw));
      const threads: Record<string, unknown[]> = { ...old.threads };
      for (const [subject, messages] of Object.entries(cur.threads))
        threads[subject] = [...(old.threads[subject] ?? []), ...messages];
      return JSON.stringify({ version: 3, threads, convs: byId(cur.convs, old.convs) });
    }
    case "orbs:draft:new": {
      const cur = draft(parse(currentRaw));
      const old = draft(parse(legacyRaw));
      if (!cur.content.trim()) return JSON.stringify(old);
      if (!old.content.trim() || old.content === cur.content) return currentRaw;
      return JSON.stringify({
        title: cur.title || old.title,
        content: `${cur.content}\n\n${old.content}`,
      });
    }
    case "orbs.subjectColors": {
      const cur = parse(currentRaw);
      const old = parse(legacyRaw);
      const obj = (v: unknown) => (v && typeof v === "object" && !Array.isArray(v) ? v : {});
      return JSON.stringify({ ...obj(old), ...obj(cur) });
    }
    default:
      return currentRaw; // réglage : celui que le compte a déjà choisi
  }
}

type AiConv = { id: string; title?: unknown; messages?: unknown };

function aiStore(raw: unknown): { threads: Record<string, unknown[]>; convs: AiConv[] } {
  const o = (raw ?? {}) as { threads?: unknown; convs?: unknown };
  const threads: Record<string, unknown[]> = {};
  if (o.threads && typeof o.threads === "object")
    for (const [k, v] of Object.entries(o.threads as Record<string, unknown>))
      if (Array.isArray(v)) threads[k] = v;
  const convs = Array.isArray(o.convs)
    ? o.convs.filter((c): c is AiConv => !!c && typeof c === "object" && typeof (c as AiConv).id === "string")
    : [];
  return { threads, convs };
}

function draft(raw: unknown): { title: string; content: string } {
  const o = (raw ?? {}) as { title?: unknown; content?: unknown };
  return {
    title: typeof o.title === "string" ? o.title : "",
    content: typeof o.content === "string" ? o.content : "",
  };
}

// ---------------------------------------------------------------------------
// Question posée à l'élève
// ---------------------------------------------------------------------------

const plural = (n: number, one: string, many: string) => `${n} ${n > 1 ? many : one}`;

/**
 * Ce que contiennent les anciennes données, en clair et SANS aucun contenu :
 * uniquement des quantités (« 3 devoirs »), puisque la question peut être
 * posée à quelqu'un à qui elles n'appartiennent pas. Vide s'il n'y a que des
 * réglages : rien qui vaille une question.
 */
export function describeLegacy(): string[] {
  const s = storage();
  if (!s) return [];
  const read = (key: LegacyKey) => {
    try {
      const raw = s.getItem(key);
      return raw === null ? null : parse(raw);
    } catch {
      return null;
    }
  };
  const out: string[] = [];

  const agenda = read("orbs.agenda.v1");
  if (agenda) {
    const a = healAgenda(agenda);
    if (a.homework.length) out.push(plural(a.homework.length, "devoir", "devoirs"));
    if (a.courses.length)
      out.push(plural(a.courses.length, "cours à l'emploi du temps", "cours à l'emploi du temps"));
  }
  const grades = read("orbs.grades.v1");
  if (grades) {
    const n = healGrades(grades).grades.length;
    if (n) out.push(plural(n, "note", "notes"));
  }
  const learn = read("orbs.learn.v1");
  if (learn) {
    const n = Object.keys(healLearn(learn).decks).length;
    if (n) out.push(plural(n, "paquet de révision", "paquets de révision"));
  }
  const ai = read("orbs.ai.v2");
  if (ai) {
    const store = aiStore(ai);
    const n = store.convs.length + Object.values(store.threads).filter((m) => m.length > 0).length;
    if (n) out.push(plural(n, "conversation avec l'assistant", "conversations avec l'assistant"));
  }
  const d = read("orbs:draft:new");
  if (d && draft(d).content.trim()) out.push("1 brouillon de journal");
  return out;
}

/**
 * Faut-il demander au compte actif si les anciennes données sont les siennes ?
 * Renvoie leur description, ou `null` s'il n'y a rien à demander.
 */
export function legacyOffer(userId: string): string[] | null {
  if (getActiveUser() !== userId) return null;
  if (readLegacyStatus().kind !== "orphan") return null;
  try {
    if (readUserItem(LEGACY_DECLINED_KEY) !== null) return null;
  } catch {
    return null;
  }
  const items = describeLegacy();
  return items.length ? items : null;
}

/** L'élève a répondu « non » : on ne lui reposera pas la question ici. */
export function declineLegacy(): void {
  try {
    writeUserItem(LEGACY_DECLINED_KEY, new Date().toISOString());
  } catch {
    /* stockage plein : la question reviendra, sans conséquence */
  }
}

/** L'élève a répondu « oui » : les données rejoignent son compte. */
export function acceptLegacy(userId: string): ClaimResult {
  if (getActiveUser() !== userId || readLegacyStatus().kind !== "orphan")
    return { moved: [], left: [] };
  return claimLegacy(userId);
}
