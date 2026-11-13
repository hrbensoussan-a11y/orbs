// Notifications de l'agenda — réglages + logique des rappels.
// Les rappels se déclenchent quand Orbs est ouvert (premier plan) : un cours
// qui approche, les devoirs du jour. La sonnerie choisie est jouée par la
// Web Audio API (voir lib/sound/ringtones). Tout est local à l'appareil.
//
// Les notifications « même app fermée » (web push) demandent un serveur et
// viendront avec la version en ligne.

import { dateKey, mondayIndex, type AgendaState } from "@/lib/agenda/store";
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
};

export type NotifPermission = "unsupported" | "default" | "granted" | "denied";

const KEY = "orbs.agenda.notif.v1";
const FIRED_KEY = "orbs.agenda.notif.fired.v1";
export const NOTIF_EVENT = "orbs:notif";

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
  };
}

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
 * Joue la sonnerie choisie et, si le navigateur l'autorise, affiche une
 * notification. La notification est « silencieuse » côté OS pour ne pas doubler
 * la sonnerie d'Orbs.
 */
export async function fireNotification(
  title: string,
  body: string,
  settings: NotifSettings,
  tag = "orbs-agenda",
): Promise<void> {
  playRingtone(settings.sound, settings.volume).catch(() => {});
  try {
    if (typeof Notification !== "undefined" && Notification.permission === "granted") {
      new Notification(title, {
        body,
        tag,
        icon: "/icon-192.png",
        badge: "/icon-192.png",
        silent: true,
      });
    }
  } catch {
    /* ignore */
  }
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

export type Reminder = { key: string; title: string; body: string; tag: string };

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

  // Résumé des devoirs (une fois par jour, à partir de l'heure choisie).
  if (settings.homework && nowMin >= toMin(settings.homeworkTime)) {
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
  for (const r of due) {
    await fireNotification(r.title, r.body, settings, r.tag);
    set.add(r.key);
  }
  saveFired({ day: fired.day, keys: [...set] });
}
