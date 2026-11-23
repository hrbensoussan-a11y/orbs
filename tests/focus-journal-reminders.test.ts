// Groupe B — B2 (Mode Concentration) et B6 (rappel d'écriture du journal).
//
// Le vrai moteur des rappels (runReminderTick) dans un faux navigateur, avec
// une horloge maîtrisée ; la vraie route /api/journal/today sur la base de
// test. Seules la sonnerie (Web Audio) et l'affichage système sont simulés.

import { describe, it, expect, beforeEach, afterEach, afterAll, vi } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

const ring = vi.hoisted(() => ({ count: 0 }));
vi.mock("@/lib/sound/ringtones", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/sound/ringtones")>();
  return { ...actual, playRingtone: async () => void (ring.count += 1) };
});
const session = vi.hoisted(() => ({ user: null as null | { id: string } }));
vi.mock("@/lib/auth", () => ({ getCurrentUser: async () => session.user }));

import {
  JOURNAL_KEY,
  defaultNotifSettings,
  loadDeferred,
  loadNotifSettings,
  markReminderFired,
  reminderFiredToday,
  runReminderTick,
  saveNotifSettings,
  type NotifSettings,
} from "@/lib/agenda/notifications";
import { isFocusActive } from "@/lib/learn/focus";
import { emptyAgenda, type AgendaState } from "@/lib/agenda/store";
import { installBrowser } from "./helpers/browser";
import { setActiveUser, userKey } from "@/lib/userStorage";
import { GET as journalToday } from "@/app/api/journal/today/route";

// Lundi 23 novembre 2026 ; un cours de maths à 17:00 aujourd'hui (day 0).
const at = (h: number, m = 0, d = 23) => new Date(2026, 10, d, h, m, 0, 0);
const USER = "user_focus_b";
const AGENDA: AgendaState = {
  ...emptyAgenda(),
  courses: [{ id: "c1", day: 0, start: "17:00", end: "18:00", subject: "Maths" }],
  homework: [{ id: "h1", title: "Exercice 4", subject: "Maths", due: "2026-11-24", done: false }],
};
const settings = (p: Partial<NotifSettings> = {}): NotifSettings => ({
  ...defaultNotifSettings(),
  enabled: true,
  courses: true,
  leadMin: 10,
  homework: true,
  homeworkTime: "16:00",
  ...p,
});

let shown: { title: string; tag: string; data: unknown }[] = [];
function stubNotifications() {
  shown = [];
  class FakeNotification {
    static permission = "granted";
    onclick: (() => void) | null = null;
    constructor(title: string, o: NotificationOptions) {
      shown.push({ title, tag: String(o.tag), data: o.data });
    }
    close() {}
  }
  vi.stubGlobal("Notification", FakeNotification);
  vi.stubGlobal("navigator", {});
}
const titles = () => shown.map((s) => s.title);

function setFocus(state: { running: boolean; phase: "work" | "break"; endAt: number }) {
  (window as unknown as { localStorage: Storage }).localStorage.setItem(
    userKey(USER, "orbs.focus"),
    JSON.stringify({ ...state, left: 0, workMin: 25, breakMin: 5, cycles: 0, cyclesDay: "2026-11-23" }),
  );
}

beforeEach(() => {
  installBrowser();
  setActiveUser(USER);
  stubNotifications();
  ring.count = 0;
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
  setActiveUser(null);
  vi.unstubAllGlobals();
});

// ===========================================================================
// B2 — Mode Concentration
// ===========================================================================

describe("B2 — état du Mode Concentration (minuteur existant)", () => {
  it("actif seulement pendant une phase de travail lancée et non terminée", () => {
    vi.setSystemTime(at(16, 50));
    const now = Date.now();
    expect(isFocusActive()).toBe(false); // aucun minuteur
    setFocus({ running: true, phase: "work", endAt: now + 20 * 60000 });
    expect(isFocusActive()).toBe(true);
    setFocus({ running: false, phase: "work", endAt: 0 }); // en pause / réinitialisé
    expect(isFocusActive()).toBe(false);
    setFocus({ running: true, phase: "break", endAt: now + 5 * 60000 }); // pause du Pomodoro
    expect(isFocusActive()).toBe(false);
    setFocus({ running: true, phase: "work", endAt: now - 1000 }); // terminée, onglet fermé
    expect(isFocusActive()).toBe(false);
  });
});

describe("B2 — rappels pendant une session", () => {
  it("les devoirs attendent, le cours sonne ; à la fin, les devoirs arrivent une seule fois", async () => {
    vi.setSystemTime(at(16, 52));
    await runReminderTick(AGENDA, settings(), { focusActive: true });
    expect(titles()).toEqual(["Cours bientôt : Maths"]); // essentiel : maintenu
    expect(loadDeferred()).toEqual(["homework-summary"]); // en attente, pas perdu
    expect(reminderFiredToday("homework-summary")).toBe(false);

    vi.setSystemTime(at(16, 55));
    await runReminderTick(AGENDA, settings(), { focusActive: true });
    expect(titles()).toEqual(["Cours bientôt : Maths"]); // rien de plus pendant la session

    vi.setSystemTime(at(17, 15)); // fin de la session
    await runReminderTick(AGENDA, settings(), { focusActive: false });
    expect(titles()).toEqual(["Cours bientôt : Maths", "Tes devoirs"]);
    expect(loadDeferred()).toEqual([]);
    await runReminderTick(AGENDA, settings(), { focusActive: false });
    expect(titles()).toEqual(["Cours bientôt : Maths", "Tes devoirs"]); // pas de doublon
  });

  it("un rappel devenu inutile pendant la session n'est pas envoyé à la fin", async () => {
    vi.setSystemTime(at(16, 30));
    await runReminderTick(AGENDA, settings({ courses: false }), { focusActive: true });
    expect(loadDeferred()).toEqual(["homework-summary"]);
    const done: AgendaState = { ...AGENDA, homework: AGENDA.homework.map((h) => ({ ...h, done: true })) };
    vi.setSystemTime(at(16, 55));
    await runReminderTick(done, settings({ courses: false }), { focusActive: false });
    expect(titles()).toEqual([]);
  });

  it("session interrompue (pause, réinitialisation) : les rappels en attente sont présentés", async () => {
    vi.setSystemTime(at(16, 20));
    setFocus({ running: true, phase: "work", endAt: Date.now() + 20 * 60000 });
    await runReminderTick(AGENDA, settings({ courses: false }), { focusActive: isFocusActive() });
    expect(titles()).toEqual([]);
    setFocus({ running: false, phase: "work", endAt: 0 }); // l'élève met en pause
    await runReminderTick(AGENDA, settings({ courses: false }), { focusActive: isFocusActive() });
    expect(titles()).toEqual(["Tes devoirs"]);
  });

  it("plusieurs rappels libérés d'un coup : une seule sonnerie", async () => {
    vi.setSystemTime(at(21, 10));
    const s = settings({ courses: false, journal: true, journalTime: "21:00", tomorrow: true, tomorrowTime: "20:00" });
    const tomorrow: AgendaState = { ...AGENDA, courses: [{ id: "c2", day: 1, start: "08:00", end: "09:00", subject: "Anglais" }] };
    await runReminderTick(tomorrow, s, { focusActive: true, journalWritten: async () => false });
    expect(titles()).toEqual([]);
    expect(loadDeferred().sort()).toEqual(["homework-summary", JOURNAL_KEY, "prepare-tomorrow"].sort());
    await runReminderTick(tomorrow, s, { focusActive: false, journalWritten: async () => false });
    expect(titles()).toHaveLength(2); // devoirs + journal ; le récapitulatif (tardif) arrive en bandeau discret
    expect(ring.count).toBe(1);
  });

  it("Mode Concentration désactivé dans les Réglages : rien n'est retenu", async () => {
    vi.setSystemTime(at(16, 30));
    await runReminderTick(AGENDA, settings({ courses: false, focusHold: false }), { focusActive: true });
    expect(titles()).toEqual(["Tes devoirs"]);
  });

  it("préférence par défaut : activé ; enregistrée dans l'espace du compte", () => {
    expect(defaultNotifSettings().focusHold).toBe(true);
    saveNotifSettings({ ...loadNotifSettings(), focusHold: false });
    expect(loadNotifSettings().focusHold).toBe(false);
    setActiveUser("someone_else");
    expect(loadNotifSettings().focusHold).toBe(true);
  });
});

// ===========================================================================
// B6 — Rappel d'écriture du journal
// ===========================================================================

describe("B6 — rappel du journal", () => {
  const s = (p: Partial<NotifSettings> = {}) =>
    settings({ courses: false, homework: false, journal: true, journalTime: "21:00", ...p });

  it("désactivé par défaut : aucun rappel, aucune requête", async () => {
    expect(defaultNotifSettings().journal).toBe(false);
    vi.setSystemTime(at(22));
    const check = vi.fn(async () => false);
    await runReminderTick(emptyAgenda(), settings({ courses: false, homework: false }), { journalWritten: check });
    expect(check).not.toHaveBeenCalled();
    expect(titles()).toEqual([]);
  });

  it("avant l'heure : rien, et le serveur n'est pas interrogé", async () => {
    vi.setSystemTime(at(20, 59));
    const check = vi.fn(async () => false);
    await runReminderTick(emptyAgenda(), s(), { journalWritten: check });
    expect(check).not.toHaveBeenCalled();
    expect(titles()).toEqual([]);
  });

  it("rien écrit aujourd'hui : un rappel à l'heure, une seule fois dans la journée", async () => {
    vi.setSystemTime(at(21, 0));
    const check = vi.fn(async () => false);
    await runReminderTick(emptyAgenda(), s(), { journalWritten: check });
    expect(titles()).toEqual(["Ton journal t’attend"]);
    expect(shown[0].data).toEqual({ url: "/write", open: "journal" });
    vi.setSystemTime(at(22, 30));
    await runReminderTick(emptyAgenda(), s(), { journalWritten: check });
    expect(titles()).toHaveLength(1);
    expect(check).toHaveBeenCalledTimes(1); // déjà envoyé : plus de requête
  });

  it("déjà écrit (avant l'heure) : aucun rappel, et plus de vérification ce jour-là", async () => {
    vi.setSystemTime(at(21, 5));
    const check = vi.fn(async () => true);
    await runReminderTick(emptyAgenda(), s(), { journalWritten: check });
    vi.setSystemTime(at(23));
    await runReminderTick(emptyAgenda(), s(), { journalWritten: check });
    expect(titles()).toEqual([]);
    expect(check).toHaveBeenCalledTimes(1);
  });

  it("réponse inconnue (hors ligne) : rien n'est décidé, nouvel essai au passage suivant", async () => {
    vi.setSystemTime(at(21, 1));
    const check = vi.fn<() => Promise<boolean | null>>(async () => null);
    await runReminderTick(emptyAgenda(), s(), { journalWritten: check });
    expect(titles()).toEqual([]);
    expect(reminderFiredToday(JOURNAL_KEY)).toBe(false);
    check.mockResolvedValue(false);
    await runReminderTick(emptyAgenda(), s(), { journalWritten: check });
    expect(titles()).toEqual(["Ton journal t’attend"]);
  });

  it("le lendemain, le suivi repart : nouveau rappel si rien n'est écrit", async () => {
    vi.setSystemTime(at(21, 0));
    await runReminderTick(emptyAgenda(), s(), { journalWritten: async () => false });
    vi.setSystemTime(at(21, 0, 24));
    await runReminderTick(emptyAgenda(), s(), { journalWritten: async () => false });
    expect(titles()).toHaveLength(2);
  });

  it("pendant une concentration : en attente, sans requête ; vérifié à jour à la fin", async () => {
    vi.setSystemTime(at(21, 0));
    const check = vi.fn(async () => true); // l'élève a écrit pendant la session
    await runReminderTick(emptyAgenda(), s(), { focusActive: true, journalWritten: check });
    expect(check).not.toHaveBeenCalled();
    expect(loadDeferred()).toEqual([JOURNAL_KEY]);
    await runReminderTick(emptyAgenda(), s(), { focusActive: false, journalWritten: check });
    expect(check).toHaveBeenCalledTimes(1);
    expect(titles()).toEqual([]); // plus pertinent : pas envoyé
  });

  it("activé après l'heure : il commence le lendemain", async () => {
    vi.setSystemTime(at(22));
    markReminderFired(JOURNAL_KEY);
    await runReminderTick(emptyAgenda(), s(), { journalWritten: async () => false });
    expect(titles()).toEqual([]);
  });

  it("interrupteur général coupé : aucun rappel du journal", async () => {
    vi.setSystemTime(at(22));
    await runReminderTick(emptyAgenda(), s({ enabled: false }), { journalWritten: async () => false });
    expect(titles()).toEqual([]);
  });
});

describe("B6 — /api/journal/today (vraie route, vraie base)", () => {
  const created: string[] = [];
  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: { in: created } } });
  });
  async function makeUser() {
    const id = `test_b6_${crypto.randomUUID().replace(/-/g, "")}`.slice(0, 40);
    await prisma.user.create({ data: { id, email: `${id}@test.local`, passwordHash: "x" } });
    created.push(id);
    return id;
  }
  const ask = (since: string) =>
    journalToday(new NextRequest(`http://localhost/api/journal/today?since=${encodeURIComponent(since)}`));

  beforeEach(() => {
    vi.useRealTimers();
  });

  it("sans session : 401 ; date absurde : 400", async () => {
    session.user = null;
    expect((await ask(new Date().toISOString())).status).toBe(401);
    session.user = { id: await makeUser() };
    expect((await ask("hier")).status).toBe(400);
    expect((await ask(new Date(Date.now() - 5 * 86400000).toISOString())).status).toBe(400);
    expect((await ask(new Date(Date.now() + 3600000).toISOString())).status).toBe(400);
  });

  it("utilisateur sans entrée : wrote = false ; après une entrée du jour : true", async () => {
    const a = await makeUser();
    session.user = { id: a };
    const midnight = new Date();
    midnight.setHours(0, 0, 0, 0);
    expect(await (await ask(midnight.toISOString())).json()).toEqual({ wrote: false });
    // Une entrée d'hier ne compte pas pour aujourd'hui.
    await prisma.entry.create({ data: { userId: a, content: "Hier", createdAt: new Date(midnight.getTime() - 3600000) } });
    expect(await (await ask(midnight.toISOString())).json()).toEqual({ wrote: false });
    await prisma.entry.create({ data: { userId: a, content: "Aujourd'hui" } });
    expect(await (await ask(midnight.toISOString())).json()).toEqual({ wrote: true });
  });

  it("ne compte que les pages du compte de la session, et ne crée rien", async () => {
    const a = await makeUser();
    const b = await makeUser();
    await prisma.entry.create({ data: { userId: b, content: "Page de B" } });
    session.user = { id: a };
    const midnight = new Date();
    midnight.setHours(0, 0, 0, 0);
    const before = await prisma.entry.count({ where: { userId: { in: [a, b] } } });
    const res = await ask(midnight.toISOString());
    expect(await res.json()).toEqual({ wrote: false });
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await prisma.entry.count({ where: { userId: { in: [a, b] } } })).toBe(before);
  });
});
