import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from "vitest";
import { SignJWT } from "jose";
import { installBrowser, type FakeBrowser } from "./helpers/browser";
import {
  ACTIVE_USER_KEY,
  commitDeviceUser,
  readDeviceUser,
  setActiveUser,
  getActiveUser,
  readUserItem,
} from "@/lib/userStorage";
import { watchScope, lockScope, type StaleReason } from "@/lib/storageScope";
import { loadAgenda, saveAgenda, emptyAgenda } from "@/lib/agenda/store";

// Cycle de vie du compte actif dans le navigateur : connexion, déconnexion,
// changement de compte (y compris depuis un autre onglet) et expiration de
// session. Le composant StorageScope ne fait qu'enchaîner ces fonctions ;
// `mountScope` ci-dessous reproduit exactement ce qu'il exécute au montage.

const A = "cmuseraaaa0001";
const B = "cmuserbbbb0002";
const MIN = 60_000;

let browser: FakeBrowser;

type Mounted = { stale: StaleReason[]; purged: boolean; unmount: () => void };

/** Ce que fait StorageScope quand une page est rendue pour `userId`. */
function mountScope(userId: string | null, expiresAt: number | null = null): Mounted {
  setActiveUser(userId);
  const { changed, persisted } = commitDeviceUser(userId);
  const stale: StaleReason[] = [];
  const unmount = watchScope({
    userId,
    expiresAt,
    markerReliable: persisted,
    onStale: (reason) => {
      stale.push(reason);
      lockScope(() => {}); // rechargement neutralisé dans les tests
    },
  });
  return { stale, purged: changed, unmount };
}

function homework(title: string) {
  return { ...emptyAgenda(), homework: [{ id: "h1", title, subject: "Maths", due: "2026-11-20", done: false }] };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-12T10:00:00Z"));
  browser = installBrowser();
  setActiveUser(null);
});

afterEach(() => {
  setActiveUser(null);
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("Marqueur d'appareil (quel compte est actif dans ce navigateur)", () => {
  it("signale un changement à la première utilisation, à la connexion, à la déconnexion et au changement de compte", () => {
    // Appareil jamais vu par cette version : par prudence, on nettoie.
    expect(commitDeviceUser(null)).toMatchObject({ previous: null, changed: true, persisted: true });
    // Écran de connexion revisité : rien à refaire.
    expect(commitDeviceUser(null).changed).toBe(false);
    // Connexion de A.
    expect(commitDeviceUser(A)).toMatchObject({ previous: null, changed: true });
    expect(readDeviceUser()).toBe(A);
    // Navigation de A d'une page à l'autre : même compte.
    expect(commitDeviceUser(A).changed).toBe(false);
    // B se connecte sans que A se soit déconnecté (autre onglet, session expirée…).
    expect(commitDeviceUser(B)).toMatchObject({ previous: A, changed: true });
    // Déconnexion.
    expect(commitDeviceUser(null)).toMatchObject({ previous: B, changed: true });
    expect(readDeviceUser()).toBeNull();
  });

  it("un marqueur invalide est ignoré et jamais écrit tel quel", () => {
    browser.localStorage.setItem(ACTIVE_USER_KEY, "a:b/../c");
    expect(readDeviceUser()).toBeNull();
    expect(commitDeviceUser("x y")).toMatchObject({ previous: null, changed: false });
    expect(browser.localStorage.getItem(ACTIVE_USER_KEY)).toBe("");
  });

  it("indique quand le marqueur n'a pas pu être écrit (stockage plein, mode privé)", () => {
    browser.localStorage.failWrites = true;
    expect(commitDeviceUser(A)).toMatchObject({ changed: true, persisted: false });
  });
});

describe("Déconnexion et changement de compte", () => {
  it("2. après déconnexion, l'écran de connexion ne donne accès à rien et demande de vider le cache", () => {
    const app = mountScope(A);
    saveAgenda(homework("Devoir de A"));
    app.unmount();

    const login = mountScope(null); // redirection vers /login après `logout()`
    expect(login.purged).toBe(true);
    expect(getActiveUser()).toBeNull();
    expect(loadAgenda()).toEqual(emptyAgenda());
    login.unmount();
  });

  it("3 et 4. A, puis B, puis A de nouveau : chacun retrouve les siennes, jamais celles de l'autre", () => {
    let page = mountScope(A);
    saveAgenda(homework("Devoir de A"));
    page.unmount();

    page = mountScope(null);
    page.unmount();

    page = mountScope(B);
    expect(page.purged).toBe(true); // le cache hors ligne de A ne sert pas B
    expect(loadAgenda()).toEqual(emptyAgenda());
    saveAgenda(homework("Devoir de B"));
    page.unmount();

    page = mountScope(null);
    page.unmount();

    page = mountScope(A);
    expect(loadAgenda().homework[0].title).toBe("Devoir de A");
    page.unmount();
  });

  it("4. un autre onglet se déconnecte : cet onglet se verrouille aussitôt", () => {
    const tab = mountScope(A);
    saveAgenda(homework("Devoir de A"));

    // L'autre onglet arrive sur /login : il vide le marqueur.
    browser.localStorage.setItem(ACTIVE_USER_KEY, "");
    browser.emitStorage(ACTIVE_USER_KEY, "");

    expect(tab.stale).toEqual(["other-tab"]);
    expect(getActiveUser()).toBeNull();
    expect(loadAgenda()).toEqual(emptyAgenda());
  });

  it("4. un autre onglet se connecte avec un autre compte : cet onglet ne lit ni n'écrit plus rien", () => {
    const tab = mountScope(A);
    saveAgenda(homework("Devoir de A"));

    browser.localStorage.setItem(ACTIVE_USER_KEY, B);
    browser.emitStorage(ACTIVE_USER_KEY, B);

    expect(tab.stale).toEqual(["other-tab"]);
    // L'onglet périmé de A ne peut plus rien écrire : ni chez A, ni chez B.
    const before = browser.localStorage.snapshot();
    saveAgenda(homework("Écrit par l'onglet périmé"));
    expect(browser.localStorage.snapshot()).toEqual(before);

    // B, dans son onglet, ne voit rien de A.
    setActiveUser(B);
    expect(loadAgenda()).toEqual(emptyAgenda());
  });

  it("le même compte ouvert dans deux onglets ne se verrouille pas", () => {
    const tab = mountScope(A);
    browser.emitStorage(ACTIVE_USER_KEY, A);
    browser.emitStorage("orbs.user." + A + ":orbs.agenda.v1", "{}");
    browser.emitVisible();
    browser.emitPageShow(true);
    expect(tab.stale).toEqual([]);
    expect(getActiveUser()).toBe(A);
    tab.unmount();
  });

  it("un écran de connexion resté ouvert se recharge quand on se connecte ailleurs", () => {
    const login = mountScope(null);
    browser.localStorage.setItem(ACTIVE_USER_KEY, A);
    browser.emitStorage(ACTIVE_USER_KEY, A);
    expect(login.stale).toEqual(["other-tab"]);
  });

  it("page restaurée par le navigateur (retour arrière) alors que le compte a changé : verrouillée", () => {
    const tab = mountScope(A);
    saveAgenda(homework("Devoir de A"));
    // Pendant que la page dormait, B s'est connecté (aucun évènement reçu).
    browser.localStorage.setItem(ACTIVE_USER_KEY, B);

    browser.emitPageShow(false); // affichage normal : rien à faire
    expect(tab.stale).toEqual([]);
    browser.emitPageShow(true); // restauration depuis le cache du navigateur
    expect(tab.stale).toEqual(["restored"]);
    expect(loadAgenda()).toEqual(emptyAgenda());
  });

  it("stockage entièrement vidé depuis un autre onglet : l'onglet se verrouille", () => {
    const tab = mountScope(A);
    browser.localStorage.clear();
    browser.emitStorage(null, null);
    expect(tab.stale).toEqual(["other-tab"]);
  });

  it("si le marqueur n'a pas pu être écrit, son absence ne provoque aucun verrouillage", () => {
    browser.localStorage.failWrites = true;
    const tab = mountScope(A);
    browser.emitVisible();
    browser.emitPageShow(true);
    browser.emitStorage(ACTIVE_USER_KEY, "");
    expect(tab.stale).toEqual([]);
    expect(getActiveUser()).toBe(A);
    tab.unmount();
  });

  it("après démontage, plus aucun évènement n'est traité", () => {
    const tab = mountScope(A, Date.now() + 5 * MIN);
    tab.unmount();
    browser.emitStorage(ACTIVE_USER_KEY, B);
    vi.advanceTimersByTime(10 * MIN);
    expect(tab.stale).toEqual([]);
  });
});

describe("Expiration de session", () => {
  it("5. à l'échéance, l'onglet resté ouvert perd l'accès aux données du compte", () => {
    const tab = mountScope(A, Date.now() + 30 * MIN);
    saveAgenda(homework("Devoir de A"));

    vi.advanceTimersByTime(29 * MIN);
    expect(tab.stale).toEqual([]);
    expect(loadAgenda().homework).toHaveLength(1);

    vi.advanceTimersByTime(2 * MIN);
    expect(tab.stale).toEqual(["expired"]);
    expect(getActiveUser()).toBeNull();
    expect(loadAgenda()).toEqual(emptyAgenda());
    expect(readUserItem("orbs.agenda.v1")).toBeNull();
  });

  it("5. session expirée puis connexion d'un autre compte : aucune donnée de l'ancien compte", () => {
    const tabA = mountScope(A, Date.now() + 10 * MIN);
    saveAgenda(homework("Devoir de A"));
    vi.advanceTimersByTime(11 * MIN);
    expect(tabA.stale).toEqual(["expired"]);

    // Le rechargement mène à /login (le serveur ne reconnaît plus la session).
    const login = mountScope(null);
    expect(login.purged).toBe(true);
    expect(loadAgenda()).toEqual(emptyAgenda());
    login.unmount();

    // B se connecte sur le même appareil.
    const tabB = mountScope(B, Date.now() + 30 * 24 * 60 * MIN);
    expect(loadAgenda()).toEqual(emptyAgenda());
    saveAgenda(homework("Devoir de B"));
    expect(JSON.stringify(loadAgenda())).not.toContain("Devoir de A");
    tabB.unmount();
  });

  it("5. l'échéance est aussi vérifiée au retour sur l'onglet (minuteries suspendues en veille)", () => {
    const tab = mountScope(A, Date.now() + 10 * MIN);
    // L'appareil se réveille 2 h plus tard sans que la minuterie ait tourné.
    vi.setSystemTime(Date.now() + 120 * MIN);
    browser.emitVisible();
    expect(tab.stale).toEqual(["expired"]);
    expect(getActiveUser()).toBeNull();
  });

  it("une session de 30 jours dépasse la durée maximale d'une minuterie : elle est réarmée, pas déclenchée trop tôt", () => {
    const thirtyDays = 30 * 24 * 60 * MIN;
    const tab = mountScope(A, Date.now() + thirtyDays);
    vi.advanceTimersByTime(25 * 24 * 60 * MIN); // au-delà de 2^31 ms
    expect(tab.stale).toEqual([]);
    expect(getActiveUser()).toBe(A);
    vi.advanceTimersByTime(5 * 24 * 60 * MIN + MIN);
    expect(tab.stale).toEqual(["expired"]);
  });

  it("horloge de l'appareil en avance : on fait confiance au serveur, sans verrouiller ni boucler", () => {
    // Le serveur vient de rendre la page pour A, mais l'horloge locale croit
    // l'échéance déjà passée.
    const tab = mountScope(A, Date.now() - 60 * MIN);
    vi.advanceTimersByTime(24 * 60 * MIN);
    browser.emitVisible();
    expect(tab.stale).toEqual([]);
    expect(getActiveUser()).toBe(A);
    tab.unmount();
  });
});

describe("Verrouillage d'un onglet périmé", () => {
  it("ferme l'accès puis recharge la page", () => {
    setActiveUser(A);
    const reload = vi.fn();
    expect(lockScope(reload)).toBe(true);
    expect(getActiveUser()).toBeNull();
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("ne recharge pas en boucle : 3 fois au plus en 30 s, l'onglet restant verrouillé", () => {
    const reload = vi.fn();
    for (let i = 0; i < 6; i++) {
      setActiveUser(A);
      lockScope(reload);
      expect(getActiveUser()).toBeNull();
    }
    expect(reload).toHaveBeenCalledTimes(3);

    vi.advanceTimersByTime(31_000);
    expect(lockScope(reload)).toBe(true);
    expect(reload).toHaveBeenCalledTimes(4);
  });
});

describe("Session côté serveur (source de vérité du compte actif)", () => {
  const SECRET = "secret-de-test-uniquement-0123456789abcdef";
  let decrypt: typeof import("@/lib/session").decrypt;
  let encrypt: typeof import("@/lib/session").encrypt;

  beforeAll(async () => {
    process.env.SESSION_SECRET ??= SECRET;
    ({ decrypt, encrypt } = await import("@/lib/session"));
  });

  it("un jeton valide désigne son compte", async () => {
    vi.useRealTimers();
    const token = await encrypt({ userId: A, expiresAt: new Date(Date.now() + 60_000).toISOString() });
    expect((await decrypt(token))?.userId).toBe(A);
  });

  it("une session d'avant la mise à jour est reconnue (marqueur `scoped` absent → false)", async () => {
    vi.useRealTimers();
    const oldToken = await encrypt({ userId: A, expiresAt: new Date(Date.now() + 60_000).toISOString() });
    expect((await decrypt(oldToken))?.scoped).toBe(false);
    const newToken = await encrypt({ userId: A, expiresAt: new Date(Date.now() + 60_000).toISOString(), scoped: true });
    expect((await decrypt(newToken))?.scoped).toBe(true);
  });

  it("5. un jeton expiré ne désigne plus aucun compte : le serveur renvoie vers /login", async () => {
    vi.useRealTimers();
    const key = new TextEncoder().encode(process.env.SESSION_SECRET);
    const past = Math.floor(Date.now() / 1000) - 3600;
    const expired = await new SignJWT({ userId: A, expiresAt: new Date(past * 1000).toISOString() })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt(past - 60)
      .setExpirationTime(past)
      .sign(key);
    expect(await decrypt(expired)).toBeNull();
  });

  it("un jeton falsifié ou absent ne désigne aucun compte", async () => {
    vi.useRealTimers();
    const forged = await new SignJWT({ userId: A })
      .setProtectedHeader({ alg: "HS256" })
      .setExpirationTime("1h")
      .sign(new TextEncoder().encode("une-autre-cle-que-celle-du-serveur-000000"));
    expect(await decrypt(forged)).toBeNull();
    expect(await decrypt(undefined)).toBeNull();
    expect(await decrypt("n'importe quoi")).toBeNull();
  });
});
