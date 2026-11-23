import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import vm from "node:vm";
import { installBrowser, type FakeBrowser } from "./helpers/browser";
import {
  USER_PREFIX,
  ACTIVE_USER_KEY,
  setActiveUser,
  getActiveUser,
  userKey,
  isValidUserId,
  readUserItem,
  writeUserItem,
  removeUserItem,
} from "@/lib/userStorage";
import { LEGACY_KEYS, legacyKeysPresent } from "@/lib/legacyStorage";
import { loadAgenda, saveAgenda, emptyAgenda, type AgendaState } from "@/lib/agenda/store";
import { loadGrades, saveGrades, emptyGrades } from "@/lib/grades/store";
import { load as loadLearn, save as saveLearn, defaultState, createDeck, isPristine } from "@/lib/learn/store";
import { loadNotifSettings, saveNotifSettings, defaultNotifSettings } from "@/lib/agenda/notifications";
import { loadTagPrefs, saveTagPrefs } from "@/lib/ai/tags";
import { loadSubjectColors, saveSubjectColors } from "@/lib/subjectColors";
import { loadFocus, saveFocus, awardFocusSession } from "@/lib/learn/focus";
import {
  APPEARANCE_INIT,
  APPEARANCE_KEY,
  MOTION_KEY,
  readAppearance,
  saveAppearance,
  saveReducedMotion,
  readReducedMotion,
  applyStoredAppearance,
  DEFAULT_APPEARANCE,
} from "@/lib/appearance";

// Isolation des données locales entre comptes (lib/userStorage).
//
// Avant ce lot, tout vivait sous des clés globales à l'appareil : le compte
// suivant lisait les données du précédent. Ces tests passent par les VRAIS
// magasins (agenda, notes, Apprendre, rappels, IA…) pour vérifier ce que
// voit réellement chaque compte, pas seulement la couche de clés.

const A = "cmuseraaaa0001";
const B = "cmuserbbbb0002";

// Clés des données écrites directement par des composants (pas de magasin).
const AI_STORE = "orbs.ai.v2";
const DRAFT = "orbs:draft:new";

// Clés écrites par `fillEverything` (une par domaine de données).
const FILLED_KEYS = [
  "orbs.agenda.v1",
  "orbs.grades.v1",
  "orbs.learn.v1",
  "orbs.agenda.notif.v1",
  "orbs.ai.tags",
  "orbs.subjectColors",
  "orbs.focus",
  "orbs.appearance",
  "orbs.motion",
  AI_STORE,
  DRAFT,
];

let browser: FakeBrowser;

/** Remplit tous les espaces locaux du compte actif avec des données marquées. */
function fillEverything(tag: string): void {
  saveAgenda({
    ...emptyAgenda(),
    homework: [{ id: `h_${tag}`, title: `Devoir de ${tag}`, subject: "Maths", due: "2026-11-20", done: false }],
    courses: [{ id: `c_${tag}`, day: 0, start: "08:00", end: "09:00", subject: `Cours de ${tag}` }],
  });
  saveGrades({
    ...emptyGrades(),
    grades: [{ id: `g_${tag}`, subject: "Maths", label: `DS de ${tag}`, value: 15, coef: 1, outOf: 20, date: "2026-11-10" }],
  });
  const learn = defaultState();
  createDeck(learn, `Paquet de ${tag}`, "Maths", "definitions", [{ t: "terme", d: "définition" }]);
  learn.stats.xp = 120;
  saveLearn(learn);
  saveNotifSettings({ ...defaultNotifSettings(), enabled: true, leadMin: 30 });
  saveTagPrefs({ trigger: "/", favorites: [] });
  saveSubjectColors({ Maths: `#${tag === "A" ? "aa0000" : "0000bb"}` });
  saveFocus({ ...loadFocus(), workMin: tag === "A" ? 40 : 50 });
  saveAppearance({ theme: "dark", bg: "ocean", dim: 0.4 });
  saveReducedMotion(true);
  writeUserItem(AI_STORE, JSON.stringify({ version: 3, threads: {}, convs: [{ id: "1", title: `Confidence de ${tag}`, messages: [] }] }));
  writeUserItem(DRAFT, JSON.stringify({ title: "", content: `Journal intime de ${tag}` }));
}

/** Ce que voit le compte actif, tous magasins confondus (sérialisé). */
function everythingVisible(): string {
  return JSON.stringify({
    agenda: loadAgenda(),
    grades: loadGrades(),
    learn: loadLearn(),
    notif: loadNotifSettings(),
    tags: loadTagPrefs(),
    colors: loadSubjectColors(),
    focus: loadFocus().workMin,
    appearance: readAppearance(),
    motion: readReducedMotion(),
    ai: readUserItem(AI_STORE),
    draft: readUserItem(DRAFT),
  });
}

beforeEach(() => {
  browser = installBrowser();
  setActiveUser(null);
});

afterEach(() => {
  setActiveUser(null);
  vi.unstubAllGlobals();
});

describe("Isolation des données locales par compte", () => {
  it("1. le compte A ne peut pas lire les données du compte B", () => {
    setActiveUser(B);
    fillEverything("B");

    setActiveUser(A);
    expect(loadAgenda()).toEqual(emptyAgenda());
    expect(loadGrades()).toEqual(emptyGrades());
    expect(isPristine(loadLearn())).toBe(true);
    expect(loadNotifSettings()).toEqual(defaultNotifSettings());
    expect(loadTagPrefs()).toEqual({ trigger: "#", favorites: [] });
    expect(loadSubjectColors()).toEqual({});
    expect(loadFocus().workMin).toBe(25);
    expect(readAppearance()).toEqual(DEFAULT_APPEARANCE);
    expect(readReducedMotion()).toBe(false);
    expect(readUserItem(AI_STORE)).toBeNull();
    expect(readUserItem(DRAFT)).toBeNull();
    // Rien de ce que voit A ne contient la moindre trace de B.
    expect(everythingVisible()).not.toContain("de B");
  });

  it("2. après déconnexion, les données du compte précédent ne sont plus accessibles", () => {
    setActiveUser(A);
    fillEverything("A");

    setActiveUser(null); // déconnexion : plus de compte actif

    expect(getActiveUser()).toBeNull();
    expect(loadAgenda()).toEqual(emptyAgenda());
    expect(loadGrades()).toEqual(emptyGrades());
    expect(isPristine(loadLearn())).toBe(true);
    expect(readUserItem(AI_STORE)).toBeNull();
    expect(readUserItem(DRAFT)).toBeNull();
    expect(everythingVisible()).not.toContain("de A");
  });

  it("2 bis. hors compte, rien n'est écrit : ni dans un compte, ni sous une clé globale", () => {
    setActiveUser(A);
    fillEverything("A");
    const before = browser.localStorage.snapshot();

    setActiveUser(null);
    const homework: AgendaState = {
      ...emptyAgenda(),
      homework: [{ id: "h_x", title: "Écrit hors compte", subject: "Maths", due: "2026-11-20", done: false }],
    };
    saveAgenda(homework);
    saveGrades(emptyGrades());
    saveLearn(defaultState());
    saveSubjectColors({ Maths: "#123456" });
    saveAppearance({ theme: "warm", bg: "mint", dim: 1 });
    awardFocusSession();
    expect(writeUserItem(DRAFT, "texte")).toBe(false);
    removeUserItem(AI_STORE);

    // Le stockage est strictement identique : A n'a rien perdu, rien n'a fui.
    expect(browser.localStorage.snapshot()).toEqual(before);
  });

  it("3. le compte A retrouve ses propres données après reconnexion", () => {
    setActiveUser(A);
    fillEverything("A");
    const mine = everythingVisible();

    setActiveUser(null); // déconnexion
    setActiveUser(A); // reconnexion du même compte

    expect(everythingVisible()).toBe(mine);
    expect(loadAgenda().homework[0].title).toBe("Devoir de A");
    expect(readUserItem(DRAFT)).toContain("Journal intime de A");
  });

  it("4. un changement de compte ne mélange jamais les données", () => {
    setActiveUser(A);
    fillEverything("A");
    const ofA = everythingVisible();

    setActiveUser(B); // B se connecte sur le même appareil
    fillEverything("B");
    const ofB = everythingVisible();
    expect(ofB).toContain("de B");
    expect(ofB).not.toContain("de A");

    // B modifie et supprime : A ne doit rien voir bouger.
    saveAgenda(emptyAgenda());
    removeUserItem(DRAFT);

    setActiveUser(A);
    expect(everythingVisible()).toBe(ofA);

    setActiveUser(B);
    expect(loadAgenda()).toEqual(emptyAgenda());
    expect(readUserItem(DRAFT)).toBeNull();
    expect(loadGrades().grades[0].label).toBe("DS de B");
  });

  it("4 bis. toute donnée écrite atterrit dans l'espace d'un compte, jamais sous une clé globale", () => {
    setActiveUser(A);
    fillEverything("A");
    setActiveUser(B);
    fillEverything("B");

    const keys = browser.localStorage.keys();
    expect(keys.length).toBeGreaterThan(0);
    for (const k of keys) {
      expect(k.startsWith(`${USER_PREFIX}${A}:`) || k.startsWith(`${USER_PREFIX}${B}:`)).toBe(true);
    }
    // Chaque donnée remplie existe deux fois : une par compte.
    for (const key of FILLED_KEYS) {
      expect(keys).toContain(userKey(A, key));
      expect(keys).toContain(userKey(B, key));
    }
    expect(keys.length).toBe(FILLED_KEYS.length * 2);
  });

  it("un identifiant de compte invalide ferme l'accès (pas d'injection dans les clés)", () => {
    for (const bad of ["", " ", "a:b", "../x", "a b", "é", "x".repeat(65), `${A}:orbs.agenda.v1`]) {
      expect(isValidUserId(bad)).toBe(false);
      setActiveUser(bad);
      expect(getActiveUser()).toBeNull();
      expect(writeUserItem("orbs.agenda.v1", "x")).toBe(false);
    }
    setActiveUser(undefined);
    expect(getActiveUser()).toBeNull();
    expect(browser.localStorage.length).toBe(0);
  });

  it("côté serveur (pas de fenêtre), rien n'est lu ni écrit", () => {
    vi.unstubAllGlobals();
    setActiveUser(A);
    expect(readUserItem("orbs.agenda.v1")).toBeNull();
    expect(writeUserItem("orbs.agenda.v1", "x")).toBe(false);
    expect(loadAgenda()).toEqual(emptyAgenda());
  });
});

describe("Anciennes données non identifiées (clés globales d'avant le cloisonnement)", () => {
  /** Simule un appareil utilisé avant la mise à jour. */
  function seedLegacy(): Record<string, string> {
    const legacy: Record<string, string> = {
      "orbs.agenda.v1": JSON.stringify({ version: 1, homework: [{ id: "h_old", title: "Ancien devoir", subject: "Maths", due: "2026-11-20", done: false }], courses: [] }),
      "orbs.grades.v1": JSON.stringify({ version: 1, grades: [{ id: "g_old", subject: "Maths", label: "Ancienne note", value: 12, coef: 1, outOf: 20, date: "2026-10-01" }] }),
      "orbs.learn.v1": JSON.stringify({ ...defaultState(), stats: { ...defaultState().stats, xp: 999 } }),
      "orbs.ai.v2": JSON.stringify({ version: 3, threads: {}, convs: [{ id: "1", title: "Ancienne conversation", messages: [] }] }),
      "orbs:draft:new": JSON.stringify({ title: "", content: "Ancien brouillon" }),
      "orbs.appearance": JSON.stringify({ theme: "dark", bg: "ocean", dim: 0.5 }),
      "orbs.motion": "reduced",
      "orbs.subjectColors": JSON.stringify({ Maths: "#ff0000" }),
    };
    for (const [k, v] of Object.entries(legacy)) browser.localStorage.setItem(k, v);
    return legacy;
  }

  it("6. aucun compte ne les voit : ni le premier connecté, ni le suivant, ni hors compte", () => {
    seedLegacy();
    for (const who of [A, B, null]) {
      setActiveUser(who);
      expect(loadAgenda()).toEqual(emptyAgenda());
      expect(loadGrades()).toEqual(emptyGrades());
      expect(isPristine(loadLearn())).toBe(true);
      expect(loadSubjectColors()).toEqual({});
      expect(readAppearance()).toEqual(DEFAULT_APPEARANCE);
      expect(readReducedMotion()).toBe(false);
      expect(readUserItem(AI_STORE)).toBeNull();
      expect(readUserItem(DRAFT)).toBeNull();
      expect(everythingVisible()).not.toMatch(/Ancien/);
    }
  });

  it("6 bis. elles ne sont ni effacées ni modifiées, quoi que fassent les comptes", () => {
    const legacy = seedLegacy();

    setActiveUser(A);
    fillEverything("A");
    saveAgenda(emptyAgenda());
    removeUserItem(DRAFT);
    removeUserItem(AI_STORE);
    setActiveUser(null);
    setActiveUser(B);
    fillEverything("B");
    removeUserItem(APPEARANCE_KEY);
    removeUserItem(MOTION_KEY);

    for (const [k, v] of Object.entries(legacy)) {
      expect(browser.localStorage.getItem(k)).toBe(v);
    }
    expect(legacyKeysPresent().sort()).toEqual(Object.keys(legacy).sort());
  });

  it("la liste des anciennes clés couvre toutes celles qu'utilisait Orbs", () => {
    expect(LEGACY_KEYS.length).toBe(19);
    expect(new Set(LEGACY_KEYS).size).toBe(19);
    // Aucune ancienne clé ne peut être confondue avec l'espace d'un compte
    // ni avec un marqueur d'appareil.
    for (const k of LEGACY_KEYS) {
      expect(k.startsWith(USER_PREFIX)).toBe(false);
      expect(k.startsWith("orbs.device.")).toBe(false);
    }
    expect(legacyKeysPresent()).toEqual([]);
  });
});

describe("Apparence par compte", () => {
  /** Exécute le script anti-flash comme le ferait le navigateur avant React. */
  function runInitScript(): { attrs: Record<string, string>; styles: Record<string, string> } {
    const attrs: Record<string, string> = {};
    const styles: Record<string, string> = {};
    const documentElement = {
      setAttribute: (k: string, v: string) => void (attrs[k] = v),
      style: { setProperty: (k: string, v: string) => void (styles[k] = v) },
    };
    vm.runInNewContext(APPEARANCE_INIT, {
      localStorage: browser.localStorage,
      document: { documentElement },
      JSON,
      String,
    });
    return { attrs, styles };
  }

  beforeEach(() => {
    setActiveUser(A);
    saveAppearance({ theme: "dark", bg: "ocean", dim: 0.4 });
    saveReducedMotion(true);
    setActiveUser(B);
    saveAppearance({ theme: "warm", bg: "mint", dim: 0.1 });
    setActiveUser(null);
    // Anciennes clés globales : ne doivent plus jamais être appliquées.
    browser.localStorage.setItem("orbs.appearance", JSON.stringify({ theme: "legacy", bg: "legacy", dim: 1 }));
    browser.localStorage.setItem("orbs.motion", "reduced");
  });

  it("le script anti-flash applique les réglages du compte actif, pas ceux d'un autre", () => {
    browser.localStorage.setItem(ACTIVE_USER_KEY, A);
    expect(runInitScript()).toEqual({
      attrs: { "data-theme": "dark", "data-bg": "ocean", "data-motion": "reduced" },
      styles: { "--dim": "0.4" },
    });

    browser.localStorage.setItem(ACTIVE_USER_KEY, B);
    expect(runInitScript()).toEqual({
      attrs: { "data-theme": "warm", "data-bg": "mint" },
      styles: { "--dim": "0.1" },
    });
  });

  it("hors compte (ou marqueur invalide), le script n'applique rien — ni compte, ni anciennes clés", () => {
    for (const marker of [null, "", "a:b", "../x", "orbs.appearance"]) {
      if (marker === null) browser.localStorage.removeItem(ACTIVE_USER_KEY);
      else browser.localStorage.setItem(ACTIVE_USER_KEY, marker);
      expect(runInitScript()).toEqual({ attrs: {}, styles: {} });
    }
  });

  it("à la déconnexion, la page revient à l'apparence par défaut", () => {
    const attrs = new Map<string, string>();
    const styles = new Map<string, string>();
    Object.assign(browser.document, {
      documentElement: {
        setAttribute: (k: string, v: string) => void attrs.set(k, v),
        removeAttribute: (k: string) => void attrs.delete(k),
        style: { setProperty: (k: string, v: string) => void styles.set(k, v) },
      },
    });

    setActiveUser(A);
    applyStoredAppearance();
    expect(Object.fromEntries(attrs)).toEqual({ "data-theme": "dark", "data-bg": "ocean", "data-motion": "reduced" });
    expect(styles.get("--dim")).toBe("0.4");

    setActiveUser(null);
    applyStoredAppearance();
    expect(Object.fromEntries(attrs)).toEqual({});
    expect(styles.get("--dim")).toBe("0");

    setActiveUser(B);
    applyStoredAppearance();
    expect(Object.fromEntries(attrs)).toEqual({ "data-theme": "warm", "data-bg": "mint" });
  });
});
