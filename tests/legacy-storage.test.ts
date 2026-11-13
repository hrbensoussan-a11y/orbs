import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { installBrowser, type FakeBrowser } from "./helpers/browser";
import {
  setActiveUser,
  readUserItem,
  writeUserItem,
  userKey,
} from "@/lib/userStorage";
import {
  LEGACY_KEYS,
  LEGACY_STATUS_KEY,
  LEGACY_DECLINED_KEY,
  legacyKeysPresent,
  readLegacyStatus,
  resolveLegacy,
  claimLegacy,
  mergeLegacy,
  describeLegacy,
  legacyOffer,
  declineLegacy,
  acceptLegacy,
} from "@/lib/legacyStorage";
import { loadAgenda, emptyAgenda } from "@/lib/agenda/store";
import { loadGrades } from "@/lib/grades/store";
import { load as loadLearn, defaultState } from "@/lib/learn/store";
import { readAppearance } from "@/lib/appearance";

// Anciennes données locales (clés globales d'avant le cloisonnement) :
// continuité pour une session antérieure à la mise à jour, question « Oui /
// Non » sinon, fusion sans perte, et jamais de suppression silencieuse.

const A = "cmuseraaaa0001";
const B = "cmuserbbbb0002";

let browser: FakeBrowser;

function seedLegacy(): Record<string, string> {
  const legacy: Record<string, string> = {
    "orbs.agenda.v1": JSON.stringify({
      version: 1,
      homework: [{ id: "h_old", title: "Ancien devoir", subject: "Maths", due: "2026-11-20", done: false }],
      courses: [{ id: "c_old", day: 0, start: "08:00", end: "09:00", subject: "Ancien cours" }],
    }),
    "orbs.grades.v1": JSON.stringify({
      version: 1,
      grades: [{ id: "g_old", subject: "Maths", label: "Ancienne note", value: 12, coef: 1, outOf: 20, date: "2026-10-01" }],
    }),
    "orbs.learn.v1": JSON.stringify({
      ...defaultState(),
      decks: { d_old: { id: "d_old", name: "Ancien paquet", subject: "SVT", fav: false, created: 1, updated: 1, kind: "definitions", cards: [] } },
      stats: { ...defaultState().stats, xp: 100, reviews: 7, journal: { "2026-11-01": 3 } },
    }),
    "orbs.ai.v2": JSON.stringify({ version: 3, threads: { Maths: [{ role: "user", content: "secret" }] }, convs: [{ id: "cv_old", title: "Ancienne conversation", messages: [] }] }),
    "orbs:draft:new": JSON.stringify({ title: "Brouillon", content: "Ancien brouillon intime" }),
    "orbs.appearance": JSON.stringify({ theme: "dark", bg: "ocean", dim: 0.5 }),
    "orbs.subjectColors": JSON.stringify({ Maths: "#ff0000", SVT: "#00ff00" }),
    "orbs.ai.voice": "nova",
  };
  for (const [k, v] of Object.entries(legacy)) browser.localStorage.setItem(k, v);
  return legacy;
}

beforeEach(() => {
  browser = installBrowser();
  setActiveUser(null);
});

afterEach(() => {
  setActiveUser(null);
  vi.unstubAllGlobals();
});

describe("Décision au chargement (resolveLegacy)", () => {
  it("appareil sans anciennes données : aucun statut n'est écrit", () => {
    resolveLegacy(A, "ask");
    resolveLegacy(A, "continuity");
    expect(browser.localStorage.getItem(LEGACY_STATUS_KEY)).toBeNull();
    expect(readLegacyStatus()).toEqual({ kind: "none" });
  });

  it("continuité : la session datait d'avant la mise à jour, les données suivent l'élève sans question", () => {
    const legacy = seedLegacy();
    setActiveUser(A);
    resolveLegacy(A, "continuity");

    expect(legacyKeysPresent()).toEqual([]);
    expect(readLegacyStatus()).toEqual({ kind: "none" }); // tout est déplacé, statut refermé
    expect(loadAgenda().homework[0].title).toBe("Ancien devoir");
    expect(loadGrades().grades[0].label).toBe("Ancienne note");
    expect(loadLearn().stats.xp).toBe(100);
    expect(readAppearance().theme).toBe("dark");
    expect(readUserItem("orbs.ai.v2")).toBe(legacy["orbs.ai.v2"]);
    expect(readUserItem("orbs.ai.voice")).toBe("nova");
    // Et plus rien à proposer à qui que ce soit.
    expect(legacyOffer(A)).toBeNull();
  });

  it("sans session antérieure : rien n'est rattaché, les données passent en attente de confirmation", () => {
    const legacy = seedLegacy();
    resolveLegacy(null, "ask"); // écran de connexion
    expect(readLegacyStatus()).toEqual({ kind: "orphan" });

    setActiveUser(A);
    resolveLegacy(A, "ask"); // première connexion APRÈS la mise à jour
    expect(readLegacyStatus()).toEqual({ kind: "orphan" });
    expect(loadAgenda()).toEqual(emptyAgenda());
    for (const [k, v] of Object.entries(legacy)) expect(browser.localStorage.getItem(k)).toBe(v);
  });

  it("espace parent (ignore) : ne décide rien, ne voit rien", () => {
    const legacy = seedLegacy();
    setActiveUser(B);
    resolveLegacy(B, "ignore");
    expect(readLegacyStatus()).toEqual({ kind: "none" });
    for (const [k, v] of Object.entries(legacy)) expect(browser.localStorage.getItem(k)).toBe(v);
  });

  it("un déplacement interrompu reprend pour le MÊME compte, et jamais pour un autre", () => {
    seedLegacy();
    browser.localStorage.setItem(LEGACY_STATUS_KEY, `owner:${A}`);

    // B passe : rien ne bouge, rien ne lui est proposé.
    setActiveUser(B);
    resolveLegacy(B, "ask");
    expect(legacyKeysPresent().length).toBeGreaterThan(0);
    expect(loadAgenda()).toEqual(emptyAgenda());
    expect(legacyOffer(B)).toBeNull();

    // A revient : la reprise se termine.
    setActiveUser(A);
    resolveLegacy(A, "ask");
    expect(legacyKeysPresent()).toEqual([]);
    expect(loadAgenda().homework[0].title).toBe("Ancien devoir");
    expect(readLegacyStatus()).toEqual({ kind: "none" });
  });

  it("un statut illisible retombe sur le cas le plus prudent (confirmation)", () => {
    seedLegacy();
    browser.localStorage.setItem(LEGACY_STATUS_KEY, "owner:a:b/../c");
    expect(readLegacyStatus()).toEqual({ kind: "orphan" });
    browser.localStorage.setItem(LEGACY_STATUS_KEY, "n'importe quoi");
    expect(readLegacyStatus()).toEqual({ kind: "orphan" });
    setActiveUser(A);
    resolveLegacy(A, "continuity");
    expect(loadAgenda()).toEqual(emptyAgenda()); // pas de rattachement automatique
  });
});

describe("Question posée à l'élève (legacyOffer / accept / decline)", () => {
  beforeEach(() => {
    seedLegacy();
    resolveLegacy(null, "ask");
    setActiveUser(A);
  });

  it("décrit uniquement des quantités, jamais le contenu", () => {
    const items = describeLegacy();
    expect(items).toEqual([
      "1 devoir",
      "1 cours à l'emploi du temps",
      "1 note",
      "1 paquet de révision",
      "2 conversations avec l'assistant",
      "1 brouillon de journal",
    ]);
    const text = items.join(" ");
    expect(text).not.toContain("Ancien");
    expect(text).not.toContain("secret");
  });

  it("« Oui » : les données rejoignent le compte, la question disparaît pour tout le monde", () => {
    expect(legacyOffer(A)).not.toBeNull();
    const res = acceptLegacy(A);
    expect(res.left).toEqual([]);
    expect(res.moved.length).toBeGreaterThan(0);

    expect(loadAgenda().homework[0].title).toBe("Ancien devoir");
    expect(legacyKeysPresent()).toEqual([]);
    expect(legacyOffer(A)).toBeNull();
    setActiveUser(B);
    expect(legacyOffer(B)).toBeNull();
    expect(loadAgenda()).toEqual(emptyAgenda()); // B n'a rien reçu
  });

  it("« Non » : rien ne bouge, on ne redemande pas à ce compte, un autre compte peut encore dire oui", () => {
    declineLegacy();
    expect(legacyOffer(A)).toBeNull();
    expect(readUserItem(LEGACY_DECLINED_KEY)).not.toBeNull();
    expect(legacyKeysPresent().length).toBeGreaterThan(0);
    expect(loadAgenda()).toEqual(emptyAgenda());

    setActiveUser(B);
    expect(legacyOffer(B)).not.toBeNull();
    acceptLegacy(B);
    expect(loadAgenda().homework[0].title).toBe("Ancien devoir");
    setActiveUser(A);
    expect(loadAgenda()).toEqual(emptyAgenda());
  });

  it("accepter n'est possible que pour le compte actif et des données en attente", () => {
    setActiveUser(B);
    expect(acceptLegacy(A)).toEqual({ moved: [], left: [] }); // mauvais compte
    setActiveUser(A);
    acceptLegacy(A);
    expect(acceptLegacy(A)).toEqual({ moved: [], left: [] }); // plus rien en attente
  });

  it("des réglages seuls (apparence, voix…) ne valent pas une question", () => {
    browser.localStorage.clear();
    browser.localStorage.setItem("orbs.appearance", JSON.stringify({ theme: "dark" }));
    browser.localStorage.setItem("orbs.ai.voice", "nova");
    resolveLegacy(null, "ask");
    expect(legacyOffer(A)).toBeNull();
  });
});

describe("Fusion sans perte quand le compte a déjà des données", () => {
  beforeEach(() => {
    setActiveUser(A);
  });

  it("agenda, notes : réunion par identifiant, les éléments du compte d'abord", () => {
    writeUserItem("orbs.agenda.v1", JSON.stringify({ version: 1, homework: [{ id: "h_new", title: "Nouveau devoir", subject: "SVT", due: "2026-11-21", done: false }], courses: [] }));
    writeUserItem("orbs.grades.v1", JSON.stringify({ version: 1, grades: [{ id: "g_old", subject: "Maths", label: "Déjà là", value: 18, coef: 1, outOf: 20, date: "2026-11-01" }] }));
    seedLegacy();
    claimLegacy(A);

    const agenda = loadAgenda();
    expect(agenda.homework.map((h) => h.id)).toEqual(["h_new", "h_old"]);
    expect(agenda.courses.map((c) => c.id)).toEqual(["c_old"]);
    // Même identifiant : la version du compte gagne, rien n'est dupliqué.
    const grades = loadGrades();
    expect(grades.grades).toHaveLength(1);
    expect(grades.grades[0].label).toBe("Déjà là");
  });

  it("Apprendre : paquets réunis, compteurs additionnés, journal cumulé", () => {
    const mine = defaultState();
    mine.decks = { d_new: { id: "d_new", name: "Mon paquet", subject: "Maths", fav: true, created: 5, updated: 5, kind: "definitions", cards: [] } };
    mine.stats = { ...mine.stats, xp: 50, reviews: 2, streak: 4, lastDay: "2026-11-12", journal: { "2026-11-01": 2, "2026-11-12": 5 } };
    writeUserItem("orbs.learn.v1", JSON.stringify(mine));
    seedLegacy();
    claimLegacy(A);

    const learn = loadLearn();
    expect(Object.keys(learn.decks).sort()).toEqual(["d_new", "d_old"]);
    expect(learn.stats.xp).toBe(150);
    expect(learn.stats.reviews).toBe(9);
    expect(learn.stats.streak).toBe(4);
    expect(learn.stats.journal).toEqual({ "2026-11-01": 5, "2026-11-12": 5 });
  });

  it("brouillon : les deux textes sont conservés ; réglages : ceux du compte gagnent", () => {
    writeUserItem("orbs:draft:new", JSON.stringify({ title: "", content: "Mon brouillon" }));
    writeUserItem("orbs.appearance", JSON.stringify({ theme: "warm", bg: "mint", dim: 0 }));
    writeUserItem("orbs.subjectColors", JSON.stringify({ Maths: "#111111" }));
    seedLegacy();
    claimLegacy(A);

    const draft = JSON.parse(readUserItem("orbs:draft:new") as string);
    expect(draft.content).toContain("Mon brouillon");
    expect(draft.content).toContain("Ancien brouillon intime");
    expect(readAppearance().theme).toBe("warm");
    expect(JSON.parse(readUserItem("orbs.subjectColors") as string)).toEqual({ Maths: "#111111", SVT: "#00ff00" });
  });

  it("conversations IA : fils par matière mis bout à bout, discussions réunies", () => {
    writeUserItem("orbs.ai.v2", JSON.stringify({ version: 3, threads: { Maths: [{ role: "user", content: "récent" }] }, convs: [{ id: "cv_new", title: "Ma discussion", messages: [] }] }));
    seedLegacy();
    claimLegacy(A);
    const ai = JSON.parse(readUserItem("orbs.ai.v2") as string);
    expect(ai.threads.Maths.map((m: { content: string }) => m.content)).toEqual(["secret", "récent"]);
    expect(ai.convs.map((c: { id: string }) => c.id).sort()).toEqual(["cv_new", "cv_old"]);
  });

  it("mergeLegacy ne jette jamais sur des données corrompues", () => {
    for (const key of LEGACY_KEYS) {
      expect(() => mergeLegacy(key, "{pas du json", '{"aussi": "cassé"')).not.toThrow();
    }
  });
});

describe("Aucune perte silencieuse", () => {
  it("si l'écriture échoue (stockage plein), les données restent où elles sont et le déplacement se retentera", () => {
    const legacy = seedLegacy();
    setActiveUser(A);
    browser.localStorage.failWrites = true;
    const res = claimLegacy(A);
    expect(res.moved).toEqual([]);
    expect(res.left.length).toBe(Object.keys(legacy).length);
    for (const [k, v] of Object.entries(legacy)) expect(browser.localStorage.getItem(k)).toBe(v);

    browser.localStorage.failWrites = false;
    const retry = claimLegacy(A);
    expect(retry.left).toEqual([]);
    expect(loadAgenda().homework[0].title).toBe("Ancien devoir");
  });

  it("le rattachement ne touche à rien d'autre que les anciennes clés et l'espace du compte", () => {
    setActiveUser(B);
    writeUserItem("orbs.agenda.v1", JSON.stringify({ version: 1, homework: [{ id: "h_b", title: "Devoir de B", subject: "Maths", due: "2026-11-20", done: false }], courses: [] }));
    seedLegacy();
    const ofB = browser.localStorage.getItem(userKey(B, "orbs.agenda.v1"));

    setActiveUser(A);
    claimLegacy(A);
    expect(browser.localStorage.getItem(userKey(B, "orbs.agenda.v1"))).toBe(ofB);
  });
});
