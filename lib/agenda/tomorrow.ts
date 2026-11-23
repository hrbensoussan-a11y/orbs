// « Préparer ma journée de demain » — le récapitulatif du lendemain.
//
// Construit UNIQUEMENT à partir de l'agenda réel de l'élève (emploi du temps
// + devoirs, stockés dans l'espace local du compte) : rien n'est inventé.
//   - les cours de demain, dans l'ordre ;
//   - les devoirs à rendre demain (pas encore faits) ;
//   - les devoirs pas encore terminés (en retard ou pour aujourd'hui) ;
//   - à préparer : les affaires des matières du lendemain, l'heure du premier
//     cours, et les notes saisies sur les devoirs à rendre.
//
// Le rappel du soir ne part que s'il y a quelque chose DEMAIN (un cours ou un
// devoir à rendre) : pas de notification inutile. Module pur, testé.

import { dateKey, mondayIndex, type AgendaState, type Course, type Homework } from "@/lib/agenda/store";

export type TomorrowPlan = {
  /** Demain, à midi (à l'abri des changements d'heure). */
  date: Date;
  key: string; // AAAA-MM-JJ
  /** « Mardi 24 novembre » */
  label: string;
  courses: Course[];
  dueTomorrow: Homework[];
  unfinished: Homework[];
  /** Matières des cours de demain, sans doublon, dans l'ordre de la journée. */
  bring: string[];
};

/** `n` jours après `d`, à midi, en heure locale (fiable même au changement d'heure). */
export function addDays(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n, 12, 0, 0, 0);
}

function minutes(hm: string): number {
  const [h, m] = hm.split(":");
  return (Number(h) || 0) * 60 + (Number(m) || 0);
}

export function dayLabel(d: Date): string {
  const s = d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function buildTomorrowPlan(agenda: AgendaState, now: Date = new Date()): TomorrowPlan {
  const date = addDays(now, 1);
  const key = dateKey(date);
  const today = dateKey(now);
  const day = mondayIndex(date);

  const courses = agenda.courses
    .filter((c) => c.day === day)
    .sort((a, b) => minutes(a.start) - minutes(b.start) || a.subject.localeCompare(b.subject, "fr"));
  const open = agenda.homework.filter((h) => !h.done);
  const bySubject = (a: Homework, b: Homework) => a.subject.localeCompare(b.subject, "fr");
  const dueTomorrow = open.filter((h) => h.due === key).sort(bySubject);
  const unfinished = open
    .filter((h) => h.due <= today)
    .sort((a, b) => a.due.localeCompare(b.due) || bySubject(a, b));

  const bring: string[] = [];
  for (const c of courses) if (c.subject && !bring.includes(c.subject)) bring.push(c.subject);

  return { date, key, label: dayLabel(date), courses, dueTomorrow, unfinished, bring };
}

/** Il y a quelque chose demain : au moins un cours ou un devoir à rendre. */
export function hasSomethingTomorrow(plan: TomorrowPlan): boolean {
  return plan.courses.length > 0 || plan.dueTomorrow.length > 0;
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n > 1 ? many : one}`;
}

/** Résumé d'une ligne (bandeau dans Orbs). */
export function tomorrowSummary(plan: TomorrowPlan): string {
  const parts: string[] = [];
  if (plan.courses.length) parts.push(plural(plan.courses.length, "cours", "cours"));
  if (plan.dueTomorrow.length)
    parts.push(plural(plan.dueTomorrow.length, "devoir à rendre", "devoirs à rendre"));
  if (plan.unfinished.length)
    parts.push(plural(plan.unfinished.length, "devoir à terminer", "devoirs à terminer"));
  return parts.join(" · ");
}

/** Texte de la notification système (quelques lignes, réelles). */
export function tomorrowNotification(plan: TomorrowPlan): { title: string; body: string } {
  const lines: string[] = [];
  if (plan.courses.length) {
    const shown = plan.courses.slice(0, 3).map((c) => `${c.start} ${c.subject}`);
    const more = plan.courses.length - shown.length;
    lines.push(`Cours : ${shown.join(", ")}${more > 0 ? ` (+${more})` : ""}`);
  }
  if (plan.dueTomorrow.length) {
    const shown = plan.dueTomorrow.slice(0, 2).map((h) => `${h.subject} (${h.title})`);
    const more = plan.dueTomorrow.length - shown.length;
    lines.push(`À rendre : ${shown.join(", ")}${more > 0 ? ` (+${more})` : ""}`);
  }
  if (plan.unfinished.length) {
    lines.push(`À terminer : ${plural(plan.unfinished.length, "devoir", "devoirs")}`);
  }
  return { title: "Voici ce qui t’attend demain", body: lines.join("\n") };
}
