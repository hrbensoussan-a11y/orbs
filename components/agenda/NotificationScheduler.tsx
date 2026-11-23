"use client";

// Planificateur des rappels de l'agenda. Il tourne en tâche de fond tant
// qu'Orbs est ouvert sur l'appareil — y compris dans un onglet en
// arrière-plan sur ordinateur. À chaque « tick » (et quand on revient sur
// l'onglet), il vérifie l'agenda et déclenche les rappels dus (cours qui
// approchent, devoirs du jour, « Préparer ma journée de demain ») — sonnerie
// + notification.
//
// Plusieurs onglets ouverts : un seul déclenche à la fois (runExclusive, Web
// Locks), et le suivi « déjà déclenché » est noté avant l'envoi : jamais de
// doublon. Les rappels quand Orbs est complètement fermé demandent le web
// push (serveur d'envoi) : voir docs/notifications.md.
//
// Mode Concentration : l'état du minuteur (lib/learn/focus) est relu à chaque
// passage ; un changement du minuteur (début, pause, fin) relance un passage,
// pour présenter aussitôt les rappels mis en attente.

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { loadAgenda } from "@/lib/agenda/store";
import {
  loadNotifSettings,
  runExclusive,
  runReminderTick,
  NOTIF_EVENT,
  NOTIF_OPEN_EVENT,
} from "@/lib/agenda/notifications";
import { FOCUS_EVENT, isFocusActive } from "@/lib/learn/focus";
import { unlockOnGesture } from "@/lib/sound/ringtones";
import { TomorrowRecap } from "@/components/agenda/TomorrowRecap";

const TICK_MS = 30_000; // on vérifie toutes les 30 s

export function NotificationScheduler() {
  const router = useRouter();

  // Toucher le rappel du journal ouvre l'écriture (notification de la page
  // ou message du service worker).
  useEffect(() => {
    const openJournal = () => router.push("/write");
    const onOpen = (e: Event) => {
      if ((e as CustomEvent<{ open?: string }>).detail?.open === "journal") openJournal();
    };
    const onWorker = (e: MessageEvent) => {
      const d = e.data as { type?: string; open?: string } | null;
      if (d?.type === "orbs:notification-open" && d.open === "journal") openJournal();
    };
    window.addEventListener(NOTIF_OPEN_EVENT, onOpen);
    const sw = "serviceWorker" in navigator ? navigator.serviceWorker : null;
    sw?.addEventListener("message", onWorker);
    return () => {
      window.removeEventListener(NOTIF_OPEN_EVENT, onOpen);
      sw?.removeEventListener("message", onWorker);
    };
  }, [router]);

  useEffect(() => {
    // Débloque le son au premier geste pour que les rappels programmés
    // puissent jouer leur sonnerie.
    unlockOnGesture();

    let stopped = false;

    function tick() {
      if (stopped) return;
      try {
        if (!loadNotifSettings().enabled) return;
        // Réglages et agenda relus DANS le verrou : l'état le plus récent.
        void runExclusive(async () => {
          const settings = loadNotifSettings();
          if (!settings.enabled) return;
          await runReminderTick(loadAgenda(), settings, { focusActive: isFocusActive() });
        }).catch(() => {});
      } catch {
        /* lecture locale faillible : on ignore */
      }
    }

    // Un premier passage peu après le montage, puis sur intervalle.
    const first = setTimeout(tick, 1500);
    const id = setInterval(tick, TICK_MS);

    // Revenir sur l'onglet relance une vérification immédiate.
    const onVisible = () => {
      if (!document.hidden) tick();
    };
    document.addEventListener("visibilitychange", onVisible);
    // Un changement de réglages ou du minuteur relance aussi un passage.
    window.addEventListener(NOTIF_EVENT, tick);
    window.addEventListener(FOCUS_EVENT, tick);

    return () => {
      stopped = true;
      clearTimeout(first);
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener(NOTIF_EVENT, tick);
      window.removeEventListener(FOCUS_EVENT, tick);
    };
  }, []);

  return <TomorrowRecap />;
}
