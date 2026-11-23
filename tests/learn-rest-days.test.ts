// Groupe A — A6 : jours de repos.
//
// On vérifie les MÉCANISMES RÉELS : la série (touchDay, appelée à chaque
// révision et à chaque session de concentration), l'objectif du jour, la
// série « vivante » de l'espace famille (et ses défis), la persistance dans
// l'espace local du compte et le résumé envoyé au serveur.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  MAX_REST_DAYS,
  isRestDay,
  isStreakAlive,
  sanitizeRestDays,
  streakContinues,
  weekdayIndex,
} from "@/lib/learn/rest";
import { award, dateKey, restToday, touchDay } from "@/lib/learn/progress";
import { defaultState, heal, load, save } from "@/lib/learn/store";
import { summarize } from "@/lib/learn/summary";
import { liveStreak, validateSummary, EMPTY_SUMMARY } from "@/lib/family";
import type { Stats } from "@/lib/learn/types";
import { installBrowser } from "./helpers/browser";
import { setActiveUser, userKey } from "@/lib/userStorage";

// Semaine de référence (heure locale) : lundi 16 → dimanche 22 novembre 2026.
const day = (d: number, h = 18) => new Date(2026, 10, d, h, 0, 0, 0);
const MON = 16, TUE = 17, WED = 18, THU = 19, FRI = 20, SAT = 21, SUN = 22, NEXT_MON = 23;
const WEEKEND = [5, 6]; // samedi, dimanche (0 = lundi)

function stats(partial: Partial<Stats> = {}): Stats {
  return { xp: 0, streak: 0, lastDay: "", reviews: 0, focus: 0, badges: [], journal: {}, ...partial };
}

describe("jours de repos : valeurs", () => {
  it("numérotation de l'agenda : 0 = lundi … 6 = dimanche", () => {
    expect(weekdayIndex(day(MON))).toBe(0);
    expect(weekdayIndex(day(SAT))).toBe(5);
    expect(weekdayIndex(day(SUN))).toBe(6);
  });

  it("nettoyage : entiers 0–6, sans doublon, triés, six jours au plus", () => {
    expect(sanitizeRestDays([6, 5, 5, "1", 9, -1, 2.5, null])).toEqual([5, 6]);
    expect(sanitizeRestDays("samedi")).toEqual([]);
    expect(sanitizeRestDays([0, 1, 2, 3, 4, 5, 6])).toHaveLength(MAX_REST_DAYS);
  });

  it("isRestDay / restToday", () => {
    expect(isRestDay(WEEKEND, day(SAT))).toBe(true);
    expect(isRestDay(WEEKEND, day(MON))).toBe(false);
    const st = defaultState();
    st.settings.restDays = WEEKEND;
    expect(restToday(st, day(SUN))).toBe(true);
    expect(restToday(st, day(WED))).toBe(false);
  });
});

describe("la série ne se casse pas pendant les jours de repos", () => {
  it("sans jour de repos : la règle habituelle (hier → +1, sinon on repart à 1)", () => {
    expect(streakContinues(dateKey(day(THU)), day(FRI), [])).toBe(true);
    expect(streakContinues(dateKey(day(WED)), day(FRI), [])).toBe(false);
    expect(streakContinues("", day(FRI), [])).toBe(false);
    expect(streakContinues("pas une date", day(FRI), [])).toBe(false);
    expect(streakContinues(dateKey(day(FRI)), day(FRI), [])).toBe(false);
  });

  it("vendredi → lundi avec samedi et dimanche au repos : la série continue", () => {
    expect(streakContinues(dateKey(day(FRI)), day(NEXT_MON), WEEKEND)).toBe(true);
    // Sans ces jours de repos, elle serait cassée.
    expect(streakContinues(dateKey(day(FRI)), day(NEXT_MON), [])).toBe(false);
  });

  it("un jour manqué qui n'est PAS un jour de repos casse toujours la série", () => {
    // Jeudi → lundi : le vendredi manqué n'est pas un jour de repos.
    expect(streakContinues(dateKey(day(THU)), day(NEXT_MON), WEEKEND)).toBe(false);
  });

  it("touchDay : la série de 5 continue à 6 le lundi après un week-end de repos", () => {
    const s = stats({ streak: 5, lastDay: dateKey(day(FRI)) });
    touchDay(s, WEEKEND, day(NEXT_MON));
    expect(s.streak).toBe(6);
    expect(s.lastDay).toBe(dateKey(day(NEXT_MON)));
    expect(s.journal[dateKey(day(NEXT_MON))]).toBe(1);
  });

  it("réviser un jour de repos compte en bonus (+1), puis la série continue", () => {
    const s = stats({ streak: 5, lastDay: dateKey(day(FRI)) });
    touchDay(s, WEEKEND, day(SAT));
    expect(s.streak).toBe(6);
    touchDay(s, WEEKEND, day(NEXT_MON)); // dimanche au repos entre les deux
    expect(s.streak).toBe(7);
  });

  it("plusieurs actions le même jour ne comptent qu'une fois dans la série", () => {
    const s = stats({ streak: 2, lastDay: dateKey(day(MON)) });
    touchDay(s, [], day(TUE));
    touchDay(s, [], day(TUE, 20));
    expect(s.streak).toBe(3);
    expect(s.journal[dateKey(day(TUE))]).toBe(2);
  });

  it("award (révision) utilise les jours de repos de l'élève", () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(day(NEXT_MON, 9));
      const st = defaultState();
      st.settings.restDays = WEEKEND;
      st.stats.streak = 4;
      st.stats.lastDay = dateKey(day(FRI));
      award(st, "correct");
      expect(st.stats.streak).toBe(5);
      // Même situation sans jours de repos : la série repart à 1.
      const other = defaultState();
      other.stats.streak = 4;
      other.stats.lastDay = dateKey(day(FRI));
      award(other, "correct");
      expect(other.stats.streak).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("changement d'heure (29 mars 2026) : les jours sont comptés correctement", () => {
    // Samedi 28 → lundi 30 mars, dimanche 29 (jour du passage à l'heure d'été) au repos.
    expect(streakContinues("2026-03-28", new Date(2026, 2, 30, 8), [6])).toBe(true);
    expect(streakContinues("2026-03-28", new Date(2026, 2, 30, 8), [])).toBe(false);
  });
});

describe("série « vivante » (espace famille et défis)", () => {
  const summary = (lastDay: string, restDays?: number[]) => ({ ...EMPTY_SUMMARY, streak: 8, lastDay, restDays });

  it("dimanche, dernière révision vendredi, week-end au repos : la série reste affichée", () => {
    expect(liveStreak(summary(dateKey(day(FRI)), WEEKEND), day(SUN))).toBe(8);
    expect(isStreakAlive(dateKey(day(FRI)), day(SUN), WEEKEND)).toBe(true);
  });

  it("sans jours de repos (ancien résumé), le comportement d'avant est conservé", () => {
    expect(liveStreak(summary(dateKey(day(FRI))), day(SUN))).toBe(0);
    expect(liveStreak(summary(dateKey(day(SAT))), day(SUN))).toBe(8);
    expect(liveStreak(summary(dateKey(day(SUN))), day(SUN))).toBe(8);
  });

  it("le résumé envoyé au serveur porte les jours de repos et reste valide", () => {
    const st = defaultState();
    st.settings.restDays = WEEKEND;
    const s = summarize(st);
    expect(s.restDays).toEqual(WEEKEND);
    expect(validateSummary(s)?.restDays).toEqual(WEEKEND);
    // Un ancien résumé (sans le champ) reste accepté ; une valeur hors limites est refusée.
    const { restDays: _drop, ...old } = s;
    void _drop;
    expect(validateSummary(old)).not.toBeNull();
    expect(validateSummary({ ...s, restDays: [9] })).toBeNull();
  });
});

describe("persistance dans l'espace local du compte", () => {
  beforeEach(() => {
    installBrowser();
    setActiveUser("user_rest_a");
  });
  afterEach(() => {
    setActiveUser(null);
    vi.unstubAllGlobals();
  });

  it("enregistrés puis relus (rechargement, reconnexion sur l'appareil)", () => {
    const st = load();
    expect(st.settings.restDays).toEqual([]);
    st.settings.restDays = WEEKEND;
    save(st);
    expect(load().settings.restDays).toEqual(WEEKEND);
    // Clé propre au compte : un autre compte ne voit pas ces jours.
    expect((window as unknown as { localStorage: Storage }).localStorage.getItem(userKey("user_rest_a", "orbs.learn.v1"))).toContain('"restDays":[5,6]');
    setActiveUser("user_rest_b");
    expect(load().settings.restDays).toEqual([]);
  });

  it("des données locales anciennes ou altérées sont réparées au chargement", () => {
    expect(heal({ settings: { dailyGoal: 30 } }).settings).toEqual({ dailyGoal: 30, intensity: "balanced", restDays: [] });
    expect(heal({ settings: { dailyGoal: 20, restDays: [6, 6, 12, "x"] } }).settings.restDays).toEqual([6]);
  });
});
