// Données personnelles enregistrées sur l'APPAREIL (navigateur) — CLIENT.
//
// Une partie des données d'Orbs ne vit que dans le stockage local du
// navigateur, dans l'espace du compte : `orbs.user.<id>:<clé>` (voir
// lib/userStorage). Le serveur ne peut PAS les lire. Ce module, exécuté dans
// le navigateur, sait :
//   - les RASSEMBLER pour l'export (« Télécharger mes données ») : le
//     navigateur récupère l'export du serveur, y ajoute ces données, puis
//     télécharge le fichier — les données locales ne sont jamais envoyées
//     au serveur ;
//   - les EFFACER pour un compte supprimé, et UNIQUEMENT pour lui : sur un
//     appareil partagé, les espaces des autres comptes restent intacts.
//
// Toutes les fonctions prennent le `Storage` en paramètre (testables sans
// navigateur réel).

import {
  ACTIVE_USER_KEY,
  TOMBSTONES_KEY,
  USER_PREFIX,
  getActiveUser,
  isValidUserId,
  readTombstones,
  setActiveUser,
  userKey,
} from "@/lib/userStorage";
import { LEGACY_KEYS, LEGACY_STATUS_KEY } from "@/lib/legacyStorage";
import { filterLocalEntry, type LocalExclusion } from "@/lib/localDataFilter";

// ---------------------------------------------------------------------------
// Inventaire des données locales d'un compte
// ---------------------------------------------------------------------------

/**
 * Chaque clé connue de l'espace d'un compte, et sa place dans l'archive.
 * Les clés inconnues (ajoutées plus tard) sont tout de même exportées, dans
 * « autres » : rien de ce qui appartient au compte n'est oublié — mais elles
 * passent par le filtre complet des données sensibles (lib/localDataFilter).
 *
 * Ajouter une clé ici, c'est certifier l'avoir RELUE : elle ne contient aucun
 * moyen de connexion (jeton, mot de passe, clé…). Ses champs ne sont alors
 * plus filtrés par leur nom (ils peuvent porter des noms choisis par l'élève,
 * comme ses matières), seulement par le format de leurs valeurs.
 */
export const LOCAL_DATA_CATALOG: Record<string, { path: string[]; label: string }> = {
  "orbs.agenda.v1": { path: ["agenda"], label: "Devoirs et emploi du temps" },
  "orbs.grades.v1": { path: ["notes"], label: "Notes et moyennes" },
  "orbs.learn.v1": { path: ["apprendre"], label: "Paquets, cartes et progression Apprendre" },
  "orbs.focus": { path: ["minuteurConcentration"], label: "Minuteur de concentration" },
  "orbs.ai.v2": { path: ["conversationsIA"], label: "Conversations avec l'assistant IA" },
  "orbs:draft:new": { path: ["brouillonJournal"], label: "Brouillon de journal pas encore enregistré" },
  "orbs.agenda.notif.v1": { path: ["rappels", "reglages"], label: "Réglages des rappels" },
  "orbs.agenda.notif.fired.v1": { path: ["rappels", "declenchesAujourdhui"], label: "Rappels déjà affichés aujourd'hui" },
  "orbs.agenda.notif.deferred.v1": { path: ["rappels", "enAttenteConcentration"], label: "Rappels en attente de la fin d'une concentration" },
  "orbs.ai.cleared": { path: ["preferences", "ia", "historiqueEffaceLe"], label: "Dernier effacement de l'historique appliqué" },
  "orbs.appearance": { path: ["preferences", "apparence"], label: "Thème, fond, luminosité" },
  "orbs.motion": { path: ["preferences", "animationsReduites"], label: "Animations réduites" },
  "orbs.subjectColors": { path: ["preferences", "couleursMatieres"], label: "Couleurs des matières" },
  "orbs.learn.ui": { path: ["preferences", "affichageApprendre"], label: "Tri et dossiers d'Apprendre" },
  "orbs.ai.panel": { path: ["preferences", "ia", "colonneDiscussions"], label: "Colonne Discussions" },
  "orbs.ai.voice": { path: ["preferences", "ia", "voix"], label: "Voix de l'assistant" },
  "orbs.ai.voiceplay": { path: ["preferences", "ia", "lectureAutomatique"], label: "Lecture automatique" },
  "orbs.ai.mode": { path: ["preferences", "ia", "modeReflexion"], label: "Mode de réflexion" },
  "orbs.ai.tags": { path: ["preferences", "ia", "commandes"], label: "Commandes de l'IA" },
  "orbs.aiorb.pos": { path: ["preferences", "bulleIA", "position"], label: "Position de la bulle IA" },
  "orbs.aiorb.prefs": { path: ["preferences", "bulleIA", "reglages"], label: "Réglages de la bulle IA" },
  "orbs.legacy.declined": {
    path: ["preferences", "anciennesDonneesRefuseesLe"],
    label: "Réponse « ce n'est pas à moi » aux anciennes données de l'appareil",
  },
};

function parseValue(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return raw; // valeur texte simple (ex. "reduced", "nova")
  }
}

/** `Object.hasOwn`, compatible avec les navigateurs plus anciens (tablettes scolaires). */
function hasOwn(obj: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

/** Propriété propre, même pour un nom comme « __proto__ » (aucune donnée perdue). */
function defineOwn(node: Record<string, unknown>, key: string, value: unknown): void {
  Object.defineProperty(node, key, { value, enumerable: true, writable: true, configurable: true });
}

function setPath(target: Record<string, unknown>, path: string[], value: unknown): void {
  let node = target;
  for (const part of path.slice(0, -1)) {
    const next = hasOwn(node, part) ? node[part] : undefined;
    if (!next || typeof next !== "object") defineOwn(node, part, {});
    node = node[part] as Record<string, unknown>;
  }
  defineOwn(node, path[path.length - 1], value);
}

function allKeys(storage: Storage): string[] {
  const keys: string[] = [];
  for (let i = 0; i < storage.length; i++) {
    const k = storage.key(i);
    if (k !== null) keys.push(k);
  }
  return keys;
}

/** Clés de l'espace EXACT d'un compte (`orbs.user.<id>:` — le « : » évite toute confusion entre `abc` et `abcd`). */
export function accountKeys(storage: Storage, userId: string): string[] {
  if (!isValidUserId(userId)) return [];
  const prefix = userKey(userId, "");
  return allKeys(storage).filter((k) => k.startsWith(prefix));
}

export type LocalAccountData = {
  source: "appareil";
  explication: string;
  collecteeLe: string;
  /** Nombre de données trouvées sur cet appareil. */
  elements: number;
  /** Libellés des données trouvées (pour s'y retrouver). */
  contenu: string[];
  /** Ce qui n'a PAS été inclus (moyens de connexion, autre espace…), et pourquoi. */
  elementsRetires: LocalExclusion[];
  [section: string]: unknown;
};

/**
 * Rassemble TOUTES les données de l'espace local de `userId` sur cet appareil
 * (et seulement elles). Les anciennes données de l'appareil ne sont incluses
 * que si elles sont explicitement attribuées à ce compte ; les données
 * orphelines (propriétaire inconnu) ne le sont jamais. Chaque donnée passe par
 * le filtre des données sensibles : aucun jeton, mot de passe ou clé technique
 * n'entre dans l'archive, et ce qui a été retiré est listé.
 */
export function collectLocalData(storage: Storage, userId: string): LocalAccountData {
  const out: LocalAccountData = {
    source: "appareil",
    explication:
      "Données enregistrées uniquement dans le navigateur de l'appareil qui a " +
      "fait l'export. Elles ne passent pas par le serveur : celles de tes autres " +
      "appareils n'y figurent que si tu exportes aussi depuis ces appareils.",
    collecteeLe: new Date().toISOString(),
    elements: 0,
    contenu: [],
    elementsRetires: [],
  };
  const prefix = userKey(userId, "");
  const add = (key: string, raw: string, origin?: string) => {
    // hasOwn : une clé nommée « constructor » ou « toString » n'est pas « connue ».
    const known = hasOwn(LOCAL_DATA_CATALOG, key) ? LOCAL_DATA_CATALOG[key] : undefined;
    const filtered = filterLocalEntry(key, parseValue(raw), {
      reviewed: known !== undefined,
      label: origin ? `${key} (${origin})` : key,
      exclusions: out.elementsRetires,
    });
    if (!filtered.keep) return;
    const value = filtered.value;
    if (known) {
      setPath(out, origin ? ["anciennesDonneesRattachees", ...known.path] : known.path, value);
      out.contenu.push(origin ? `${known.label} (${origin})` : known.label);
    } else {
      setPath(out, ["autres", key], value);
      out.contenu.push(key);
    }
    out.elements++;
  };

  for (const k of accountKeys(storage, userId)) {
    const raw = storage.getItem(k);
    if (raw !== null) add(k.slice(prefix.length), raw);
  }

  // Anciennes données dont le transfert vers ce compte n'est pas terminé
  // (statut « owner:<id> ») : elles lui appartiennent, on les inclut.
  if (storage.getItem(LEGACY_STATUS_KEY) === `owner:${userId}`) {
    for (const k of LEGACY_KEYS) {
      const raw = storage.getItem(k);
      if (raw !== null) add(k, raw, "anciennes données de l'appareil");
    }
  } else if (LEGACY_KEYS.some((k) => storage.getItem(k) !== null)) {
    out.anciennesDonneesNonRattachees =
      "Cet appareil conserve d'anciennes données dont le propriétaire n'est pas " +
      "confirmé : elles ne sont pas incluses dans ton archive.";
  }
  return out;
}

/** Export du serveur (lib/account.ts → AccountExport), vu côté client. */
export type ServerExport = {
  compte: { id: string };
  sources?: { serveur: string; appareil: string | null };
  [k: string]: unknown;
};

export type FullExportResult =
  | { ok: true; archive: Record<string, unknown> }
  | { ok: false; error: string };

/**
 * Archive complète = export du serveur + données de cet appareil. Refuse si
 * le compte de l'export serveur n'est pas celui dont l'appareil a ouvert
 * l'espace (onglet resté ouvert sur un autre compte) : on n'assemble jamais
 * les données de deux comptes différents.
 */
export function buildFullExport(
  server: ServerExport,
  storage: Storage,
  activeUserId: string | null,
): FullExportResult {
  const serverId = server?.compte?.id;
  if (!isValidUserId(serverId) || !activeUserId || serverId !== activeUserId) {
    return {
      ok: false,
      error: "Le compte affiché sur cet appareil a changé. Recharge la page, puis réessaie.",
    };
  }
  const local = collectLocalData(storage, serverId);
  return {
    ok: true,
    archive: {
      ...server,
      sources: {
        serveur: server.sources?.serveur ?? "Données enregistrées sur le serveur d'Orbs.",
        appareil: local.explication,
      },
      donneesDeCetAppareil: local,
    },
  };
}

// ---------------------------------------------------------------------------
// Effacement des données locales d'un compte supprimé
// ---------------------------------------------------------------------------

const MAX_TOMBSTONES = 50;

function addTombstone(storage: Storage, userId: string): void {
  const list = readTombstones(storage).filter((id) => id !== userId);
  list.push(userId);
  try {
    storage.setItem(TOMBSTONES_KEY, JSON.stringify(list.slice(-MAX_TOMBSTONES)));
  } catch {
    /* stockage plein : l'effacement ci-dessous a tout de même lieu */
  }
}

export type PurgeReport = { removedKeys: string[]; legacyKeysRemoved: string[] };

/**
 * Efface de CET appareil tout ce qui appartient au compte supprimé `userId` :
 *   - son espace `orbs.user.<id>:*` (et rien d'autre) ;
 *   - les anciennes données seulement si elles lui étaient attribuées
 *     (statut « owner:<id> ») — jamais les orphelines ni celles d'un autre ;
 *   - le marqueur de compte actif s'il le désignait.
 * Le compte est d'abord inscrit comme supprimé : un autre onglet encore
 * ouvert sur lui ne peut plus rien réécrire.
 *
 * À n'appeler qu'APRÈS confirmation par le serveur que le compte n'existe
 * plus (suppression réussie, ou vérification de session).
 */
export function purgeAccountLocalData(storage: Storage, userId: string): PurgeReport {
  const report: PurgeReport = { removedKeys: [], legacyKeysRemoved: [] };
  if (!isValidUserId(userId)) return report;

  addTombstone(storage, userId);
  if (getActiveUser() === userId) setActiveUser(null);

  for (const k of accountKeys(storage, userId)) {
    storage.removeItem(k);
    report.removedKeys.push(k);
  }

  if (storage.getItem(LEGACY_STATUS_KEY) === `owner:${userId}`) {
    for (const k of LEGACY_KEYS) {
      if (storage.getItem(k) !== null) {
        storage.removeItem(k);
        report.legacyKeysRemoved.push(k);
      }
    }
    storage.removeItem(LEGACY_STATUS_KEY);
  }

  try {
    if (storage.getItem(ACTIVE_USER_KEY) === userId) storage.setItem(ACTIVE_USER_KEY, "");
  } catch {
    /* indisponible */
  }
  return report;
}

/**
 * Efface les restes éventuels des comptes déjà inscrits comme supprimés
 * (écriture concurrente d'un onglet périmé entre deux instants). Appelé à
 * chaque chargement d'une page d'Orbs.
 */
export function purgeTombstoned(storage: Storage): string[] {
  const removed: string[] = [];
  for (const id of readTombstones(storage)) {
    for (const k of accountKeys(storage, id)) {
      storage.removeItem(k);
      removed.push(k);
    }
  }
  return removed;
}

/**
 * Comptes dont cet appareil garde des données (espaces locaux + éventuel
 * propriétaire d'anciennes données en cours de transfert), hors comptes déjà
 * connus comme supprimés.
 */
export function listDeviceAccountIds(storage: Storage): string[] {
  const ids = new Set<string>();
  for (const k of allKeys(storage)) {
    if (!k.startsWith(USER_PREFIX)) continue;
    const id = k.slice(USER_PREFIX.length).split(":")[0];
    if (isValidUserId(id)) ids.add(id);
  }
  const status = storage.getItem(LEGACY_STATUS_KEY);
  if (status?.startsWith("owner:")) {
    const id = status.slice("owner:".length);
    if (isValidUserId(id)) ids.add(id);
  }
  const gone = new Set(readTombstones(storage));
  return [...ids].filter((id) => !gone.has(id));
}

// ---------------------------------------------------------------------------
// Vérification périodique des autres comptes de l'appareil
// ---------------------------------------------------------------------------

const SWEEP_KEY = "orbs.device.sweepAt";
export const SWEEP_INTERVAL_MS = 12 * 60 * 60 * 1000; // 12 h
export const SWEEP_MAX_IDS = 20;

/** Faut-il redemander au serveur si les autres comptes de l'appareil existent ? */
export function sweepDue(storage: Storage, now = Date.now()): boolean {
  const last = Number(storage.getItem(SWEEP_KEY));
  return !Number.isFinite(last) || now - last >= SWEEP_INTERVAL_MS;
}

export function markSwept(storage: Storage, now = Date.now()): void {
  try {
    storage.setItem(SWEEP_KEY, String(now));
  } catch {
    /* indisponible : on revérifiera plus tôt, sans conséquence */
  }
}

/**
 * Applique la réponse du serveur : n'efface que des comptes que le serveur
 * déclare disparus ET qui faisaient partie de la question (jamais le compte
 * connecté).
 */
export function applyGoneIds(
  storage: Storage,
  asked: string[],
  gone: unknown,
  currentUserId: string,
): string[] {
  if (!Array.isArray(gone)) return [];
  const purged: string[] = [];
  for (const id of gone) {
    if (typeof id !== "string" || id === currentUserId || !asked.includes(id)) continue;
    purgeAccountLocalData(storage, id);
    purged.push(id);
  }
  return purged;
}

export type SweepOutcome =
  | { status: "skipped" }
  | { status: "failed" }
  | { status: "done"; purged: string[] };

/** Réponse HTTP minimale (fetch dans le navigateur, simulée dans les tests). */
export type SweepResponse = { ok: boolean; json: () => Promise<unknown> };

/**
 * Demande au serveur lesquels des AUTRES comptes de l'appareil n'existent
 * plus (identifiants seulement, jamais de données) et n'efface qu'eux.
 * Au plus toutes les 12 h. Toute réponse qui n'est pas un succès explicite
 * (401, 413, 429 « trop de demandes », 503, réseau coupé, réponse illisible)
 * n'efface RIEN et ne repousse pas la prochaine vérification.
 */
export async function sweepOtherDeviceAccounts(
  storage: Storage,
  currentUserId: string,
  post: (ids: string[]) => Promise<SweepResponse>,
  now = Date.now(),
): Promise<SweepOutcome> {
  const asked = listDeviceAccountIds(storage)
    .filter((id) => id !== currentUserId)
    .slice(0, SWEEP_MAX_IDS);
  if (asked.length === 0 || !sweepDue(storage, now)) return { status: "skipped" };

  let gone: unknown;
  try {
    const res = await post(asked);
    if (!res.ok) return { status: "failed" };
    gone = ((await res.json()) as { gone?: unknown } | null)?.gone;
  } catch {
    return { status: "failed" };
  }
  if (!Array.isArray(gone)) return { status: "failed" };
  const purged = applyGoneIds(storage, asked, gone, currentUserId);
  markSwept(storage, now);
  return { status: "done", purged };
}

// ---------------------------------------------------------------------------
// Ordre des opérations lors d'une suppression demandée sur cet appareil
// ---------------------------------------------------------------------------

export type ServerDeletionResult =
  | { ok: true; deletedUserId: string }
  | { ok: false; error: string }
  | undefined;

/**
 * 1. demande la suppression au serveur ;
 * 2. SEULEMENT si le serveur confirme, efface les données locales du compte
 *    QU'IL A CONFIRMÉ supprimé ;
 * 3. quitte la page.
 * Erreur serveur, refus, réponse inattendue ou coupure réseau : on n'efface
 * RIEN sur l'appareil.
 */
export async function runAccountDeletion(deps: {
  submit: () => Promise<ServerDeletionResult>;
  purge: (userId: string) => void;
  leave: () => void;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  let result: ServerDeletionResult;
  try {
    result = await deps.submit();
  } catch {
    return {
      ok: false,
      error:
        "La connexion a échoué : nous ne savons pas si ton compte a été supprimé. " +
        "Rien n'a été effacé sur cet appareil. Recharge la page pour vérifier.",
    };
  }
  if (!result || !result.ok) {
    return { ok: false, error: result?.error ?? "La suppression n'a pas abouti. Rien n'a été effacé." };
  }
  if (!isValidUserId(result.deletedUserId)) {
    return { ok: false, error: "Réponse inattendue du serveur. Rien n'a été effacé sur cet appareil." };
  }
  deps.purge(result.deletedUserId);
  deps.leave();
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Raccourcis navigateur
// ---------------------------------------------------------------------------

function browserStorage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

/** Demande au service worker de vider son cache de pages (comptes). */
export function purgeServiceWorkerCache(): void {
  try {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.ready
      .then((reg) =>
        reg.active?.postMessage({ type: "orbs:session", userId: null, exp: null, purge: true }),
      )
      .catch(() => {});
  } catch {
    /* pas de service worker */
  }
}

/** Efface sur CET appareil les données du compte supprimé `userId`. */
export function purgeOnThisDevice(userId: string): PurgeReport {
  const s = browserStorage();
  const report = s ? purgeAccountLocalData(s, userId) : { removedKeys: [], legacyKeysRemoved: [] };
  purgeServiceWorkerCache();
  return report;
}
