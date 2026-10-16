// Couleurs personnalisables des matières.
//
// Chaque matière a une couleur par défaut (lib/learn/types → SUBJECT_TONE),
// que l'élève peut changer. La couleur choisie est utilisée partout où la
// matière apparaît : l'assistant IA (discussions par matière) ET l'agenda
// (couleur des cours / devoirs de cette matière).
//
// Stockage : localStorage "orbs.subjectColors" = { "Maths": "#ef4444", … }.

import { SUBJECT_TONE } from "@/lib/learn/types";

export const SUBJECT_PALETTE: { name: string; hex: string }[] = [
  { name: "Rouge", hex: "#ef4444" },
  { name: "Orange", hex: "#f6a93b" },
  { name: "Jaune", hex: "#eab308" },
  { name: "Vert", hex: "#38c172" },
  { name: "Émeraude", hex: "#14b8a6" },
  { name: "Bleu", hex: "#5b9df0" },
  { name: "Indigo", hex: "#6366f1" },
  { name: "Violet", hex: "#b48cf2" },
  { name: "Rose", hex: "#ec4899" },
  { name: "Corail", hex: "#ff6f91" },
  { name: "Ardoise", hex: "#64748b" },
];

const TONE_HEX: Record<string, string> = {
  green: "#38c172",
  sky: "#5b9df0",
  lilac: "#b48cf2",
  amber: "#f6a93b",
  coral: "#ff6f91",
};

const KEY = "orbs.subjectColors";

export function defaultSubjectColor(subject: string): string {
  return TONE_HEX[SUBJECT_TONE[subject] ?? "green"] ?? "#38c172";
}

export function loadSubjectColors(): Record<string, string> {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const o = JSON.parse(raw);
      if (o && typeof o === "object") return o;
    }
  } catch {
    /* indisponible */
  }
  return {};
}

export function saveSubjectColors(map: Record<string, string>): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(map));
  } catch {
    /* ignore */
  }
  try {
    window.dispatchEvent(new Event("orbs:subjectcolors"));
  } catch {
    /* hors navigateur */
  }
}

/** Couleur (hex) d'une matière : l'override choisi, sinon la couleur par défaut. */
export function subjectColor(subject: string, overrides?: Record<string, string>): string {
  const o = overrides ?? loadSubjectColors();
  return o[subject] || defaultSubjectColor(subject);
}
