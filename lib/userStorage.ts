// Stockage local cloisonné par compte.
//
// Les données locales d'Orbs (agenda, notes, paquets, conversations IA,
// brouillon du journal, préférences…) vivaient sous des clés globales à
// l'appareil ("orbs.agenda.v1"…) : le compte suivant sur le même navigateur
// lisait celles du précédent. Ce module est désormais le SEUL point d'accès
// à `localStorage` pour ces données.
//
// Règles :
//   - chaque compte a son espace : `orbs.user.<id>:<clé d'origine>` ;
//   - sans compte actif, on ne lit rien et on n'écrit rien (fermé par défaut) ;
//   - le compte actif vient du serveur (session vérifiée), jamais du client :
//     voir components/StorageScope ;
//   - les anciennes clés globales ne sont plus jamais lues ici. Elles restent
//     intactes sur l'appareil tant qu'on n'a pas décidé à qui les rattacher
//     (voir lib/legacyStorage).

/** Préfixe des clés d'un compte : `orbs.user.<id>:<clé>`. */
export const USER_PREFIX = "orbs.user.";

/**
 * Marqueur d'appareil : identifiant du compte actif dans ce navigateur.
 * Il sert au script anti-flash d'apparence (avant React) et à prévenir les
 * autres onglets d'un changement de compte. Ce n'est pas un secret, et il
 * n'ouvre aucun droit : seul le serveur décide qui est connecté.
 */
export const ACTIVE_USER_KEY = "orbs.device.activeUser";

const USER_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

let activeUserId: string | null = null;

/** Un identifiant utilisable dans une clé (cuid : lettres et chiffres). */
export function isValidUserId(value: unknown): value is string {
  return typeof value === "string" && USER_ID_RE.test(value);
}

/** Clé physique d'une donnée dans l'espace d'un compte. */
export function userKey(userId: string, key: string): string {
  return `${USER_PREFIX}${userId}:${key}`;
}

/**
 * Désigne le compte dont on lit et écrit les données locales.
 * `null` (ou un identifiant invalide) ferme tout accès.
 */
export function setActiveUser(userId: string | null | undefined): void {
  activeUserId = isValidUserId(userId) ? userId : null;
}

export function getActiveUser(): string | null {
  return activeUserId;
}

function storage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null; // accès refusé par le navigateur
  }
}

/** Lit une donnée du compte actif. `null` si absente ou si aucun compte. */
export function readUserItem(key: string): string | null {
  const s = storage();
  if (!s || !activeUserId) return null;
  return s.getItem(userKey(activeUserId, key));
}

/**
 * Écrit une donnée dans l'espace du compte actif. Sans compte actif, n'écrit
 * rien et renvoie `false`. Peut lever (quota, mode privé) comme `setItem`.
 */
export function writeUserItem(key: string, value: string): boolean {
  const s = storage();
  if (!s || !activeUserId) return false;
  s.setItem(userKey(activeUserId, key), value);
  return true;
}

/** Supprime une donnée du compte actif (sans effet si aucun compte). */
export function removeUserItem(key: string): void {
  const s = storage();
  if (!s || !activeUserId) return;
  s.removeItem(userKey(activeUserId, key));
}

// ---------------------------------------------------------------------------
// Marqueur d'appareil
// ---------------------------------------------------------------------------

/** Compte noté comme actif sur l'appareil (peut dater d'un autre onglet). */
export function readDeviceUser(): string | null {
  try {
    const raw = storage()?.getItem(ACTIVE_USER_KEY);
    return isValidUserId(raw) ? raw : null;
  } catch {
    return null;
  }
}

/**
 * Note le compte actif sur l'appareil. Renvoie `changed: true` si ce n'était
 * pas le même qu'avant (connexion, déconnexion, autre compte, première
 * utilisation) : l'appelant doit alors vider ce qui a pu être mis en cache
 * pour le compte précédent.
 */
export function commitDeviceUser(userId: string | null): {
  previous: string | null;
  changed: boolean;
  /** `false` si le marqueur n'a pas pu être écrit (quota, mode privé). */
  persisted: boolean;
} {
  const next = isValidUserId(userId) ? userId : null;
  const s = storage();
  let hadMarker = false;
  let previous: string | null = null;
  try {
    const raw = s?.getItem(ACTIVE_USER_KEY) ?? null;
    hadMarker = raw !== null;
    previous = isValidUserId(raw) ? raw : null;
  } catch {
    /* illisible : traité comme un changement */
  }
  // Marqueur absent = on ne sait pas qui utilisait l'appareil : par prudence
  // c'est un changement, même pour passer à « personne ».
  const changed = previous !== next || (!hadMarker && next === null);
  let persisted = false;
  try {
    // Hors compte, le marqueur reste présent mais vide : « appareil déjà
    // nettoyé ». Cela évite de revider le cache à chaque écran de connexion.
    s?.setItem(ACTIVE_USER_KEY, next ?? "");
    persisted = s?.getItem(ACTIVE_USER_KEY) === (next ?? "");
  } catch {
    /* quota / mode privé : le cloisonnement en mémoire reste garanti */
  }
  return { previous, changed, persisted };
}
