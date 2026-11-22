// Vérification Stripe AVANT la suppression d'un compte — SERVEUR UNIQUEMENT.
//
// La base locale (table Subscription) n'est qu'un reflet des webhooks : elle
// peut être en retard (webhook non reçu, rejeu, incident). Avant de supprimer
// un compte relié à Stripe, on interroge donc Stripe DIRECTEMENT et on ne
// fait confiance qu'à sa réponse.
//
// Principes :
//   - LECTURE SEULE : la passerelle ne sait que lire (client, abonnement,
//     liste d'abonnements). Aucune annulation, aucune modification : la
//     suppression du compte ne touche jamais à la facturation ;
//   - PRUDENCE : toute incertitude (erreur réseau, Stripe indisponible ou non
//     configuré, référence introuvable, incohérence) BLOQUE la suppression ;
//   - un compte sans aucune référence Stripe (compte professionnel par code,
//     simulation de développement) n'est facturé par personne : on ne
//     l'interroge pas et on ne le bloque pas, même s'il a l'offre Ultimate.

import type { Subscription } from "@prisma/client";
import {
  StripeError,
  stripeConfigured,
  retrieveSubscription,
  retrieveCustomer,
  listCustomerSubscriptions,
  subscriptionPeriod,
  type StripeCustomer,
  type StripeList,
  type StripeSubscription,
} from "./billing/stripe";
import { PLANS, planByStripePriceId, type PlanId } from "./billing/plans";

/** Accès Stripe en LECTURE SEULE (injectable pour les tests). */
export type StripeReadGateway = {
  configured(): boolean;
  retrieveSubscription(id: string): Promise<StripeSubscription>;
  retrieveCustomer(id: string): Promise<StripeCustomer>;
  listCustomerSubscriptions(customerId: string): Promise<StripeList<StripeSubscription>>;
};

export const defaultStripeGateway: StripeReadGateway = {
  configured: stripeConfigured,
  retrieveSubscription,
  retrieveCustomer,
  listCustomerSubscriptions,
};

export type StripeBlockReason =
  | "subscription_active" // abonnement qui se renouvellera
  | "payment_pending" // paiement en retard, impayé, initial non finalisé
  | "stripe_unavailable" // Stripe injoignable / non configuré : réessayer
  | "stripe_unverifiable"; // référence invalide, incohérence, état ambigu

export type StripeDeletionCheck =
  | { blocked: false; checkedWithStripe: boolean }
  | { blocked: true; reason: StripeBlockReason; planName: string };

/** Ce qu'un abonnement Stripe implique pour une suppression de compte. */
export type SubscriptionAssessment =
  | "ended" // terminé : plus aucune facturation possible
  | "cancel_scheduled" // résiliation confirmée, aucun renouvellement prévu
  | "renewing" // se renouvellera automatiquement
  | "payment_pending" // paiement en cours / en retard / initial non finalisé
  | "ambiguous"; // état qu'on ne sait pas interpréter avec certitude

/**
 * Lecture STRICTE de l'état réel d'un abonnement Stripe. Tout ce qui n'est
 * pas explicitement sûr est « ambiguous » (donc bloquant).
 */
export function assessStripeSubscription(sub: StripeSubscription): SubscriptionAssessment {
  switch (sub.status) {
    case "canceled":
    case "incomplete_expired":
      return "ended";
    case "past_due":
    case "unpaid":
    case "incomplete":
      return "payment_pending";
    case "active":
    case "trialing": {
      // Un échéancier peut prolonger ou modifier l'abonnement au-delà de la
      // période en cours : on ne peut pas garantir l'absence de renouvellement.
      if (sub.schedule) return "ambiguous";
      if (sub.cancel_at_period_end === true) return "cancel_scheduled";
      if (sub.cancel_at != null) {
        const end = subscriptionPeriod(sub).end;
        if (!end) return "ambiguous"; // fin de période inconnue
        // Résiliation datée au plus tard à la fin de la période en cours :
        // aucun renouvellement n'aura lieu avant.
        return sub.cancel_at * 1000 <= end.getTime() ? "cancel_scheduled" : "renewing";
      }
      return "renewing";
    }
    default:
      return "ambiguous"; // paused, ou statut inconnu
  }
}

function isMissing(e: unknown): boolean {
  return e instanceof StripeError && (e.status === 404 || e.code === "resource_missing");
}

/** Erreur « réessayer plus tard » (réseau, 5xx, limitation, clé refusée). */
function isTransient(e: unknown): boolean {
  if (!(e instanceof StripeError)) return true; // erreur inattendue : prudence
  return (
    e.type === "network" ||
    e.code === "not_configured" ||
    e.status === 429 ||
    e.status === 401 ||
    e.status === 403 ||
    e.status >= 500
  );
}

function planNameFor(local: Subscription | null, subs: StripeSubscription[]): string {
  for (const s of subs) {
    const plan = planByStripePriceId(s.items?.data?.[0]?.price?.id);
    if (plan) return PLANS[plan].name;
  }
  const p = local?.plan;
  return p && p in PLANS ? PLANS[p as PlanId].name : "Orbs";
}

const BLOCKING_ORDER: Record<Exclude<SubscriptionAssessment, "ended" | "cancel_scheduled">, StripeBlockReason> = {
  renewing: "subscription_active",
  payment_pending: "payment_pending",
  ambiguous: "stripe_unverifiable",
};

/**
 * Décide, à partir de STRIPE (et non de la base locale), si la suppression
 * du compte `userId` laisserait un abonnement payant actif.
 *
 * `local` = ligne Subscription locale (ou null). Elle sert uniquement à
 * connaître les références Stripe à vérifier — jamais à décider.
 */
export async function checkStripeBeforeDeletion(
  userId: string,
  local: Subscription | null,
  gateway: StripeReadGateway = defaultStripeGateway,
): Promise<StripeDeletionCheck> {
  const subId = local?.stripeSubscriptionId ?? null;
  const customerId = local?.stripeCustomerId ?? null;

  // Aucune référence Stripe : personne ne facture ce compte (compte pro par
  // code, simulation de dev, ou jamais abonné).
  if (!subId && !customerId) return { blocked: false, checkedWithStripe: false };

  const block = (reason: StripeBlockReason, subs: StripeSubscription[] = []) =>
    ({ blocked: true, reason, planName: planNameFor(local, subs) }) as const;

  // Des références existent mais on ne peut pas interroger Stripe : on ne
  // peut rien garantir, donc on ne supprime pas.
  if (!gateway.configured()) return block("stripe_unavailable");

  const seen = new Map<string, StripeSubscription>();

  try {
    // 1) L'abonnement connu localement, lu tel qu'il est CHEZ STRIPE.
    if (subId) {
      let sub: StripeSubscription;
      try {
        sub = await gateway.retrieveSubscription(subId);
      } catch (e) {
        if (isMissing(e)) return block("stripe_unverifiable"); // référence invalide
        throw e;
      }
      // Incohérences : l'abonnement doit appartenir au client et au compte.
      if (customerId && sub.customer !== customerId) return block("stripe_unverifiable", [sub]);
      if (sub.metadata?.userId && sub.metadata.userId !== userId) {
        return block("stripe_unverifiable", [sub]);
      }
      seen.set(sub.id, sub);
    }

    // 2) Le client Stripe : existence, appartenance, et TOUS ses abonnements
    //    (y compris un abonnement que la base locale ignorerait encore).
    if (customerId) {
      let customer: StripeCustomer;
      try {
        customer = await gateway.retrieveCustomer(customerId);
      } catch (e) {
        if (isMissing(e)) return block("stripe_unverifiable", [...seen.values()]);
        throw e;
      }
      if (customer.metadata?.userId && customer.metadata.userId !== userId) {
        return block("stripe_unverifiable", [...seen.values()]);
      }
      // Un client supprimé chez Stripe ne peut plus être facturé : ses
      // abonnements sont terminés. Sinon, on liste tout.
      if (!customer.deleted) {
        const list = await gateway.listCustomerSubscriptions(customerId);
        if (list.has_more) return block("stripe_unverifiable", [...seen.values()]);
        for (const s of list.data) {
          if (s.customer && s.customer !== customerId) {
            return block("stripe_unverifiable", [...seen.values(), s]);
          }
          seen.set(s.id, s);
        }
      }
    }
  } catch (e) {
    return block(isTransient(e) ? "stripe_unavailable" : "stripe_unverifiable", [...seen.values()]);
  }

  // 3) Décision : le PREMIER motif bloquant le plus grave l'emporte.
  const subs = [...seen.values()];
  const verdicts = subs.map(assessStripeSubscription);
  for (const v of ["renewing", "payment_pending", "ambiguous"] as const) {
    if (verdicts.includes(v)) {
      return block(BLOCKING_ORDER[v], subs.filter((_, i) => verdicts[i] === v));
    }
  }
  return { blocked: false, checkedWithStripe: true };
}

/** Message affiché à l'utilisateur pour chaque motif de blocage. */
export function stripeBlockMessage(reason: StripeBlockReason, planName: string): string {
  switch (reason) {
    case "subscription_active":
      return `Ton abonnement ${planName} est actif et se renouvellera automatiquement. Résilie-le d'abord depuis la page Abonnement, puis reviens supprimer ton compte.`;
    case "payment_pending":
      return `Un paiement de ton abonnement ${planName} est encore en attente. Règle-le ou résilie ton abonnement depuis la page Abonnement avant de supprimer ton compte.`;
    case "stripe_unavailable":
      return "Nous n'arrivons pas à vérifier ton abonnement auprès de notre service de paiement pour le moment. Ton compte n'a pas été supprimé : réessaie dans quelques minutes.";
    case "stripe_unverifiable":
      return "Nous ne parvenons pas à confirmer l'état de ton abonnement. Par prudence, ton compte n'a pas été supprimé. Vérifie ton abonnement depuis la page Abonnement.";
  }
}
