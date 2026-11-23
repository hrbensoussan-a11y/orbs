// Groupe B — B3 : intensité des révisions dans la répétition espacée (SM-2).
//
// L'intensité agit sur la DATE réelle de la prochaine révision ; l'intervalle
// SM-2 (`iv`, la mesure de mémorisation) et donc la progression, les XP et
// la série restent ceux du comportement normal.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  DEFAULT_INTENSITY,
  delayLabel,
  grade,
  mastery,
  nextInterval,
  previewInterval,
  spacedDays,
  toIntensity,
} from "@/lib/learn/sm2";
import { award } from "@/lib/learn/progress";
import { defaultState, heal, load, newCard, save } from "@/lib/learn/store";
import { newCardExampleDays } from "@/lib/learn/intensity";
import type { Card, Intensity } from "@/lib/learn/types";
import { installBrowser } from "./helpers/browser";
import { setActiveUser } from "@/lib/userStorage";

const DAY = 86_400_000;
const NOW = new Date(2026, 10, 23, 10, 0, 0).getTime();
const LEVELS: Intensity[] = ["light", "balanced", "intensive"];

function card(partial: Partial<Card> = {}): Card {
  return { ...newCard("Atome", "Plus petite partie d'un élément"), ...partial };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});
afterEach(() => vi.useRealTimers());

describe("une même carte, une même réponse, trois dates différentes", () => {
  const situations: [string, Partial<Card>, number][] = [
    ["carte neuve, « Difficile »", {}, 3],
    ["carte neuve, « Bien »", {}, 4],
    ["revue une fois, « Bien »", { reps: 1, iv: 2 }, 4],
    ["bien connue, « Facile »", { reps: 4, iv: 20, ef: 2.6 }, 5],
  ];
  for (const [name, partial, q] of situations) {
    it(name, () => {
      const due: Record<string, number> = {};
      for (const level of LEVELS) due[level] = grade(card(partial), q, level).due;
      expect(due.light).toBeGreaterThan(due.balanced);
      expect(due.balanced).toBeGreaterThan(due.intensive);
      expect(due.intensive).toBeGreaterThan(NOW);
    });
  }

  it("Équilibrée = exactement le SM-2 d'origine (aucune régression)", () => {
    for (const [partial, q] of [[{}, 3], [{}, 5], [{ reps: 1, iv: 2 }, 4], [{ reps: 3, iv: 10 }, 4]] as const) {
      const c = card(partial);
      const expected = NOW + nextInterval(card(partial), q) * DAY;
      expect(grade(c, q).due).toBe(expected);
      expect(grade(card(partial), q, "balanced").due).toBe(expected);
    }
  });

  it("exemple concret : carte revue une fois puis « Bien » → 9 j / 6 j / 4 j", () => {
    expect(LEVELS.map((l) => spacedDays(6, l))).toEqual([9, 6, 4]);
    expect(LEVELS.map(newCardExampleDays)).toEqual([9, 6, 4]);
    // Même un intervalle d'un jour reste différencié.
    expect(LEVELS.map((l) => spacedDays(1, l))).toEqual([2, 1, 0.5]);
  });

  it("l'ordre Légère > Équilibrée > Intensive tient pour tout intervalle", () => {
    for (let iv = 1; iv <= 400; iv++) {
      expect(spacedDays(iv, "light")).toBeGreaterThan(spacedDays(iv, "balanced"));
      expect(spacedDays(iv, "balanced")).toBeGreaterThan(spacedDays(iv, "intensive"));
    }
  });
});

describe("les mécanismes existants sont conservés", () => {
  it("l'intervalle SM-2, la facilité et la maîtrise ne dépendent pas de l'intensité", () => {
    const results = LEVELS.map((l) => grade(card({ reps: 2, iv: 6, ef: 2.5 }), 4, l));
    for (const r of results) {
      expect(r.iv).toBe(results[0].iv);
      expect(r.ef).toBe(results[0].ef);
      expect(r.reps).toBe(3);
      expect(mastery(r)).toBe(mastery(results[0]));
    }
  });

  it("une erreur reste revue tout de suite, quelle que soit l'intensité", () => {
    for (const l of LEVELS) {
      const c = grade(card({ reps: 3, iv: 12 }), 1, l);
      expect(c.reps).toBe(0);
      expect(c.lapses).toBe(1);
      expect(c.due).toBe(NOW + 60_000);
    }
  });

  it("XP et série identiques quelle que soit l'intensité", () => {
    const xp = LEVELS.map((l) => {
      const st = defaultState();
      st.settings.intensity = l;
      grade(card(), 4, l);
      award(st, "correct");
      return [st.stats.xp, st.stats.streak, st.stats.reviews];
    });
    expect(xp[0]).toEqual(xp[1]);
    expect(xp[1]).toEqual(xp[2]);
  });

  it("l'objectif quotidien ne change pas avec l'intensité", () => {
    const st = defaultState();
    for (const l of LEVELS) {
      st.settings.intensity = l;
      expect(st.settings.dailyGoal).toBe(20);
    }
  });
});

describe("libellés des boutons de réponse", () => {
  it("affichent le vrai délai selon l'intensité", () => {
    const c = card();
    expect(delayLabel(c, 1, "intensive")).toBe("< 1 j");
    expect(delayLabel(c, 3, "light")).toBe("2 j");
    expect(delayLabel(c, 3, "balanced")).toBe("1 j");
    expect(delayLabel(c, 3, "intensive")).toBe("12 h");
    expect(previewInterval(c, 4, "light")).toBe(3);
    // Prévisualiser ne modifie pas la carte.
    expect(c.reps).toBe(0);
    expect(c.due).toBe(0);
  });
});

describe("préférence enregistrée", () => {
  beforeEach(() => {
    installBrowser();
    setActiveUser("user_intensity");
  });
  afterEach(() => {
    setActiveUser(null);
    vi.unstubAllGlobals();
  });

  it("Équilibrée par défaut (préférence jamais choisie, données anciennes)", () => {
    expect(DEFAULT_INTENSITY).toBe("balanced");
    expect(load().settings.intensity).toBe("balanced");
    expect(heal({ settings: { dailyGoal: 30 } }).settings.intensity).toBe("balanced");
    expect(toIntensity("extreme")).toBe("balanced");
  });

  it("enregistrée dans l'espace du compte et relue au retour", () => {
    const st = load();
    st.settings.intensity = "intensive";
    save(st);
    expect(load().settings.intensity).toBe("intensive");
    setActiveUser("user_other");
    expect(load().settings.intensity).toBe("balanced");
  });
});
