"use client";

// Réglages d'apparence complémentaires, côté client (espace local du compte) :
// - Réduire les animations (accessibilité / confort / vieux téléphones).
// - Réinitialiser l'apparence (thème, fond, luminosité, animations) — action
//   qui change beaucoup de choses d'un coup, donc protégée par une
//   confirmation Oui / Non.
//
// « Réduire les animations » est stocké dans sa propre clé (orbs.motion) pour
// ne pas être écrasé quand la fenêtre Apparence réécrit orbs.appearance.

import { useEffect, useState } from "react";
import { RotateCcw } from "lucide-react";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { clearAppearance, readReducedMotion, saveReducedMotion } from "@/lib/appearance";

export function AppearanceExtras() {
  const [reduced, setReduced] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setReduced(readReducedMotion());
  }, []);

  function changeMotion(next: boolean) {
    setReduced(next);
    saveReducedMotion(next);
    document.documentElement.setAttribute(
      "data-motion",
      next ? "reduced" : "full",
    );
  }

  function doReset() {
    clearAppearance();
    // On recharge pour réappliquer proprement les réglages de départ partout
    // (le script d'init du layout s'en charge au chargement).
    window.location.reload();
  }

  return (
    <div className="flex flex-col">
      {/* Réduire les animations */}
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <p>Réduire les animations</p>
          <p className="text-sm text-ink-2">
            Moins de mouvements et de transitions. Plus reposant pour les yeux,
            et plus fluide sur un téléphone un peu lent.
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={reduced}
          aria-label="Réduire les animations"
          onClick={() => changeMotion(!reduced)}
          className="relative h-8 w-14 flex-none rounded-full transition-colors"
          style={{
            background: reduced
              ? "var(--green)"
              : "color-mix(in srgb, var(--ink-3) 40%, transparent)",
          }}
        >
          <span
            className="absolute top-1 h-6 w-6 rounded-full bg-white shadow transition-all"
            style={{ left: reduced ? "26px" : "4px" }}
          />
        </button>
      </div>

      {/* Réinitialiser l'apparence */}
      <div className="flex items-center justify-between gap-4 border-t border-line pt-4 mt-4">
        <div className="min-w-0">
          <p>Réinitialiser l’apparence</p>
          <p className="text-sm text-ink-2">
            Remet le thème, le fond, la luminosité et les animations comme au
            début.
          </p>
        </div>
        <button
          type="button"
          className="btn-ghost flex-none"
          onClick={() => setConfirmReset(true)}
        >
          <RotateCcw size={16} aria-hidden /> Réinitialiser
        </button>
      </div>

      <ConfirmDialog
        open={confirmReset}
        tone="danger"
        icon={<RotateCcw size={20} />}
        title="Réinitialiser l’apparence ?"
        message="Le thème, le fond, la luminosité et les animations reviennent aux réglages de départ. La page va se recharger. Ton compte et tes données ne changent pas."
        confirmLabel="Oui, réinitialiser"
        cancelLabel="Non"
        onCancel={() => setConfirmReset(false)}
        onConfirm={doReset}
      />
    </div>
  );
}
