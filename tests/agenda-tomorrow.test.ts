// Groupe A — A4 : « Préparer ma journée de demain ».
//
// On vérifie :
//   - le récapitulatif construit à partir de l'agenda RÉEL (cours, devoirs,
//     affaires), fiable au changement d'heure ;
//   - quand le rappel du soir part (heure, activation, une fois par soir,
//     rien d'inutile, rattrapage discret) — fonction pure pendingReminders ;
//   - l'envoi réel (runReminderTick) : notification système via le service
//     worker ou l'API Notification, sonnerie, bandeau dans Orbs, jamais en
//     double, même avec plusieurs onglets (Web Locks) ;
//   - le service worker : toucher la notification ramène sur Orbs et ouvre
//     le récapitulatif.

import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  TOMORROW_EVENT,
  TOMORROW_GRACE_MIN,
  TOMORROW_KEY,
  defaultNotifSettings,
  loadNotifSettings,
  markReminderFired,
  pendingReminders,
  reminderFiredToday,
  runExclusive,
  runReminderTick,
  saveNotifSettings,
  type NotifSettings,
} from "@/lib/agenda/notifications";
import {
  addDays,
  buildTomorrowPlan,
  hasSomethingTomorrow,
  tomorrowNotification,
  tomorrowSummary,
} from "@/lib/agenda/tomorrow";
import { emptyAgenda, type AgendaState, type Course, type Homework } from "@/lib/agenda/store";
import { installBrowser, type FakeBrowser } from "./helpers/browser";
import { setActiveUser } from "@/lib/userStorage";

// Lundi 23 novembre 2026, au soir ; « demain » = mardi 24 (day = 1).
const at = (h: number, m = 0) => new Date(2026, 10, 23, h, m, 0, 0);
const TUESDAY = 1;

const course = (p: Partial<Course>): Course => ({ id: "c", day: TUESDAY, start: "08:00", end: "09:00", subject: "Maths", ...p });
const hw = (p: Partial<Homework>): Homework => ({ id: "h", title: "Exercice 4", subject: "Maths", due: "2026-11-24", done: false, ...p });
const agenda = (p: Partial<AgendaState>): AgendaState => ({ ...emptyAgenda(), ...p });
const settings = (p: Partial<NotifSettings> = {}): NotifSettings => ({
  ...defaultNotifSettings(),
  enabled: true,
  courses: false,
  homework: false,
  tomorrow: true,
  tomorrowTime: "20:00",
  ...p,
});

const FULL = agenda({
  courses: [
    course({ id: "c2", start: "10:00", end: "11:00", subject: "Anglais", room: "B12" }),
    course({ id: "c1", start: "08:00", end: "09:00", subject: "Maths", teacher: "M. Diallo" }),
    course({ id: "c3", start: "14:00", end: "15:00", subject: "Maths" }),
    course({ id: "x", day: 3, start: "08:00", subject: "SVT" }), // jeudi : pas demain
  ],
  homework: [
    hw({ id: "h1", title: "Rédaction", subject: "Français", due: "2026-11-24", note: "Apporter le livre" }),
    hw({ id: "h2", title: "Fiche", subject: "SVT", due: "2026-11-24", done: true }), // déjà fait
    hw({ id: "h3", title: "Exercices p. 42", subject: "Maths", due: "2026-11-20" }), // en retard
    hw({ id: "h4", title: "Lecture", subject: "Français", due: "2026-11-23" }), // pour aujourd'hui
    hw({ id: "h5", title: "Exposé", subject: "Histoire-Géo", due: "2026-11-27" }), // plus tard
  ],
});

describe("récapitulatif de demain (agenda réel)", () => {
  it("cours de demain dans l'ordre, devoirs à rendre, à terminer, affaires", () => {
    const plan = buildTomorrowPlan(FULL, at(20));
    expect(plan.key).toBe("2026-11-24");
    expect(plan.label).toBe("Mardi 24 novembre");
    expect(plan.courses.map((c) => c.id)).toEqual(["c1", "c2", "c3"]);
    expect(plan.dueTomorrow.map((h) => h.id)).toEqual(["h1"]);
    expect(plan.unfinished.map((h) => h.id)).toEqual(["h3", "h4"]);
    expect(plan.bring).toEqual(["Maths", "Anglais"]);
    expect(hasSomethingTomorrow(plan)).toBe(true);
  });

  it("texte de notification et résumé tirés des vraies données", () => {
    const plan = buildTomorrowPlan(FULL, at(20));
    const n = tomorrowNotification(plan);
    expect(n.title).toBe("Voici ce qui t’attend demain");
    expect(n.body).toBe(
      "Cours : 08:00 Maths, 10:00 Anglais, 14:00 Maths\nÀ rendre : Français (Rédaction)\nÀ terminer : 2 devoirs",
    );
    expect(tomorrowSummary(plan)).toBe("3 cours · 1 devoir à rendre · 2 devoirs à terminer");
  });

  it("rien demain (ni cours ni devoir à rendre) : pas de rappel, même avec des retards", () => {
    const plan = buildTomorrowPlan(agenda({ homework: [hw({ due: "2026-11-20" })] }), at(20));
    expect(hasSomethingTomorrow(plan)).toBe(false);
    expect(plan.unfinished).toHaveLength(1);
  });

  it("dimanche soir → lundi ; et fiable au passage à l'heure d'été", () => {
    const sunday = new Date(2026, 10, 22, 21, 0);
    const plan = buildTomorrowPlan(agenda({ courses: [course({ day: 0, subject: "SES" })] }), sunday);
    expect(plan.key).toBe("2026-11-23");
    expect(plan.courses.map((c) => c.subject)).toEqual(["SES"]);
    // 28 mars 2026, 23 h 30 : demain est bien le 29 (et pas le 30).
    expect(buildTomorrowPlan(emptyAgenda(), new Date(2026, 2, 28, 23, 30)).key).toBe("2026-03-29");
    expect(addDays(new Date(2026, 9, 24, 23, 30), 1).getDate()).toBe(25);
  });
});

describe("quand le rappel du soir part (pendingReminders)", () => {
  const none = new Set<string>();

  it("désactivé par défaut ; respecte l'interrupteur général et le sien", () => {
    expect(defaultNotifSettings().tomorrow).toBe(false);
    expect(defaultNotifSettings().tomorrowTime).toBe("20:00");
    expect(pendingReminders(FULL, settings({ tomorrow: false }), at(20, 5), none)).toEqual([]);
    expect(pendingReminders(FULL, settings({ enabled: false }), at(20, 5), none)).toEqual([]);
  });

  it("pas avant l'heure choisie ; à l'heure : sonnerie + notification, ouvre le récapitulatif", () => {
    expect(pendingReminders(FULL, settings(), at(19, 59), none)).toEqual([]);
    const [r] = pendingReminders(FULL, settings(), at(20, 0), none);
    expect(r).toMatchObject({ key: TOMORROW_KEY, open: "tomorrow", quiet: false, title: "Voici ce qui t’attend demain" });
    expect(r.summary).toBe("3 cours · 1 devoir à rendre · 2 devoirs à terminer");
  });

  it("une seule fois par soir", () => {
    expect(pendingReminders(FULL, settings(), at(21), new Set([TOMORROW_KEY]))).toEqual([]);
  });

  it("Orbs fermé à l'heure dite : proposé discrètement plus tard dans la soirée", () => {
    const [onTime] = pendingReminders(FULL, settings(), at(20, TOMORROW_GRACE_MIN), none);
    expect(onTime.quiet).toBe(false);
    const [late] = pendingReminders(FULL, settings(), at(22, 30), none);
    expect(late.quiet).toBe(true);
  });

  it("rien de prévu demain : aucune notification (le soir est seulement noté comme examiné)", () => {
    const [r] = pendingReminders(agenda({}), settings(), at(20, 1), none);
    expect(r).toMatchObject({ key: TOMORROW_KEY, skip: true });
  });

  it("l'heure choisie est respectée (21:30)", () => {
    expect(pendingReminders(FULL, settings({ tomorrowTime: "21:30" }), at(21, 29), none)).toEqual([]);
    expect(pendingReminders(FULL, settings({ tomorrowTime: "21:30" }), at(21, 30), none)).toHaveLength(1);
  });

  it("n'affecte pas les autres rappels (cours, devoirs)", () => {
    const s = settings({ courses: true, homework: true, homeworkTime: "07:30", tomorrow: false });
    const keys = pendingReminders(FULL, s, at(20), none).map((r) => r.key);
    expect(keys).toEqual(["homework-summary"]);
  });
});

// ---------------------------------------------------------------------------
// Envoi réel : runReminderTick dans un faux navigateur
// ---------------------------------------------------------------------------

type Shown = { via: "sw" | "page"; title: string; body: string; tag: string; data?: unknown };

describe("envoi du rappel du soir (runReminderTick)", () => {
  let browser: FakeBrowser;
  let shown: Shown[];
  let events: { summary: string }[];

  function stubNotifications(opts: { permission: NotificationPermission; serviceWorker: boolean }) {
    shown = [];
    class FakeNotification {
      static permission = opts.permission;
      onclick: (() => void) | null = null;
      constructor(title: string, o: NotificationOptions) {
        shown.push({ via: "page", title, body: String(o.body), tag: String(o.tag), data: o.data });
      }
      close() {}
    }
    vi.stubGlobal("Notification", FakeNotification);
    vi.stubGlobal(
      "navigator",
      opts.serviceWorker
        ? {
            serviceWorker: {
              getRegistration: async () => ({
                active: {},
                showNotification: async (title: string, o: NotificationOptions) => {
                  shown.push({ via: "sw", title, body: String(o.body), tag: String(o.tag), data: o.data });
                },
              }),
            },
          }
        : {},
    );
  }

  beforeEach(() => {
    browser = installBrowser();
    setActiveUser("user_tomorrow");
    events = [];
    browser.window.addEventListener(TOMORROW_EVENT, (e) => events.push((e as CustomEvent).detail));
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    setActiveUser(null);
    vi.unstubAllGlobals();
  });

  it("passe par le service worker d'Orbs, une seule fois, et propose le récapitulatif dans Orbs", async () => {
    stubNotifications({ permission: "granted", serviceWorker: true });
    vi.setSystemTime(at(20, 2));
    await runReminderTick(FULL, settings());
    expect(shown).toHaveLength(1);
    expect(shown[0]).toMatchObject({ via: "sw", title: "Voici ce qui t’attend demain", tag: "orbs-demain" });
    expect(shown[0].data).toEqual({ url: "/accueil?rappel=demain", open: "tomorrow" });
    expect(events).toEqual([{ summary: "3 cours · 1 devoir à rendre · 2 devoirs à terminer" }]);
    expect(reminderFiredToday(TOMORROW_KEY)).toBe(true);
    // Ticks suivants (même soir) : rien de plus.
    vi.setSystemTime(at(20, 30));
    await runReminderTick(FULL, settings());
    expect(shown).toHaveLength(1);
    expect(events).toHaveLength(1);
  });

  it("sans service worker : API Notification de la page", async () => {
    stubNotifications({ permission: "granted", serviceWorker: false });
    vi.setSystemTime(at(20, 0));
    await runReminderTick(FULL, settings());
    expect(shown.map((s) => s.via)).toEqual(["page"]);
  });

  it("notifications refusées : pas de notification système, mais le récapitulatif est proposé dans Orbs", async () => {
    stubNotifications({ permission: "denied", serviceWorker: true });
    vi.setSystemTime(at(20, 0));
    await runReminderTick(FULL, settings());
    expect(shown).toEqual([]);
    expect(events).toHaveLength(1);
  });

  it("rattrapage tardif : aucune notification système, seulement le bandeau dans Orbs", async () => {
    stubNotifications({ permission: "granted", serviceWorker: true });
    vi.setSystemTime(at(22, 45));
    await runReminderTick(FULL, settings());
    expect(shown).toEqual([]);
    expect(events).toHaveLength(1);
  });

  it("rien demain : ni notification ni bandeau, et pas de nouvel examen ce soir", async () => {
    stubNotifications({ permission: "granted", serviceWorker: true });
    vi.setSystemTime(at(20, 0));
    await runReminderTick(agenda({}), settings());
    expect(shown).toEqual([]);
    expect(events).toEqual([]);
    expect(reminderFiredToday(TOMORROW_KEY)).toBe(true);
    // Un devoir ajouté à 21 h ne déclenche pas de rappel surprise.
    vi.setSystemTime(at(21, 0));
    await runReminderTick(FULL, settings());
    expect(shown).toEqual([]);
  });

  it("le suivi repart chaque jour : le lendemain soir, nouveau rappel", async () => {
    stubNotifications({ permission: "granted", serviceWorker: true });
    vi.setSystemTime(at(20, 0));
    await runReminderTick(FULL, settings());
    vi.setSystemTime(new Date(2026, 10, 24, 20, 0)); // mardi soir → mercredi
    const wednesday = agenda({ courses: [course({ day: 2, subject: "Philo" })] });
    await runReminderTick(wednesday, settings());
    expect(shown).toHaveLength(2);
    expect(shown[1].body).toContain("08:00 Philo");
  });

  it("activer le rappel après l'heure : il commence le lendemain (markReminderFired)", async () => {
    stubNotifications({ permission: "granted", serviceWorker: true });
    vi.setSystemTime(at(21, 0));
    markReminderFired(TOMORROW_KEY);
    await runReminderTick(FULL, settings());
    expect(shown).toEqual([]);
    expect(events).toEqual([]);
  });

  it("réglages enregistrés dans l'espace du compte et relus (heure invalide → défaut)", () => {
    saveNotifSettings({ ...defaultNotifSettings(), tomorrow: true, tomorrowTime: "21:15" });
    expect(loadNotifSettings()).toMatchObject({ tomorrow: true, tomorrowTime: "21:15" });
    browser.localStorage.setItem(
      "orbs.user.user_tomorrow:orbs.agenda.notif.v1",
      JSON.stringify({ enabled: true, tomorrow: true, tomorrowTime: "25:99" }),
    );
    expect(loadNotifSettings()).toMatchObject({ tomorrow: true, tomorrowTime: "20:00" });
    setActiveUser("user_other");
    expect(loadNotifSettings().tomorrow).toBe(false);
  });
});

describe("plusieurs onglets : un seul déclenche (runExclusive)", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("avec Web Locks, deux passages simultanés n'exécutent le travail qu'une fois", async () => {
    let held = false;
    vi.stubGlobal("navigator", {
      locks: {
        request: async (_name: string, _o: unknown, cb: (lock: object | null) => Promise<void>) => {
          if (held) return cb(null);
          held = true;
          try {
            await cb({});
          } finally {
            held = false;
          }
        },
      },
    });
    let runs = 0;
    const work = async () => {
      runs += 1;
      await new Promise((r) => setTimeout(r, 5));
    };
    await Promise.all([runExclusive(work), runExclusive(work)]);
    expect(runs).toBe(1);
  });

  it("sans Web Locks : seul l'onglet visible déclenche (comportement d'avant)", async () => {
    vi.stubGlobal("navigator", {});
    vi.stubGlobal("document", { hidden: true });
    let runs = 0;
    await runExclusive(async () => void (runs += 1));
    expect(runs).toBe(0);
    vi.stubGlobal("document", { hidden: false });
    await runExclusive(async () => void (runs += 1));
    expect(runs).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Service worker : toucher la notification
// ---------------------------------------------------------------------------

describe("service worker : toucher la notification du soir", () => {
  const SOURCE = fs.readFileSync(path.resolve(__dirname, "../public/sw.js"), "utf8");
  const ORIGIN = "https://orbs.test";

  function load(windows: { url: string; focused?: boolean }[]) {
    const listeners: Record<string, (e: unknown) => void> = {};
    const log = { focused: [] as string[], messages: [] as { url: string; data: unknown }[], opened: [] as string[] };
    const clients = windows.map((w) => ({
      url: w.url,
      focused: !!w.focused,
      focus: async () => void log.focused.push(w.url),
      postMessage: (data: unknown) => void log.messages.push({ url: w.url, data }),
    }));
    vm.runInNewContext(SOURCE, {
      self: {
        addEventListener: (t: string, fn: (e: unknown) => void) => void (listeners[t] = fn),
        skipWaiting: () => {},
        clients: {
          claim: async () => {},
          matchAll: async () => clients,
          openWindow: async (url: string) => void log.opened.push(url),
        },
        location: { origin: ORIGIN },
      },
      caches: { open: async () => ({}), keys: async () => [], delete: async () => true, match: async () => undefined },
      fetch: async () => ({}),
      Response: class {},
      URL,
      JSON,
      Promise,
      Date,
    });
    async function click(data: unknown) {
      const waits: Promise<unknown>[] = [];
      let closed = false;
      listeners.notificationclick({
        notification: { data, close: () => void (closed = true) },
        waitUntil: (p: Promise<unknown>) => void waits.push(p),
      });
      await Promise.all(waits);
      return closed;
    }
    return { click, log };
  }

  it("Orbs ouvert : revient sur l'onglet et lui demande d'ouvrir le récapitulatif", async () => {
    const sw = load([{ url: `${ORIGIN}/agenda` }, { url: `${ORIGIN}/accueil`, focused: true }]);
    const closed = await sw.click({ url: "/accueil?rappel=demain", open: "tomorrow" });
    expect(closed).toBe(true);
    expect(sw.log.focused).toEqual([`${ORIGIN}/accueil`]);
    expect(sw.log.messages).toEqual([{ url: `${ORIGIN}/accueil`, data: { type: "orbs:notification-open", open: "tomorrow" } }]);
    expect(sw.log.opened).toEqual([]);
  });

  it("Orbs fermé : ouvre Orbs directement sur le récapitulatif", async () => {
    const sw = load([]);
    await sw.click({ url: "/accueil?rappel=demain", open: "tomorrow" });
    expect(sw.log.opened).toEqual(["/accueil?rappel=demain"]);
  });

  it("n'ouvre jamais une adresse extérieure", async () => {
    const sw = load([]);
    await sw.click({ url: "https://exemple.com/piege", open: null });
    await sw.click({ url: "//exemple.com", open: null });
    await sw.click({ url: "/\\exemple.com", open: null });
    await sw.click({ url: "/agenda?vue=edt", open: null });
    expect(sw.log.opened).toEqual(["/accueil", "/accueil", "/accueil", "/agenda?vue=edt"]);
  });
});
