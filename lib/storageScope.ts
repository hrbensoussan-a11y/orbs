// Surveillance du compte actif côté navigateur (sans React, donc testable).
//
// Le serveur dit qui est connecté à chaque rendu d'une page protégée ; ce
// module traite ce qui peut changer ENTRE deux rendus, dans un onglet resté
// ouvert :
//   - un autre onglet s'est déconnecté ou a changé de compte ;
//   - la session a expiré pendant que la page était affichée ;
//   - la page revient d'un cache du navigateur (retour arrière) alors que le
//     compte de l'appareil n'est plus le même.
// Dans ces cas l'onglet est « périmé » : on ferme l'accès aux données locales
// et on recharge, pour que le serveur redonne la vérité (compte courant ou
// écran de connexion).

import {
  ACTIVE_USER_KEY,
  isValidUserId,
  readDeviceUser,
  setActiveUser,
} from "@/lib/userStorage";

export type StaleReason = "other-tab" | "expired" | "restored";

/** Délai maximal accepté par setTimeout (~24,8 jours). */
const MAX_TIMEOUT_MS = 2 ** 31 - 1;

export type ScopeWatch = {
  /** Compte pour lequel cette page a été rendue (null : page hors compte). */
  userId: string | null;
  /** Fin de validité de la session (ms depuis l'époque), si connue. */
  expiresAt?: number | null;
  /**
   * `false` si le marqueur d'appareil n'a pas pu être écrit (stockage plein,
   * mode privé) : on ne peut alors rien déduire de son absence.
   */
  markerReliable?: boolean;
  onStale: (reason: StaleReason) => void;
};

/**
 * Surveille le compte actif. Appelle `onStale` au plus une fois, puis se tait.
 * Renvoie la fonction d'arrêt.
 */
export function watchScope({
  userId,
  expiresAt = null,
  markerReliable = true,
  onStale,
}: ScopeWatch): () => void {
  if (typeof window === "undefined") return () => {};

  let done = false;
  let timer: ReturnType<typeof setTimeout> | null = null;

  function stale(reason: StaleReason) {
    if (done) return;
    done = true;
    stop();
    onStale(reason);
  }

  // Session encore valide au montage : on surveille son échéance. Si elle est
  // déjà dépassée d'après l'horloge de l'appareil, on fait confiance au serveur
  // qui vient de rendre la page (une horloge déréglée ne doit pas verrouiller
  // un compte valide ni provoquer de rechargements en boucle).
  const watchExpiry =
    userId !== null && typeof expiresAt === "number" && expiresAt > Date.now();

  function expired(): boolean {
    return watchExpiry && Date.now() >= (expiresAt as number);
  }

  function armExpiry() {
    if (!watchExpiry) return;
    const left = (expiresAt as number) - Date.now();
    timer = setTimeout(
      () => {
        if (expired()) stale("expired");
        else armExpiry(); // délai tronqué : on réarme
      },
      Math.max(0, Math.min(left, MAX_TIMEOUT_MS)),
    );
  }

  function check(reason: StaleReason) {
    if (expired()) return stale("expired");
    if (markerReliable && readDeviceUser() !== userId) stale(reason);
  }

  // Un autre onglet a changé le compte de l'appareil (ou vidé le stockage).
  function onStorage(e: StorageEvent) {
    if (e.key !== null && e.key !== ACTIVE_USER_KEY) return;
    if (!markerReliable) return;
    const now = e.key === null ? readDeviceUser() : isValidUserId(e.newValue) ? e.newValue : null;
    if (now !== userId) stale("other-tab");
  }

  // Page restaurée telle quelle par le navigateur (retour arrière).
  function onPageShow(e: PageTransitionEvent) {
    if (e.persisted) check("restored");
  }

  // Retour sur l'onglet : les minuteries ont pu être suspendues entre-temps.
  function onVisible() {
    if (typeof document !== "undefined" && !document.hidden) check("other-tab");
  }

  function stop() {
    if (timer) clearTimeout(timer);
    timer = null;
    window.removeEventListener("storage", onStorage);
    window.removeEventListener("pageshow", onPageShow);
    if (typeof document !== "undefined")
      document.removeEventListener("visibilitychange", onVisible);
  }

  window.addEventListener("storage", onStorage);
  window.addEventListener("pageshow", onPageShow);
  if (typeof document !== "undefined")
    document.addEventListener("visibilitychange", onVisible);
  armExpiry();

  return () => {
    done = true;
    stop();
  };
}

// ---------------------------------------------------------------------------
// Verrouillage d'un onglet périmé
// ---------------------------------------------------------------------------

const RELOAD_LOG_KEY = "orbs.device.reloads";
const RELOAD_WINDOW_MS = 30_000;
const RELOAD_MAX = 3;

/**
 * Ferme l'accès aux données locales puis recharge la page. Le rechargement
 * est borné (3 en 30 s, compté par onglet) : au-delà, l'onglet reste
 * simplement verrouillé plutôt que de boucler.
 * Renvoie `true` si un rechargement a été demandé.
 */
export function lockScope(reload: () => void = () => window.location.reload()): boolean {
  setActiveUser(null);
  if (typeof window === "undefined") return false;
  const now = Date.now();
  let recent: number[] = [];
  try {
    const raw = JSON.parse(window.sessionStorage.getItem(RELOAD_LOG_KEY) || "[]");
    if (Array.isArray(raw))
      recent = raw.filter((t) => typeof t === "number" && now - t < RELOAD_WINDOW_MS);
  } catch {
    recent = [];
  }
  if (recent.length >= RELOAD_MAX) return false;
  try {
    window.sessionStorage.setItem(RELOAD_LOG_KEY, JSON.stringify([...recent, now]));
  } catch {
    /* sessionStorage indisponible : on recharge quand même une fois */
  }
  reload();
  return true;
}
