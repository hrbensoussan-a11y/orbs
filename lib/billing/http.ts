// Réponses HTTP normalisées côté « crédits / abonnement » pour les routes IA.
//
// On renvoie 402 (Payment Required) — sémantiquement adapté — avec un `message`
// affichable tel quel par le client (le chat lit `data.message`) et un drapeau
// `upgrade` pour proposer un lien vers la page d'abonnement.

import { NextResponse } from "next/server";
import { formatInt } from "@/lib/format";

/** Plus assez de crédits dans le portefeuille. */
export function insufficientCreditsResponse(needed: number, balance: number) {
  return NextResponse.json(
    {
      error: "insufficient_credits",
      upgrade: true,
      balance,
      needed,
      message: `Crédits insuffisants : il te reste ${formatInt(balance)} crédit${balance > 1 ? "s" : ""} (${formatInt(needed)} nécessaires). Passe à une offre supérieure ou attends le renouvellement.`,
    },
    { status: 402 },
  );
}

/** Moteur réservé à une offre payante (ex. Ultra pour un compte gratuit). */
export function engineLockedResponse(engineLabel: string) {
  return NextResponse.json(
    {
      error: "upgrade_required",
      upgrade: true,
      message: `Le moteur ${engineLabel} (réflexion poussée) est réservé à Orbs Plus et Orbs Ultimate. Passe à une offre supérieure pour l'utiliser.`,
    },
    { status: 402 },
  );
}

/** Fonctionnalité réservée à une offre (message personnalisable). */
export function featureLockedResponse(message: string) {
  return NextResponse.json(
    { error: "upgrade_required", upgrade: true, message },
    { status: 402 },
  );
}
