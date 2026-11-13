import { describe, it, expect } from "vitest";
import {
  defaultNotifSettings,
  pendingReminders,
  homeworkSummary,
  type NotifSettings,
} from "@/lib/agenda/notifications";
import { RINGTONES, DEFAULT_RINGTONE, ringtoneById } from "@/lib/sound/ringtones";
import {
  emptyAgenda,
  dateKey,
  mondayIndex,
  type AgendaState,
  type Course,
  type Homework,
} from "@/lib/agenda/store";

// Tests de la LOGIQUE des rappels de l'agenda (fonction pure pendingReminders,
// utilisée par le planificateur). On ne joue aucun son réel et on n'affiche
// aucune notification système : on vérifie QUELS rappels sont dus, selon les
// réglages, l'heure et ce qui a déjà été déclenché.

// Lundi 5 janvier 2026 — jour de semaine stable pour les cours.
function mondayAt(h: number, m: number): Date {
  return new Date(2026, 0, 5, h, m, 0, 0);
}

function course(partial: Partial<Course>): Course {
  return { id: "c1", day: 0, start: "08:00", end: "09:00", subject: "Maths", ...partial };
}
function homework(partial: Partial<Homework>): Homework {
  return { id: "h1", title: "Exo 4", subject: "Maths", due: dateKey(), done: false, ...partial };
}
function settings(partial: Partial<NotifSettings> = {}): NotifSettings {
  return { ...defaultNotifSettings(), enabled: true, ...partial };
}
function agendaWith(partial: Partial<AgendaState>): AgendaState {
  return { ...emptyAgenda(), ...partial };
}

describe("Sonneries", () => {
  it("expose 8 sonneries aux identifiants attendus", () => {
    expect(RINGTONES.length).toBe(8);
    expect(RINGTONES.map((r) => r.id).sort()).toEqual(
      ["arcade", "carillon", "cloche", "douce", "goutte", "marimba", "pop", "silence"].sort(),
    );
  });
  it("la sonnerie par défaut est « carillon »", () => {
    expect(DEFAULT_RINGTONE).toBe("carillon");
    expect(RINGTONES.some((r) => r.id === DEFAULT_RINGTONE)).toBe(true);
  });
  it("ringtoneById retombe sur le défaut pour un id inconnu", () => {
    expect(ringtoneById("nexistepas").id).toBe(DEFAULT_RINGTONE);
  });
  it("« silence » n'a aucune note", () => {
    expect(RINGTONES.find((r) => r.id === "silence")!.notes.length).toBe(0);
  });
});

describe("Réglages par défaut", () => {
  it("a la forme attendue", () => {
    const d = defaultNotifSettings();
    expect(d.enabled).toBe(false);
    expect(d.leadMin).toBe(10);
    expect(d.homeworkTime).toBe("07:30");
    expect(d.volume).toBeGreaterThan(0);
    expect(d.volume).toBeLessThanOrEqual(1);
  });
});

describe("Interrupteur général", () => {
  it("désactivé → aucun rappel, même si un cours commence", () => {
    const a = agendaWith({ courses: [course({ start: "08:00" })] });
    expect(pendingReminders(a, settings({ enabled: false }), mondayAt(7, 55), new Set())).toEqual([]);
  });
});

describe("Rappel avant un cours + délai", () => {
  const a = agendaWith({ courses: [course({ start: "08:00", subject: "Maths" })] });

  it("déclenche pile au moment du rappel (10 min avant)", () => {
    const r = pendingReminders(a, settings({ leadMin: 10 }), mondayAt(7, 50), new Set());
    expect(r.length).toBe(1);
    expect(r[0].title).toContain("Maths");
    expect(r[0].body).toContain("10 min");
  });
  it("ne déclenche pas avant la fenêtre (11 min avant)", () => {
    expect(pendingReminders(a, settings({ leadMin: 10 }), mondayAt(7, 49), new Set())).toEqual([]);
  });
  it("déclenche encore à l'heure du cours", () => {
    expect(pendingReminders(a, settings({ leadMin: 10 }), mondayAt(8, 0), new Set()).length).toBe(1);
  });
  it("ne déclenche plus après le début du cours", () => {
    expect(pendingReminders(a, settings({ leadMin: 10 }), mondayAt(8, 1), new Set())).toEqual([]);
  });
  it("délai 0 → rappel à l'heure exacte", () => {
    expect(pendingReminders(a, settings({ leadMin: 0 }), mondayAt(7, 59), new Set())).toEqual([]);
    const r = pendingReminders(a, settings({ leadMin: 0 }), mondayAt(8, 0), new Set());
    expect(r.length).toBe(1);
    expect(r[0].body).toContain("08:00");
  });
  it("respecte le délai 30 min", () => {
    expect(pendingReminders(a, settings({ leadMin: 30 }), mondayAt(7, 30), new Set()).length).toBe(1);
    expect(pendingReminders(a, settings({ leadMin: 30 }), mondayAt(7, 29), new Set())).toEqual([]);
  });
  it("désactivé par le réglage « courses » → rien", () => {
    expect(pendingReminders(a, settings({ courses: false }), mondayAt(7, 50), new Set())).toEqual([]);
  });
  it("ne redéclenche pas un cours déjà notifié aujourd'hui", () => {
    const fired = new Set(["course:c1"]);
    expect(pendingReminders(a, settings({ leadMin: 10 }), mondayAt(7, 50), fired)).toEqual([]);
  });
  it("ignore un cours d'un autre jour", () => {
    const other = agendaWith({ courses: [course({ day: (mondayIndex(mondayAt(7, 50)) + 1) % 7 })] });
    expect(pendingReminders(other, settings({ leadMin: 10 }), mondayAt(7, 50), new Set())).toEqual([]);
  });
});

describe("Résumé des devoirs + horaire", () => {
  const a = agendaWith({ homework: [homework({ due: dateKey(mondayAt(12, 0)) })] });

  it("déclenche à partir de l'heure choisie", () => {
    const r = pendingReminders(a, settings({ courses: false, homeworkTime: "07:30" }), mondayAt(7, 30), new Set());
    expect(r.find((x) => x.key === "homework-summary")).toBeTruthy();
  });
  it("ne déclenche pas avant l'heure choisie", () => {
    const r = pendingReminders(a, settings({ courses: false, homeworkTime: "07:30" }), mondayAt(7, 29), new Set());
    expect(r.find((x) => x.key === "homework-summary")).toBeUndefined();
  });
  it("désactivé par le réglage « homework » → rien", () => {
    const r = pendingReminders(a, settings({ courses: false, homework: false }), mondayAt(9, 0), new Set());
    expect(r).toEqual([]);
  });
  it("aucun devoir → aucun résumé même après l'heure", () => {
    const empty = emptyAgenda();
    const r = pendingReminders(empty, settings({ courses: false, homeworkTime: "07:30" }), mondayAt(9, 0), new Set());
    expect(r).toEqual([]);
  });
  it("ne redéclenche pas le résumé déjà envoyé aujourd'hui", () => {
    const fired = new Set(["homework-summary"]);
    const r = pendingReminders(a, settings({ courses: false }), mondayAt(9, 0), fired);
    expect(r.find((x) => x.key === "homework-summary")).toBeUndefined();
  });
});

describe("homeworkSummary", () => {
  it("compte les devoirs en retard et à venir", () => {
    const now = mondayAt(12, 0);
    const yesterday = dateKey(new Date(now.getTime() - 86400000));
    const a = agendaWith({
      homework: [
        homework({ id: "a", due: yesterday }),
        homework({ id: "b", due: dateKey(now) }),
        homework({ id: "c", due: dateKey(now), done: true }),
      ],
    });
    const sum = homeworkSummary(a, now);
    expect(sum).not.toBeNull();
    expect(sum!.count).toBe(2); // 1 en retard + 1 aujourd'hui (le « done » est ignoré)
    expect(sum!.body).toContain("retard");
  });
  it("renvoie null quand il n'y a rien à signaler", () => {
    expect(homeworkSummary(emptyAgenda(), mondayAt(12, 0))).toBeNull();
  });
});
