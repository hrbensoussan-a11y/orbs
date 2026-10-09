// Notes & moyennes — saisies à la main par l'élève, stockage local.
// Rien n'est envoyé au serveur.

export type Grade = {
  id: string;
  subject: string;
  label: string; // ex. « DS chapitre 3 »
  value: number; // /20
  coef: number; // coefficient (1 par défaut)
  outOf: number; // barème (20 par défaut)
  date: string; // "AAAA-MM-JJ"
};

export type GradesState = {
  version: number;
  grades: Grade[];
};

const KEY = "orbs.grades.v1";
const VERSION = 1;

export function uid(prefix = "g"): string {
  return prefix + "_" + Math.random().toString(36).slice(2, 10);
}

export function emptyGrades(): GradesState {
  return { version: VERSION, grades: [] };
}

function num(v: unknown, def: number): number {
  return typeof v === "number" && Number.isFinite(v) ? v : def;
}
function str(v: unknown, def = ""): string {
  return typeof v === "string" ? v : def;
}

export function heal(raw: unknown): GradesState {
  try {
    const s = (raw ?? {}) as Partial<GradesState>;
    const grades = Array.isArray(s.grades)
      ? s.grades
          .map((g) => {
            const o = (g ?? {}) as Partial<Grade>;
            if (!o.id) return null;
            const outOf = Math.max(1, num(o.outOf, 20));
            return {
              id: str(o.id),
              subject: str(o.subject, "Autre"),
              label: str(o.label),
              value: Math.max(0, Math.min(outOf, num(o.value, 0))),
              coef: Math.max(0.5, Math.min(20, num(o.coef, 1))),
              outOf,
              date: /^\d{4}-\d{2}-\d{2}$/.test(str(o.date)) ? str(o.date) : dateKey(),
            } as Grade;
          })
          .filter((g): g is Grade => g !== null)
      : [];
    return { version: VERSION, grades };
  } catch {
    return emptyGrades();
  }
}

export function loadGrades(): GradesState {
  if (typeof window === "undefined") return emptyGrades();
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return emptyGrades();
    return heal(JSON.parse(raw));
  } catch {
    return emptyGrades();
  }
}

export function saveGrades(state: GradesState): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* ignore */
  }
}

export function dateKey(d: Date = new Date()): string {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

/** Note ramenée sur 20 (si le barème n'est pas /20). */
export function on20(g: Grade): number {
  return (g.value / g.outOf) * 20;
}

/** Moyenne pondérée d'une liste de notes, sur 20. null si vide. */
export function weightedAverage(grades: Grade[]): number | null {
  if (!grades.length) return null;
  let sum = 0;
  let coefs = 0;
  for (const g of grades) {
    sum += on20(g) * g.coef;
    coefs += g.coef;
  }
  return coefs > 0 ? sum / coefs : null;
}

export type SubjectAverage = { subject: string; average: number; count: number };

/** Une moyenne par matière (pondérée), triée par matière. */
export function subjectAverages(grades: Grade[]): SubjectAverage[] {
  const bySubject = new Map<string, Grade[]>();
  for (const g of grades) {
    const arr = bySubject.get(g.subject) ?? [];
    arr.push(g);
    bySubject.set(g.subject, arr);
  }
  const out: SubjectAverage[] = [];
  for (const [subject, list] of bySubject) {
    const avg = weightedAverage(list);
    if (avg !== null) out.push({ subject, average: avg, count: list.length });
  }
  return out.sort((a, b) => a.subject.localeCompare(b.subject));
}

/** Moyenne générale = moyenne (non pondérée) des moyennes de matières. */
export function generalAverage(grades: Grade[]): number | null {
  const subs = subjectAverages(grades);
  if (!subs.length) return null;
  return subs.reduce((s, x) => s + x.average, 0) / subs.length;
}

/** Format français : « 14,25 » (2 décimales, virgule). */
export function fmt(n: number): string {
  return n.toFixed(2).replace(".", ",");
}
