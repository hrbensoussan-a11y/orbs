// Notifications de l'agenda — réglages + logique des rappels.
// Les rappels se déclenchent quand Orbs est ouvert sur l'appareil — au premier
// plan, ou dans un onglet en arrière-plan sur ordinateur : un cours qui
// approche, les devoirs du jour, et le soir « Préparer ma journée de demain ».
// La sonnerie choisie est jouée par la Web Audio API (lib/sound/ringtones) ;
// la notification système passe par le service worker d'Orbs quand il est
// actif (obligatoire sur Android), sinon par l'API Notification.
// Tout est local à l'appareil (réglages, agenda, suivi « déjà envoyé »).
//
// Les notifications quand Orbs est complètement fermé (web push) demandent un
// serveur d'envoi et l'agenda côté serveur : voir docs/notifications.md.

import { dateKey, mondayIndex, type AgendaState } from "@/lib/agenda/store";
import { buildTomorrowPlan, hasSomethingTomorrow, tomorrowNotification, tomorrowSummary } from "@/lib/agenda/tomorrow";
import { playRingtone, DEFAULT_RINGTONE, type RingtoneId } from "@/lib/sound/ringtones";
import { readUserItem, writeUserItem } from "@/lib/userStorage";

export type NotifSettings = {
  enabled: boolean; // interrupteur général
  sound: RingtoneId; // sonnerie choisie
  volume: number; // 0 → 1
  courses: boolean; // prévenir avant les cours
  leadMin: number; // minutes avant un cours (0 = à l'heure)
  homework: boolean; // résumé des devoirs
  homeworkTime: string; // "HH:MM" — heure du résumé
  homeworkWeekend: boolean; // résumé aussi le samedi et le dimanche
  tomorrow: boolean; // le soir : « Préparer ma journée de demain »
  tomorrowTime: string; // "HH:MM" — heure du récapitulatif du soir
};

export type NotifPermission = "unsupported" | "default" | "granted" | "denied";

const KEY = "orbs.agenda.notif.v1";
const FIRED_KEY = "orbs.agenda.notif.fired.v1";
export const NOTIF_EVENT = "orbs:notif";
/** Ouvre une vue liée à une notification (détail : { open: "tomorrow" }). */
export const NOTIF_OPEN_EVENT = "orbs:notif-open";
/** Le rappel du soir vient d'être déclenché (détail : { summary }). */
export const TOMORROW_EVENT = "orbs:tomorrow";
/** Clé du rappel du soir dans le suivi « déjà déclenché aujourd'hui ». */
export const TOMORROW_KEY = "prepare-tomorrow";
/**
 * Au-delà de ce délai après l'heure choisie (Orbs était fermé), le
 * récapitulatif est proposé discrètement dans Orbs, sans sonnerie ni
 * notification système.
 */
export const TOMORROW_GRACE_MIN = 15;

export const LEAD_CHOICES = [0, 5, 10, 15, 30, 60] as const;

export function defaultNotifSettings(): NotifSettings {
  return {
    enabled: false,
    sound: DEFAULT_RINGTONE,
    volume: 0.7,
    courses: true,
    leadMin: 10,
    homework: true,
    homeworkTime: "07:30",
    homeworkWeekend: true,
    tomorrow: false,
    tomorrowTime: "20:00",
  };
}

const TIME_RE = /^([01]?\d|2[0-3]):[0-5]\d$/;

function clamp(n: unknown, min: number, max: number, def: number): number {
  return typeof n === "number" && Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : def;
}

export function loadNotifSettings(): NotifSettings {
  const d = defaultNotifSettings();
  if (typeof window === "undefined") return d;
  try {
    const raw = readUserItem(KEY);
    if (!raw) return d;
    const o = JSON.parse(raw) as Partial<NotifSettings>;
    return {
      enabled: !!o.enabled,
      sound: (o.sound as RingtoneId) || d.sound,
      volume: clamp(o.volume, 0, 1, d.volume),
      courses: o.courses === undefined ? d.courses : !!o.courses,
      leadMin: clamp(o.leadMin, 0, 180, d.leadMin),
      homework: o.homework === undefined ? d.homework : !!o.homework,
      homeworkTime: /^\d{1,2}:\d{2}$/.test(String(o.homeworkTime)) ? String(o.homeworkTime) : d.homeworkTime,
      homeworkWeekend: o.homeworkWeekend === undefined ? d.homeworkWeekend : !!o.homeworkWeekend,
      tomorrow: o.tomorrow === undefined ? d.tomorrow : !!o.tomorrow,
      tomorrowTime: TIME_RE.test(String(o.tomorrowTime)) ? String(o.tomorrowTime) : d.tomorrowTime,
    };
  } catch {
    return d;
  }
}

export function saveNotifSettings(s: NotifSettings): void {
  if (typeof window === "undefined") return;
  try {
    writeUserItem(KEY, JSON.stringify(s));
    window.dispatchEvent(new Event(NOTIF_EVENT));
  } catch {
    /* quota / mode privé : on ignore */
  }
}

// ---- Permission navigateur ----

export function notifPermission(): NotifPermission {
  try {
    if (typeof Notification === "undefined") return "unsupported";
    return Notification.permission as NotifPermission;
  } catch {
    return "unsupported";
  }
}

export async function requestNotifPermission(): Promise<NotifPermission> {
  try {
    if (typeof Notification === "undefined") return "unsupported";
    const p = await Notification.requestPermission();
    return p as NotifPermission;
  } catch {
    return "unsupported";
  }
}

// ---- Déclenchement ----

/**
 * Notification système, si le navigateur l'autorise. Par le service worker
 * d'Orbs quand il est actif (seule voie possible sur Android, et la
 * notification reste dans le centre de notifications) ; sinon par l'API
 * Notification de la page. `open` : vue à ouvrir quand on touche la
 * notification (voir public/sw.js et NOTIF_OPEN_EVENT).
 */
async function showSystemNotification(
  title: string,
  body: string,
  tag: string,
  open?: string,
): Promise<boolean> {
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return false;
  const url = open === "tomorrow" ? "/accueil?rappel=demain" : "/accueil";
  const options: NotificationOptions = {
    body,
    tag,
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    // « Silencieuse » côté système : la sonnerie d'Orbs joue déjà.
    silent: true,
    data: { url, open: open ?? null },
  };
  try {
    const reg =
      typeof navigator !== "undefined" && "serviceWorker" in navigator
        ? await navigator.serviceWorker.getRegistration()
        : undefined;
    if (reg?.active) {
      await reg.showNotification(title, options);
      return true;
    }
  } catch {
    /* repli sur l'API de la page */
  }
  try {
    const n = new Notification(title, options);
    n.onclick = () => {
      try {
        window.focus();
        if (open) window.dispatchEvent(new CustomEvent(NOTIF_OPEN_EVENT, { detail: { open } }));
      } catch {
        /* ignore */
      }
      n.close();
    };
    return true;
  } catch {
    return false;
  }
}

/**
 * Joue la sonnerie choisie et, si le navigateur l'autorise, affiche une
 * notification système (« silencieuse » côté OS pour ne pas doubler la
 * sonnerie d'Orbs).
 */
export async function fireNotification(
  title: string,
  body: string,
  settings: NotifSettings,
  tag = "orbs-agenda",
  open?: string,
): Promise<void> {
  playRingtone(settings.sound, settings.volume).catch(() => {});
  await showSystemNotification(title, body, tag, open).catch(() => false);
}

// ---- Suivi « déjà déclenché » (une fois par jour et par rappel) ----

type FiredLog = { day: string; keys: string[] };

function loadFired(): FiredLog {
  const today = dateKey();
  if (typeof window === "undefined") return { day: today, keys: [] };
  try {
    const raw = readUserItem(FIRED_KEY);
    const o = raw ? (JSON.parse(raw) as Partial<FiredLog>) : null;
    if (!o || o.day !== today || !Array.isArray(o.keys)) return { day: today, keys: [] };
    return { day: today, keys: o.keys.filter((k) => typeof k === "string") };
  } catch {
    return { day: today, keys: [] };
  }
}

function saveFired(log: FiredLog): void {
  if (typeof window === "undefined") return;
  try {
    writeUserItem(FIRED_KEY, JSON.stringify(log));
  } catch {
    /* ignore */
  }
}

/** Vrai si ce rappel a déjà été traité aujourd'hui sur cet appareil. */
export function reminderFiredToday(key: string): boolean {
  return loadFired().keys.includes(key);
}

/** Marque un rappel comme traité pour aujourd'hui (il ne partira plus ce jour-là). */
export function markReminderFired(key: string): void {
  const log = loadFired();
  if (!log.keys.includes(key)) saveFired({ day: log.day, keys: [...log.keys, key] });
}

// ---- Temps ----

function toMin(hm: string): number {
  const [h, m] = hm.split(":");
  return (Number(h) || 0) * 60 + (Number(m) || 0);
}

// ---- Résumé des devoirs (réutilisé par l'accueil) ----

/** Nombre de devoirs à signaler aujourd'hui + libellé lisible, ou null. */
export function homeworkSummary(
  agenda: AgendaState,
  now: Date = new Date(),
): { count: number; body: string } | null {
  const today = dateKey(now);
  const tomorrow = dateKey(new Date(now.getTime() + 86400000));
  const open = agenda.homework.filter((h) => !h.done);
  const late = open.filter((h) => h.due < today).length;
  const soon = open.filter((h) => h.due === today || h.due === tomorrow).length;
  if (late === 0 && soon === 0) return null;
  const parts: string[] = [];
  if (late > 0) parts.push(`${late} en retard`);
  if (soon > 0) parts.push(`${soon} pour aujourd'hui ou demain`);
  return { count: late + soon, body: `Devoirs : ${parts.join(" · ")}.` };
}

export type Reminder = {
  key: string;
  title: string;
  body: string;
  tag: string;
  /** Vue à ouvrir quand on touche la notification. */
  open?: "tomorrow";
  /** Résumé d'une ligne (bandeau dans Orbs). */
  summary?: string;
  /** Sans sonnerie ni notification système : seulement proposé dans Orbs. */
  quiet?: boolean;
  /** Rien à signaler : on note juste que le rappel a été examiné ce jour-là. */
  skip?: boolean;
};

/**
 * Les rappels à déclencher maintenant, compte tenu des réglages, de l'agenda,
 * et de ceux déjà déclenchés aujourd'hui. Ne lit/écrit rien : fonction pure
 * (le suivi « déjà déclenché » est passé en argument).
 */
export function pendingReminders(
  agenda: AgendaState,
  settings: NotifSettings,
  now: Date,
  firedKeys: Set<string>,
): Reminder[] {
  if (!settings.enabled) return [];
  const out: Reminder[] = [];
  const nowMin = now.getHours() * 60 + now.getMinutes();

  // Cours qui approchent (aujourd'hui).
  if (settings.courses) {
    const day = mondayIndex(now);
    for (const c of agenda.courses) {
      if (c.day !== day) continue;
      const startMin = toMin(c.start);
      const triggerMin = startMin - settings.leadMin;
      // Fenêtre : du moment du rappel jusqu'au début du cours.
      if (nowMin < triggerMin || nowMin > startMin) continue;
      const key = `course:${c.id}`;
      if (firedKeys.has(key)) continue;
      const when = settings.leadMin > 0 ? `dans ${settings.leadMin} min (${c.start})` : `à ${c.start}`;
      const room = c.room ? ` · salle ${c.room}` : "";
      out.push({
        key,
        title: `Cours bientôt : ${c.subject}`,
        body: `${c.subject} ${when}${room}.`,
        tag: `orbs-cours-${c.id}`,
      });
    }
  }

  // Résumé des devoirs (une fois par jour, à partir de l'heure choisie ;
  // pas le samedi ni le dimanche si l'élève l'a choisi).
  const weekend = now.getDay() === 0 || now.getDay() === 6;
  const homeworkToday = settings.homework && (settings.homeworkWeekend !== false || !weekend);
  if (homeworkToday && nowMin >= toMin(settings.homeworkTime)) {
    const key = "homework-summary";
    if (!firedKeys.has(key)) {
      const sum = homeworkSummary(agenda, now);
      if (sum) {
        out.push({
          key,
          title: "Tes devoirs",
          body: sum.body,
          tag: "orbs-devoirs",
        });
      }
    }
  }

  // Le soir : « Préparer ma journée de demain », une fois par jour à partir
  // de l'heure choisie. Examiné UNE fois : s'il n'y a ni cours ni devoir à
  // rendre demain, aucun rappel ce soir-là. Si Orbs était fermé à l'heure
  // dite, le récapitulatif est proposé discrètement à l'ouverture (sans
  // sonnerie), jusqu'à minuit.
  if (settings.tomorrow && nowMin >= toMin(settings.tomorrowTime) && !firedKeys.has(TOMORROW_KEY)) {
    const plan = buildTomorrowPlan(agenda, now);
    if (!hasSomethingTomorrow(plan)) {
      out.push({ key: TOMORROW_KEY, title: "", body: "", tag: "orbs-demain", skip: true });
    } else {
      const { title, body } = tomorrowNotification(plan);
      out.push({
        key: TOMORROW_KEY,
        title,
        body,
        tag: "orbs-demain",
        open: "tomorrow",
        summary: tomorrowSummary(plan),
        quiet: nowMin - toMin(settings.tomorrowTime) > TOMORROW_GRACE_MIN,
      });
    }
  }

  return out;
}

/**
 * Vérifie l'agenda et déclenche les rappels dus (sonnerie + notification),
 * en évitant de répéter un rappel déjà envoyé aujourd'hui. À appeler sur un
 * intervalle depuis le planificateur (NotificationScheduler).
 */
export async function runReminderTick(agenda: AgendaState, settings: NotifSettings): Promise<void> {
  if (!settings.enabled) return;
  const fired = loadFired();
  const set = new Set(fired.keys);
  const due = pendingReminders(agenda, settings, new Date(), set);
  if (due.length === 0) return;
  // Noté AVANT l'envoi : un onglet qui lirait le suivi juste après ne
  // renverra pas le même rappel.
  for (const r of due) set.add(r.key);
  saveFired({ day: fired.day, keys: [...set] });
  for (const r of due) {
    if (r.skip) continue;
    if (!r.quiet) await fireNotification(r.title, r.body, settings, r.tag, r.open);
    if (r.open === "tomorrow") {
      try {
        window.dispatchEvent(new CustomEvent(TOMORROW_EVENT, { detail: { summary: r.summary ?? "" } }));
      } catch {
        /* hors navigateur */
      }
    }
  }
}

/**
 * Exécute un passage du planificateur dans UN SEUL onglet à la fois (Web
 * Locks) : plusieurs onglets d'Orbs ouverts, même en arrière-plan, ne
 * déclenchent jamais deux fois le même rappel. Sans Web Locks (navigateurs
 * anciens), seul l'onglet visible déclenche, comme avant.
 */
export async function runExclusive(fn: () => Promise<void>): Promise<void> {
  const locks = typeof navigator !== "undefined" && "locks" in navigator ? navigator.locks : null;
  if (locks?.request) {
    await locks.request("orbs-reminders", { ifAvailable: true }, async (lock) => {
      if (lock) await fn();
    });
    return;
  }
  if (typeof document !== "undefined" && !document.hidden) await fn();
}
