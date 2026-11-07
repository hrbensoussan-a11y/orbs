// Offres commerciales d'Orbs et droits associés.
//
// Deux offres payantes — Orbs Plus et Orbs Ultimate — plus l'état « gratuit »
// implicite (aucun abonnement). L'offre « Muse » est VOLONTAIREMENT absente :
// elle est réservée à une évolution future (ne pas l'ajouter ici).
//
// Ce module est SANS secret (prix publics, droits, identifiants de Price Stripe
// qui sont des références non secrètes). Comme pricing.ts, il lit `process.env`
// et doit être consommé côté SERVEUR ; les valeurs affichées au navigateur
// passent en props depuis un composant serveur.
//
// « Les allocations mensuelles de crédits, configurables » (cahier des charges) :
// chaque allocation et chaque prix a une valeur par défaut surchargable par
// variable d'environnement. Les allocations par défaut sont calées sur une marge
// saine face au coût API maximal (allocation × valeur d'un crédit) :
//   Plus     2500 créd. × 0,002 € = 5,00 € de coût API plafond pour 12,99 €.
//   Ultimate 5000 créd. × 0,002 € = 10,00 € de coût API plafond pour 21,99 €.

import type { CreditEngine } from "./pricing";

export type PlanId = "free" | "plus" | "ultimate";
export type PaidPlanId = "plus" | "ultimate";

/** Droits et fonctionnalités rattachés à une offre. */
export type Entitlements = {
  /** Moteurs d'IA accessibles (le portefeuille, lui, reste commun). */
  engines: CreditEngine[];
  /** Assistant vocal (parole + lecture à voix haute). */
  voice: boolean;
  /** Génération de fiches de révision par IA. */
  cards: boolean;
  /** Débit maximal de requêtes IA par minute / par jour. */
  rateMaxPerMin: number;
  rateMaxPerDay: number;
  /** Support prioritaire (argument commercial Ultimate). */
  prioritySupport: boolean;
};

export type PlanConfig = {
  id: PlanId;
  name: string;
  tagline: string;
  /** Prix mensuel en euros (0 pour l'offre gratuite). */
  priceEur: number;
  /** Allocation mensuelle de crédits du portefeuille unique. */
  monthlyCredits: number;
  entitlements: Entitlements;
  /** Arguments affichés sur la page de comparaison. */
  features: string[];
  /** Offre mise en avant sur la page de comparaison. */
  highlight?: boolean;
};

function num(name: string, fallback: number): number {
  const raw = process.env[name];
  const n = raw == null || raw === "" ? NaN : Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

// --- Allocations mensuelles (configurables) --------------------------------
export const MONTHLY_CREDITS: Record<PlanId, number> = {
  free: num("CREDITS_MONTHLY_FREE", 300),
  plus: num("CREDITS_MONTHLY_PLUS", 2500),
  ultimate: num("CREDITS_MONTHLY_ULTIMATE", 5000),
};

// --- Prix affichés (configurables) -----------------------------------------
// Doit correspondre au Price réel configuré dans Stripe (étape de validation
// humaine : voir docs/abonnements.md). On ne devine pas le prix depuis Stripe
// pour garder un rendu déterministe côté serveur.
const PRICE_EUR: Record<PaidPlanId, number> = {
  plus: num("SUBSCRIPTION_PLUS_PRICE_EUR", 12.99),
  ultimate: num("SUBSCRIPTION_ULTIMATE_PRICE_EUR", 21.99),
};

export const PLANS: Record<PlanId, PlanConfig> = {
  free: {
    id: "free",
    name: "Orbs Gratuit",
    tagline: "Pour démarrer et découvrir l'assistant.",
    priceEur: 0,
    monthlyCredits: MONTHLY_CREDITS.free,
    entitlements: {
      engines: ["core"],
      voice: true,
      cards: true,
      rateMaxPerMin: num("RATE_FREE_PER_MIN", 12),
      rateMaxPerDay: num("RATE_FREE_PER_DAY", 300),
      prioritySupport: false,
    },
    features: [
      "Assistant IA Core (réflexion moyenne)",
      "Fiches de révision par IA",
      "Assistant vocal (parler / écouter)",
      "Journal, Apprendre et Agenda illimités",
    ],
  },
  plus: {
    id: "plus",
    name: "Orbs Plus",
    tagline: "Pour réviser tous les jours sans compter.",
    priceEur: PRICE_EUR.plus,
    monthlyCredits: MONTHLY_CREDITS.plus,
    entitlements: {
      engines: ["core", "ultra"],
      voice: true,
      cards: true,
      rateMaxPerMin: num("RATE_PLUS_PER_MIN", 20),
      rateMaxPerDay: num("RATE_PLUS_PER_DAY", 600),
      prioritySupport: false,
    },
    features: [
      "Tout le gratuit, et surtout :",
      "Moteur Ultra (réflexion poussée) débloqué",
      "Allocation mensuelle généreuse de crédits",
      "Débit IA augmenté",
    ],
    highlight: true,
  },
  ultimate: {
    id: "ultimate",
    name: "Orbs Ultimate",
    tagline: "Le maximum de crédits et de puissance.",
    priceEur: PRICE_EUR.ultimate,
    monthlyCredits: MONTHLY_CREDITS.ultimate,
    entitlements: {
      engines: ["core", "ultra"],
      voice: true,
      cards: true,
      rateMaxPerMin: num("RATE_ULTIMATE_PER_MIN", 30),
      rateMaxPerDay: num("RATE_ULTIMATE_PER_DAY", 1200),
      prioritySupport: true,
    },
    features: [
      "Tout Orbs Plus, et en plus :",
      "La plus grosse allocation de crédits",
      "Débit IA maximal (sessions de révision intenses)",
      "Support prioritaire",
    ],
  },
};

export const PLAN_IDS: PlanId[] = ["free", "plus", "ultimate"];
export const PAID_PLAN_IDS: PaidPlanId[] = ["plus", "ultimate"];

/** Rang d'une offre (pour distinguer montée / rétrogradation). */
export const PLAN_RANK: Record<PlanId, number> = {
  free: 0,
  plus: 1,
  ultimate: 2,
};

export function isPaidPlan(plan: string | null | undefined): plan is PaidPlanId {
  return plan === "plus" || plan === "ultimate";
}

/** Normalise une valeur quelconque en PlanId (repli « free »). */
export function toPlanId(value: unknown): PlanId {
  return value === "plus" || value === "ultimate" || value === "free"
    ? value
    : "free";
}

export function planConfig(plan: PlanId): PlanConfig {
  return PLANS[plan];
}

export function entitlementsFor(plan: PlanId): Entitlements {
  return PLANS[plan].entitlements;
}

export function monthlyCreditsFor(plan: PlanId): number {
  return PLANS[plan].monthlyCredits;
}

export function engineAllowed(plan: PlanId, engine: CreditEngine): boolean {
  return PLANS[plan].entitlements.engines.includes(engine);
}

// ---------------------------------------------------------------------------
// Identifiants de Price Stripe (références non secrètes, créées dans le
// Dashboard Stripe — voir docs/abonnements.md). Lus depuis l'environnement.
// ---------------------------------------------------------------------------
export function stripePriceId(plan: PaidPlanId): string | undefined {
  const v =
    plan === "plus"
      ? process.env.STRIPE_PRICE_PLUS
      : process.env.STRIPE_PRICE_ULTIMATE;
  return v && v.trim() ? v.trim() : undefined;
}

/** Recherche inverse : quelle offre correspond à un Price Stripe reçu en webhook. */
export function planByStripePriceId(priceId: string | null | undefined): PaidPlanId | null {
  if (!priceId) return null;
  for (const plan of PAID_PLAN_IDS) {
    if (stripePriceId(plan) === priceId) return plan;
  }
  return null;
}
