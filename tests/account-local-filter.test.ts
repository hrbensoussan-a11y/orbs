// Export des données de l'APPAREIL : filtre des données sensibles
// (lib/localDataFilter.ts, appliqué par lib/localAccountData.collectLocalData).
// Trois exigences, testées séparément :
//   - les données personnelles utiles sont CONSERVÉES, y compris celles de
//     clés futures encore inconnues et les noms choisis par l'élève ;
//   - les moyens de connexion et clés techniques sont EXCLUS, et listés ;
//   - les données d'un autre compte ne sont JAMAIS exportées.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { installBrowser, type FakeBrowser } from "./helpers/browser";
import { setActiveUser, userKey } from "@/lib/userStorage";
import { LEGACY_STATUS_KEY } from "@/lib/legacyStorage";
import { LOCAL_DATA_CATALOG, buildFullExport, collectLocalData } from "@/lib/localAccountData";
import {
  EXCLUSION_REASON,
  MAX_FILTER_DEPTH,
  filterLocalEntry,
  looksLikeSecretValue,
  sensitiveName,
  type LocalExclusion,
} from "@/lib/localDataFilter";

const A = "cmuseraaaa0001";
const B = "cmuserbbbb0002";

// Faux secrets au format réel (jamais de vraies valeurs).
const JWT =
  "eyJhbGciOiJIUzI1NiJ9.eyJ1c2VySWQiOiJjbXVzZXJhYWFhMDAwMSJ9.c2lnbmF0dXJlX2ZhdXNzZV9wb3VyX3Rlc3Q";
const STRIPE_KEY = "sk_live_" + "0123456789abcdefABCDEF";
const OPENAI_KEY = "sk-proj-" + "abcdefghijklmnopqrstuvwx0123";
const PEM = "-----BEGIN PRIVATE KEY-----\nMIIBVQIBADANBgkqhkiG9w0BAQEFAAS\n-----END PRIVATE KEY-----";
const OPAQUE_TOKEN = "opaque-refresh-7f3a9c2e1b";
const SECRET_STRINGS = [JWT, STRIPE_KEY, OPENAI_KEY, "MIIBVQIBADANBgkqhkiG9w0BAQEFAAS", OPAQUE_TOKEN, "1234-pin", "hunter2-mdp", "ABCD-FAMILLE"];

let browser: FakeBrowser;
const set = (id: string, key: string, value: unknown) =>
  browser.localStorage.setItem(userKey(id, key), typeof value === "string" ? value : JSON.stringify(value));

beforeEach(() => {
  browser = installBrowser();
  setActiveUser(null);
});
afterEach(() => setActiveUser(null));

// ---------------------------------------------------------------------------
describe("données personnelles CONSERVÉES", () => {
  // Données réalistes pour CHAQUE clé du catalogue, avec des noms choisis par
  // l'élève qui ressemblent à des mots « sensibles » (matière « Secret »,
  // dossier « Auth », conversation sur les mots de passe…).
  const realistic: Record<string, unknown> = {
    "orbs.agenda.v1": {
      homework: [{ id: "h1", subject: "Secret", title: "Exposé sur les mots de passe", due: "2026-12-01", done: false }],
      courses: [{ id: "c1", subject: "Code", day: 1, start: "08:00", end: "09:00", room: "B12" }],
    },
    "orbs.grades.v1": { grades: [{ id: "g1", subject: "Token", value: 15, max: 20, coef: 2 }] },
    "orbs.learn.v1": {
      decks: { d1: { id: "d1", name: "Cryptographie : clé privée et clé publique", cards: [{ q: "Qu'est-ce qu'un token ?", a: "Un jeton." }] } },
      journal: { "2026-11-20": 12 },
    },
    "orbs.focus": { phase: "work", endsAt: 1_763_000_000_000, sessions: 4 },
    "orbs.ai.v2": {
      version: 3,
      threads: { Auth: [{ role: "user", content: "Explique-moi ce qu'est un mot de passe fort." }] },
      convs: [{ id: "k1", title: "Sécurité", messages: [{ role: "assistant", content: "Un token d'accès expire." }] }],
    },
    "orbs:draft:new": { title: "Mon secret", content: "Aujourd'hui j'ai changé mon mot de passe." },
    "orbs.agenda.notif.v1": { enabled: true, time: "18:00" },
    "orbs.agenda.notif.fired.v1": { day: "2026-11-22", keys: ["h1"] },
    "orbs.appearance": { theme: "jardin", bg: "verre", dim: 0.2 },
    "orbs.motion": "reduced",
    "orbs.subjectColors": { Secret: "#ef4444", Password: "#22c55e", Maths: "#3b82f6" },
    "orbs.learn.ui": { sort: "subject", fold: { Auth: true, Token: false } },
    "orbs.ai.panel": "0",
    "orbs.ai.voice": "nova",
    "orbs.ai.voiceplay": "1",
    "orbs.ai.mode": "deep",
    "orbs.ai.tags": { trigger: "#", favorites: ["reviser", "secret"] },
    "orbs.aiorb.pos": { x: 12, y: 80 },
    "orbs.aiorb.prefs": { hidden: false, size: "m", style: "glass" },
    "orbs.legacy.declined": "2026-11-01T10:00:00.000Z",
  };

  it("chaque donnée du catalogue est exportée À L'IDENTIQUE, rien n'est retiré", () => {
    // Le jeu de données couvre bien tout le catalogue.
    expect(Object.keys(realistic).sort()).toEqual(Object.keys(LOCAL_DATA_CATALOG).sort());
    for (const [k, v] of Object.entries(realistic)) set(A, k, v);

    const local = collectLocalData(browser.localStorage, A);
    expect(local.elementsRetires).toEqual([]);
    expect(local.elements).toBe(Object.keys(realistic).length);

    expect(local.agenda).toEqual(realistic["orbs.agenda.v1"]);
    expect(local.notes).toEqual(realistic["orbs.grades.v1"]);
    expect(local.apprendre).toEqual(realistic["orbs.learn.v1"]);
    expect(local.conversationsIA).toEqual(realistic["orbs.ai.v2"]);
    expect(local.brouillonJournal).toEqual(realistic["orbs:draft:new"]);
    const prefs = local.preferences as Record<string, unknown>;
    expect(prefs.couleursMatieres).toEqual(realistic["orbs.subjectColors"]);
    expect(prefs.affichageApprendre).toEqual(realistic["orbs.learn.ui"]);
    expect(prefs.animationsReduites).toBe("reduced");
  });

  it("une clé FUTURE inconnue contenant des données personnelles est exportée intégralement", () => {
    const future = {
      notes: [{ titre: "Révisions", auteur: "moi", author: "me", pinned: true }],
      sessions: [{ debut: "2026-11-20T10:00:00Z", minutes: 25 }],
      tokens: 532, // compteur d'usage de l'IA, pas un secret
      keyboardLayout: "azerty",
      postalCode: "75011",
      rememberPassword: true, // un simple réglage vrai/faux ne cache rien
      apiKey: "", // vide : rien à cacher
    };
    set(A, "orbs.notes.v2", future);
    set(A, "orbs.cle.future", "valeur future");

    const local = collectLocalData(browser.localStorage, A);
    expect(local.elementsRetires).toEqual([]);
    const autres = local.autres as Record<string, unknown>;
    expect(autres["orbs.notes.v2"]).toEqual(future);
    expect(autres["orbs.cle.future"]).toBe("valeur future");
  });

  it("un texte qui PARLE d'un secret est conservé ; seule une valeur qui EST un secret est retirée", () => {
    set(A, "orbs:draft:new", { content: `Mon cookie de session ressemblait à « eyJ… » et mon token était expiré.` });
    const local = collectLocalData(browser.localStorage, A);
    expect(local.elementsRetires).toEqual([]);
    expect((local.brouillonJournal as { content: string }).content).toContain("token était expiré");
  });

  it("des noms comme « constructor » ou « __proto__ » restent des données ordinaires", () => {
    set(A, "constructor", "valeur 1");
    set(A, "orbs.future", JSON.parse('{"__proto__": {"note": "gardée"}, "toString": "x"}'));
    const local = collectLocalData(browser.localStorage, A);
    const autres = local.autres as Record<string, unknown>;
    expect(autres.constructor).toBe("valeur 1");
    const future = autres["orbs.future"] as Record<string, unknown>;
    expect(Object.prototype.hasOwnProperty.call(future, "__proto__")).toBe(true);
    expect(JSON.stringify(local)).toContain('"note":"gardée"');
    expect(({} as Record<string, unknown>).note).toBeUndefined(); // aucune pollution globale
  });
});

// ---------------------------------------------------------------------------
describe("moyens de connexion et clés techniques EXCLUS", () => {
  it("une clé future dont le NOM désigne un secret n'est pas exportée, et c'est indiqué", () => {
    set(A, "orbs.auth.v1", { user: "eleve", accessToken: OPAQUE_TOKEN });
    set(A, "orbs.calendar.refreshToken", OPAQUE_TOKEN);
    set(A, "orbs.sync.apiKey", OPAQUE_TOKEN);
    set(A, "orbs.journal.pin", "1234-pin");
    set(A, "orbs.session.cookie", OPAQUE_TOKEN);
    set(A, "orbs.notes.v2", { titre: "gardé" });

    const local = collectLocalData(browser.localStorage, A);
    const blob = JSON.stringify(local.autres);
    expect(blob).not.toContain(OPAQUE_TOKEN);
    expect(blob).not.toContain("1234-pin");
    expect((local.autres as Record<string, unknown>)["orbs.notes.v2"]).toEqual({ titre: "gardé" });

    const retires = local.elementsRetires.map((e) => e.donnee).sort();
    expect(retires).toEqual(
      ["orbs.auth.v1", "orbs.calendar.refreshToken", "orbs.journal.pin", "orbs.session.cookie", "orbs.sync.apiKey"].sort(),
    );
    expect(local.elementsRetires.every((e) => e.raison === EXCLUSION_REASON.secret)).toBe(true);
    expect(local.elements).toBe(1);
  });

  it("dans une clé future, seuls les CHAMPS sensibles sont retirés ; le reste est gardé", () => {
    set(A, "orbs.calendar.v1", {
      events: [{ title: "Contrôle", date: "2026-12-03" }],
      sync: { provider: "agenda-scolaire", accessToken: OPAQUE_TOKEN, refresh_token: OPAQUE_TOKEN, expiresAt: 1_800_000_000 },
      pin: "1234-pin",
      pinned: true,
      password: "hunter2-mdp",
      motDePasse: "hunter2-mdp",
      familyCode: "ABCD-FAMILLE",
      credentials: { user: "eleve", pass: "hunter2-mdp" },
      usage: { tokens: 1200 },
    });

    const local = collectLocalData(browser.localStorage, A);
    const cal = (local.autres as Record<string, unknown>)["orbs.calendar.v1"];
    expect(cal).toEqual({
      events: [{ title: "Contrôle", date: "2026-12-03" }],
      sync: { provider: "agenda-scolaire", expiresAt: 1_800_000_000 },
      pinned: true,
      usage: { tokens: 1200 },
    });
    expect(local.elementsRetires.map((e) => e.donnee).sort()).toEqual(
      [
        "orbs.calendar.v1 › credentials",
        "orbs.calendar.v1 › familyCode",
        "orbs.calendar.v1 › motDePasse",
        "orbs.calendar.v1 › password",
        "orbs.calendar.v1 › pin",
        "orbs.calendar.v1 › sync › accessToken",
        "orbs.calendar.v1 › sync › refresh_token",
      ].sort(),
    );
  });

  it("une valeur au FORMAT secret est retirée partout, même dans une donnée du catalogue", () => {
    set(A, "orbs.agenda.v1", {
      homework: [
        { id: "h1", title: "Maths" },
        { id: "h2", title: JWT },
      ],
      note: `Bearer ${OPAQUE_TOKEN}-long`,
    });
    set(A, "orbs.future.v1", { list: ["gardé", STRIPE_KEY, OPENAI_KEY], cle: PEM, cookie2: `orbs_session=${JWT}` });

    const local = collectLocalData(browser.localStorage, A);
    const blob = JSON.stringify(local);
    for (const s of [JWT, STRIPE_KEY, OPENAI_KEY, "MIIBVQIBADANBgkqhkiG9w0BAQEFAAS", OPAQUE_TOKEN]) {
      expect(blob).not.toContain(s);
    }
    expect(local.agenda).toEqual({ homework: [{ id: "h1", title: "Maths" }, { id: "h2" }] });
    expect((local.autres as Record<string, unknown>)["orbs.future.v1"]).toEqual({ list: ["gardé"] });
    expect(local.elementsRetires).toHaveLength(6);
  });

  it("l'archive complète (serveur + appareil) ne contient aucun des secrets de l'appareil", () => {
    set(A, "orbs.agenda.v1", { homework: [{ id: "h1", title: "Physique" }] });
    set(A, "orbs.auth.v1", { token: OPAQUE_TOKEN });
    set(A, "orbs.calendar.v1", { events: [], password: "hunter2-mdp", item: JWT });
    setActiveUser(A);

    const built = buildFullExport({ compte: { id: A } }, browser.localStorage, A);
    expect(built.ok).toBe(true);
    const blob = JSON.stringify(built.ok ? built.archive : null);
    for (const s of SECRET_STRINGS) expect(blob).not.toContain(s);
    expect(blob).toContain("Physique");
    expect(blob).toContain("elementsRetires");
  });

  it("une structure anormalement profonde n'est pas recopiée sans vérification", () => {
    let deep: unknown = { fond: "x" };
    for (let i = 0; i < MAX_FILTER_DEPTH + 10; i++) deep = { n: deep };
    set(A, "orbs.future.deep", deep);
    const local = collectLocalData(browser.localStorage, A);
    expect(local.elementsRetires.some((e) => e.raison === EXCLUSION_REASON.tooDeep)).toBe(true);
    expect(JSON.stringify(local)).not.toContain('"fond"');
  });
});

// ---------------------------------------------------------------------------
describe("données d'un AUTRE compte jamais exportées", () => {
  it("l'espace d'un autre compte (même rempli de données) n'apparaît jamais", () => {
    set(A, "orbs.agenda.v1", { owner: "A" });
    set(B, "orbs.agenda.v1", { owner: "B-secret-de-b" });
    set(B, "orbs.notes.v2", { owner: "B-secret-de-b" });
    const local = collectLocalData(browser.localStorage, A);
    expect(JSON.stringify(local)).not.toContain("B-secret-de-b");
    expect(JSON.stringify(local)).not.toContain(B);
  });

  it("une clé rangée sous le nom d'un autre espace, même DANS l'espace du compte, est exclue", () => {
    // Écriture anormale : la clé de B a été recopiée dans l'espace de A.
    set(A, `orbs.user.${B}:orbs.agenda.v1`, { owner: "B-secret-de-b" });
    set(A, "orbs.device.activeUser", B);
    const local = collectLocalData(browser.localStorage, A);
    expect(JSON.stringify(local)).not.toContain("B-secret-de-b");
    expect(local.elementsRetires.map((e) => e.raison)).toEqual([
      EXCLUSION_REASON.foreign,
      EXCLUSION_REASON.foreign,
    ]);
    expect(local.elements).toBe(0);
  });

  it("anciennes données : exportées seulement si attribuées à CE compte, filtrées elles aussi", () => {
    browser.localStorage.setItem("orbs.agenda.v1", JSON.stringify({ title: "marqueur-ancien-xyz", token: JWT }));
    browser.localStorage.setItem("orbs.grades.v1", JSON.stringify({ grades: [{ value: 12 }] }));

    browser.localStorage.setItem(LEGACY_STATUS_KEY, `owner:${B}`);
    expect(JSON.stringify(collectLocalData(browser.localStorage, A))).not.toContain("marqueur-ancien-xyz");

    browser.localStorage.setItem(LEGACY_STATUS_KEY, "orphan");
    expect(JSON.stringify(collectLocalData(browser.localStorage, A))).not.toContain("marqueur-ancien-xyz");

    browser.localStorage.setItem(LEGACY_STATUS_KEY, `owner:${A}`);
    const mine = collectLocalData(browser.localStorage, A);
    const blob = JSON.stringify(mine);
    expect(blob).toContain("marqueur-ancien-xyz");
    expect(blob).not.toContain(JWT); // valeur au format secret, retirée
    expect(mine.elementsRetires[0].donnee).toContain("anciennes données");
  });
});

// ---------------------------------------------------------------------------
describe("règles de détection", () => {
  it("noms sensibles reconnus", () => {
    for (const n of [
      "token", "accessToken", "refresh_token", "id_token", "x-auth-token", "authToken", "jwt",
      "password", "Mot_De_Passe", "motDePasse", "mdp", "passwd", "passcode", "secret", "clientSecret",
      "apiKey", "API_KEY", "APIKEY", "privateKey", "accessKey", "cléAPI", "credentials", "cookie",
      "csrfToken", "otp", "auth", "oauth2", "Authorization", "pin", "pinCode", "sessionId",
      "session_token", "sessionKey", "familyCode", "verificationCode", "resetCode", "bearer",
    ]) {
      expect(sensitiveName(n), n).not.toBeNull();
    }
  });

  it("noms ordinaires non confondus avec des secrets", () => {
    for (const n of [
      "author", "authorName", "pinned", "spinner", "keyboard", "monkey", "key", "code", "postalCode",
      "sessions", "studySessionId", "session", "description", "title", "subject", "compass",
      "passage", "orbs.cle.future", "orbs.focus", "orbs:draft:new", "orbs.legacy.declined",
    ]) {
      expect(sensitiveName(n), n).toBeNull();
    }
    // « tokens » seul : un nombre associé n'est qu'un compteur.
    expect(sensitiveName("tokens")).toEqual({ countSafe: true });
  });

  it("aucune clé du catalogue relu n'a un nom sensible ni un nom d'autre espace", () => {
    for (const key of Object.keys(LOCAL_DATA_CATALOG)) {
      expect(sensitiveName(key), key).toBeNull();
      const ex: LocalExclusion[] = [];
      expect(filterLocalEntry(key, "x", { reviewed: false, exclusions: ex }).keep, key).toBe(true);
    }
  });

  it("formats de secrets reconnus ; textes ordinaires épargnés", () => {
    for (const s of [JWT, STRIPE_KEY, OPENAI_KEY, PEM, `Bearer ${OPAQUE_TOKEN}`, "whsec_abcdefghijklmnop",
      "xkeysib-" + "a".repeat(30), "ghp_" + "a".repeat(36), "AKIA" + "ABCDEFGHIJKLMNOP", "AIza" + "a".repeat(35),
      `orbs_session=${JWT}; Path=/`]) {
      expect(looksLikeSecretValue(s), s.slice(0, 20)).toBe(true);
    }
    for (const s of ["Bonjour", "sk-court", "eyJ tout seul", "Le jeton Bearer sert à s'authentifier.",
      "#ef4444", "2026-11-22T10:00:00.000Z", "Maths", "sk_live_", ""]) {
      expect(looksLikeSecretValue(s), s).toBe(false);
    }
  });
});
