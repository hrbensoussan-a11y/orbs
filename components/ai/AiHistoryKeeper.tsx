"use client";

// Applique, sur cet appareil, la règle de conservation des conversations du
// compte (lib/ai/retention) — sur toutes les pages d'Orbs, pas seulement
// celle de l'assistant : à l'ouverture, au retour sur l'onglet et toutes les
// heures. Suppression après 30 jours sans activité, et « Supprimer
// l'historique » demandé depuis n'importe quel appareil. Ne rend rien.

import { useEffect } from "react";
import { enforceRetention } from "@/lib/ai/history";
import type { AiRetention } from "@/lib/ai/retention";
import { getAiHistoryRule } from "@/app/actions/assistant";

const EVERY_MS = 60 * 60 * 1000;

export function AiHistoryKeeper({
  retention,
  clearedAt,
}: {
  retention: AiRetention;
  clearedAt: number | null;
}) {
  useEffect(() => {
    let stopped = false;
    const apply = (r: AiRetention, c: number | null) => {
      try {
        enforceRetention(r, c);
      } catch {
        /* stockage indisponible : nouvel essai plus tard */
      }
    };
    // À l'affichage, la règle vient d'être lue par le serveur.
    apply(retention, clearedAt);
    // Ensuite (onglet resté ouvert), on relit la règle ACTUELLE du compte
    // avant d'appliquer quoi que ce soit : elle a pu changer sur un autre
    // appareil. Sans réponse (hors ligne, session terminée) : rien.
    const refresh = () => {
      getAiHistoryRule()
        .then((rule) => {
          if (!stopped && rule) apply(rule.retention, rule.clearedAt);
        })
        .catch(() => {});
    };
    const id = setInterval(refresh, EVERY_MS);
    const onVisible = () => {
      if (!document.hidden) refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stopped = true;
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [retention, clearedAt]);
  return null;
}
