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
import { readUserItem, writeUserItem } from "@/lib/userStorage";

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
/**
 * Demande de changer les durées (Réglages → Apprentissage). Le minuteur,
 * monté en permanence dans le layout, les applique lui-même : son état en
 * mémoire et le stockage restent ainsi alignés. Détail : { workMin, breakMin }.
 */
export const FOCUS_TIMES_EVENT = "orbs:focus:times";
export type FocusTimes = { workMin: number; breakMin: number };

/** Préréglages proposés (fenêtre du minuteur et Réglages). */
export const FOCUS_PRESETS: readonly [number, number][] = [
  [25, 5],
  [50, 10],
  [15, 3],
];

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
    const raw = readUserItem(KEY);
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

/**
 * Mode Concentration actif : une phase de TRAVAIL est en cours (minuteur
 * lancé, pas en pause, pas encore terminée). La pause, la mise en pause ou
 * la réinitialisation terminent le mode : les rappels en attente sont alors
 * présentés (lib/agenda/notifications). Lu tel quel dans le stockage : vrai
 * même si la fenêtre du minuteur est fermée ou dans un autre onglet.
 */
export function isFocusActive(now: number = Date.now()): boolean {
  try {
    const raw = readUserItem(KEY);
    if (!raw) return false;
    const r = JSON.parse(raw) as Partial<FocusState> | null;
    return !!r && r.running === true && r.phase !== "break" && typeof r.endAt === "number" && r.endAt > now;
  } catch {
    return false;
  }
}

export function saveFocus(s: FocusState): void {
  try {
    writeUserItem(KEY, JSON.stringify(s));
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
