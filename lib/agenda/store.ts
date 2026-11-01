// Agenda (devoirs + emploi du temps) — stockage local, comme « Apprendre ».
// Une seule clé localStorage ; rien n'est envoyé au serveur.

export type Homework = {
  id: string;
  title: string;
  subject: string;
  due: string; // "AAAA-MM-JJ"
  done: boolean;
  note?: string;
};

export type Course = {
  id: string;
  day: number; // 0 = lundi … 6 = dimanche
  start: string; // "HH:MM"
  end: string; // "HH:MM"
  subject: string;
  room?: string;
  teacher?: string;
};

export type AgendaState = {
  version: number;
  homework: Homework[];
  courses: Course[];
};

const KEY = "orbs.agenda.v1";
const VERSION = 1;

export function uid(prefix = "a"): string {
  return prefix + "_" + Math.random().toString(36).slice(2, 10);
}

export function emptyAgenda(): AgendaState {
  return { version: VERSION, homework: [], courses: [] };
}

function str(v: unknown, def = ""): string {
  return typeof v === "string" ? v : def;
}
function num(v: unknown, def: number): number {
  return typeof v === "number" && Number.isFinite(v) ? v : def;
}

/** Nettoyage défensif au chargement (données locales, jamais garanties). */
export function heal(raw: unknown): AgendaState {
  try {
    const s = (raw ?? {}) as Partial<AgendaState>;
    const homework = Array.isArray(s.homework)
      ? s.homework
          .map((h) => {
            const o = (h ?? {}) as Partial<Homework>;
            if (!o.id || !str(o.title).trim()) return null;
            return {
              id: str(o.id),
              title: str(o.title),
              subject: str(o.subject, "Autre"),
              due: /^\d{4}-\d{2}-\d{2}$/.test(str(o.due)) ? str(o.due) : dateKey(),
              done: !!o.done,
              note: str(o.note) || undefined,
            } as Homework;
          })
          .filter((h): h is Homework => h !== null)
      : [];
    const courses = Array.isArray(s.courses)
      ? s.courses
          .map((c) => {
            const o = (c ?? {}) as Partial<Course>;
            if (!o.id) return null;
            const day = Math.max(0, Math.min(6, Math.round(num(o.day, 0))));
            return {
              id: str(o.id),
              day,
              start: /^\d{1,2}:\d{2}$/.test(str(o.start)) ? str(o.start) : "08:00",
              end: /^\d{1,2}:\d{2}$/.test(str(o.end)) ? str(o.end) : "09:00",
              subject: str(o.subject, "Autre"),
              room: str(o.room) || undefined,
              teacher: str(o.teacher) || undefined,
            } as Course;
          })
          .filter((c): c is Course => c !== null)
      : [];
    return { version: VERSION, homework, courses };
  } catch {
    return emptyAgenda();
  }
}

export function loadAgenda(): AgendaState {
  if (typeof window === "undefined") return emptyAgenda();
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return emptyAgenda();
    return heal(JSON.parse(raw));
  } catch {
    return emptyAgenda();
  }
}

export function saveAgenda(state: AgendaState): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* quota / mode privé : on ignore */
  }
}

// ---- Dates ----

export function dateKey(d: Date = new Date()): string {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

/** 0 = lundi … 6 = dimanche (contrairement à getDay() qui part de dimanche). */
export function mondayIndex(d: Date = new Date()): number {
  return (d.getDay() + 6) % 7;
}

/** Libellé lisible : « Aujourd'hui », « Demain », « En retard », ou la date. */
export function dueLabel(due: string): { label: string; tone: "late" | "today" | "soon" | "normal" } {
  const today = dateKey();
  const t = new Date();
  const tomorrow = dateKey(new Date(t.getTime() + 86400000));
  if (due < today) return { label: "En retard", tone: "late" };
  if (due === today) return { label: "Aujourd'hui", tone: "today" };
  if (due === tomorrow) return { label: "Demain", tone: "soon" };
  const d = new Date(due + "T12:00:00");
  return {
    label: d.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" }),
    tone: "normal",
  };
}

export const DAYS = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"];
export const DAYS_SHORT = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
