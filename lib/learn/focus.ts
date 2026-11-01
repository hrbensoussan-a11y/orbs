// Minuteur de concentration (Pomodoro) — état PARTAGÉ et PERSISTANT.
//
// Le minuteur ne vit pas dans la page Apprendre : il est monté une fois dans
// le layout de l'app (voir components/learn/FocusTimer), donc il continue de
// tourner quand on change de page. L'état est aussi écrit en localStorage
// ("orbs.focus"), si bien qu'un rechargement reprend la session en cours.
//
// Quand une phase de TRAVAIL se termine, on crédite une « concentration »
// dans la progression Apprendre (XP + badge), même si la fenêtre est fermée.

import { load, save } from "./store";
import { award, recomputeBadges, dateKey } from "./progress";

export type FocusPhase = "work" | "break";

export interface FocusState {
  phase: FocusPhase;
  running: boolean;
  endAt: number; // horodatage (ms) de fin de la phase en cours (si running)
  left: number; // temps restant (ms) à l'arrêt / en pause
  workMin: number; // durée de travail (minutes)
  breakMin: number; // durée de pause (minutes)
  cycles: number; // cycles de travail terminés aujourd'hui
  cyclesDay: string; // AAAA-MM-JJ du compteur de cycles
}

const KEY = "orbs.focus";
export const FOCUS_EVENT = "orbs:focus"; // l'état a changé (même onglet)
export const FOCUS_OPEN_EVENT = "orbs:focus:open"; // demande d'ouvrir la fenêtre

const clampMin = (v: number, max: number, def: number) =>
  Number.isFinite(v) && v >= 1 ? Math.min(max, Math.round(v)) : def;

export function defaultFocus(): FocusState {
  return {
    phase: "work",
    running: false,
    endAt: 0,
    left: 25 * 60000,
    workMin: 25,
    breakMin: 5,
    cycles: 0,
    cyclesDay: dateKey(),
  };
}

export function loadFocus(): FocusState {
  const base = defaultFocus();
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return base;
    const r = JSON.parse(raw);
    if (!r || typeof r !== "object") return base;
    const today = dateKey();
    const s: FocusState = {
      phase: r.phase === "break" ? "break" : "work",
      running: false,
      endAt: 0,
      left: base.left,
      workMin: clampMin(Number(r.workMin), 120, 25),
      breakMin: clampMin(Number(r.breakMin), 60, 5),
      cycles: r.cyclesDay === today ? Number(r.cycles) || 0 : 0,
      cyclesDay: today,
    };
    // Reprise d'une session en cours (si elle n'est pas déjà expirée).
    if (r.running && typeof r.endAt === "number" && r.endAt > Date.now()) {
      s.running = true;
      s.endAt = r.endAt;
      s.left = r.endAt - Date.now();
    } else {
      s.left = (s.phase === "work" ? s.workMin : s.breakMin) * 60000;
    }
    return s;
  } catch {
    return base;
  }
}

export function saveFocus(s: FocusState): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* indisponible */
  }
  try {
    window.dispatchEvent(new Event(FOCUS_EVENT));
  } catch {
    /* hors navigateur */
  }
}

/** Crédite une session de concentration terminée. Renvoie les badges gagnés. */
export function awardFocusSession(): string[] {
  const st = load();
  st.stats.focus += 1;
  award(st, "focus"); // XP + jour + série
  const badges = recomputeBadges(st);
  save(st);
  return badges;
}

export function fmtMs(ms: number): string {
  const m = Math.floor(Math.max(0, ms) / 60000);
  const s = Math.floor((Math.max(0, ms) % 60000) / 1000);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}
