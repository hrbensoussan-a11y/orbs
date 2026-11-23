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

import { useEffect } from "react";
import { loadAgenda } from "@/lib/agenda/store";
import {
  loadNotifSettings,
  runExclusive,
  runReminderTick,
  NOTIF_EVENT,
} from "@/lib/agenda/notifications";
import { unlockOnGesture } from "@/lib/sound/ringtones";
import { TomorrowRecap } from "@/components/agenda/TomorrowRecap";

const TICK_MS = 30_000; // on vérifie toutes les 30 s

export function NotificationScheduler() {
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
          await runReminderTick(loadAgenda(), settings);
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
    // Un changement de réglages (autre composant) relance aussi un passage.
    window.addEventListener(NOTIF_EVENT, tick);

    return () => {
      stopped = true;
      clearTimeout(first);
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener(NOTIF_EVENT, tick);
    };
  }, []);

  return <TomorrowRecap />;
}
