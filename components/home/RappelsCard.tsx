"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  GraduationCap,
  CalendarCheck,
  NotebookPen,
  Bell,
  BellRing,
  ChevronRight,
  Check,
} from "lucide-react";
import { load as loadLearn } from "@/lib/learn/store";
import { dueCount } from "@/lib/learn/sm2";
import { loadAgenda, dateKey } from "@/lib/agenda/store";
import {
  loadNotifSettings,
  saveNotifSettings,
  notifPermission,
  requestNotifPermission,
  NOTIF_EVENT,
} from "@/lib/agenda/notifications";

type Reminder = {
  key: string;
  href: string;
  Icon: typeof GraduationCap;
  label: string;
  tone: string;
};

export function RappelsCard({ wroteToday }: { wroteToday: boolean }) {
  const [reminders, setReminders] = useState<Reminder[] | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [perm, setPerm] = useState<"unsupported" | "default" | "granted" | "denied">(
    "default",
  );

  useEffect(() => {
    const list: Reminder[] = [];

    // Révisions dues (module Apprendre)
    try {
      const learn = loadLearn();
      let due = 0;
      for (const d of Object.values(learn.decks)) due += dueCount(d);
      if (due > 0)
        list.push({
          key: "revisions",
          href: "/apprendre",
          Icon: GraduationCap,
          label: `${due} carte${due > 1 ? "s" : ""} à réviser`,
          tone: "var(--green)",
        });
    } catch {
      /* ignore */
    }

    // Devoirs (module Agenda)
    try {
      const ag = loadAgenda();
      const today = dateKey();
      const t = new Date();
      const tomorrow = dateKey(new Date(t.getTime() + 86400000));
      const open = ag.homework.filter((h) => !h.done);
      const late = open.filter((h) => h.due < today).length;
      const soon = open.filter((h) => h.due === today || h.due === tomorrow).length;
      if (late > 0)
        list.push({
          key: "late",
          href: "/agenda",
          Icon: CalendarCheck,
          label: `${late} devoir${late > 1 ? "s" : ""} en retard`,
          tone: "var(--coral)",
        });
      if (soon > 0)
        list.push({
          key: "soon",
          href: "/agenda",
          Icon: CalendarCheck,
          label: `${soon} devoir${soon > 1 ? "s" : ""} pour aujourd'hui ou demain`,
          tone: "var(--amber)",
        });
    } catch {
      /* ignore */
    }

    // Journal du jour
    if (!wroteToday)
      list.push({
        key: "journal",
        href: "/write",
        Icon: NotebookPen,
        label: "Écris ta page du jour",
        tone: "var(--lilac)",
      });

    // eslint-disable-next-line react-hooks/set-state-in-effect
    setReminders(list);
  }, [wroteToday]);

  // État des rappels (réglage partagé + permission navigateur).
  useEffect(() => {
    function refresh() {
      setEnabled(loadNotifSettings().enabled);
      setPerm(notifPermission());
    }
    refresh();
    window.addEventListener(NOTIF_EVENT, refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener(NOTIF_EVENT, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  // Déclenchement des rappels (sonnerie + notification) : géré globalement par
  // NotificationScheduler, pour que ça marche sur toutes les pages d'Orbs.

  async function enableNotifications() {
    const p = await requestNotifPermission();
    setPerm(p);
    const s = loadNotifSettings();
    saveNotifSettings({ ...s, enabled: true });
    setEnabled(true);
  }

  // Avant l'hydratation client : on ne rend rien (évite tout décalage serveur).
  if (reminders === null) return null;

  return (
    <section className="card p-5">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-semibold">Aujourd’hui</h2>
        {!enabled ? (
          <button
            onClick={enableNotifications}
            className="chip inline-flex items-center gap-1"
            style={{ cursor: "pointer" }}
          >
            <Bell size={13} aria-hidden /> Activer les rappels
          </button>
        ) : (
          <Link
            href="/settings"
            className="chip inline-flex items-center gap-1"
            style={{ color: "var(--green-ink)" }}
          >
            <BellRing size={13} aria-hidden /> Rappels activés
          </Link>
        )}
      </div>

      {reminders.length === 0 ? (
        <p className="text-ink-2 text-sm inline-flex items-center gap-2">
          <Check size={16} className="text-green-ink" aria-hidden /> Tout est à jour, bravo !
        </p>
      ) : (
        <div className="flex flex-col divide-y divide-[var(--line)]">
          {reminders.map((r) => (
            <Link
              key={r.key}
              href={r.href}
              className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0"
            >
              <span
                className="grid place-items-center h-9 w-9 rounded-full shrink-0"
                style={{
                  background: `color-mix(in srgb, ${r.tone} 15%, transparent)`,
                  color: r.tone,
                }}
              >
                <r.Icon size={18} strokeWidth={1.9} aria-hidden />
              </span>
              <span className="flex-1 font-medium leading-snug">{r.label}</span>
              <ChevronRight size={16} className="text-ink-3 shrink-0" aria-hidden />
            </Link>
          ))}
        </div>
      )}

      {enabled && (
        <p className="text-xs text-ink-3 mt-3">
          {perm === "denied"
            ? "Les notifications sont bloquées par le navigateur, mais la sonnerie joue quand Orbs est ouvert. "
            : "Les rappels arrivent avec leur sonnerie quand Orbs est ouvert. "}
          Choisis ta sonnerie dans les{" "}
          <Link href="/settings" className="underline">
            réglages
          </Link>
          .
        </p>
      )}
    </section>
  );
}
