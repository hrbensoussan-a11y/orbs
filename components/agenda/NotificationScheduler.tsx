"use client";

// Planificateur des rappels de l'agenda. Ne rend rien à l'écran : il tourne
// en tâche de fond tant qu'Orbs est ouvert. À chaque « tick » (et quand on
// revient sur l'onglet), il vérifie l'agenda et déclenche les rappels dus
// (cours qui approchent, devoirs du jour) — sonnerie + notification.
//
// Les rappels « même app fermée » demandent un serveur (web push) ; ils
// viendront avec la version en ligne. Ici, tout reste local au premier plan.

import { useEffect } from "react";
import { loadAgenda } from "@/lib/agenda/store";
import {
  loadNotifSettings,
  runReminderTick,
  NOTIF_EVENT,
} from "@/lib/agenda/notifications";
import { unlockOnGesture } from "@/lib/sound/ringtones";

const TICK_MS = 30_000; // on vérifie toutes les 30 s

export function NotificationScheduler() {
  useEffect(() => {
    // Débloque le son au premier geste pour que les rappels programmés
    // puissent jouer leur sonnerie.
    unlockOnGesture();

    let stopped = false;

    function tick() {
      if (stopped || typeof document === "undefined" || document.hidden) return;
      try {
        const settings = loadNotifSettings();
        if (!settings.enabled) return;
        void runReminderTick(loadAgenda(), settings);
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

  return null;
}
