// Traitement des événements Stripe — SERVEUR UNIQUEMENT.
//
// Les webhooks sont la SOURCE DE VÉRITÉ du cycle de vie de l'abonnement :
// activation, renouvellement (donc renouvellement des crédits), changement
// d'offre, résiliation, expiration, échec de paiement. On y réagit en
// réconciliant l'état local via lib/billing/store.
//
// Robustesse : pour chaque événement lié à un abonnement, on RE-RÉCUPÈRE
// l'abonnement frais auprès de Stripe et on applique son état faisant autorité
// (plutôt que de se fier à un payload potentiellement obsolète). L'idempotence
// est assurée en deux temps : `markWebhookProcessed` (par event.id) et, pour les
// crédits, l'indexation des octrois sur le début de période (voir store).

import {
  retrieveSubscription,
  retrieveCheckoutSession,
  stripeDate,
  type StripeEvent,
  type StripeSubscription,
  type StripeCheckoutSession,
} from "./stripe";
import { planByStripePriceId } from "./plans";
import {
  applySubscriptionState,
  findUserIdByStripe,
  isWebhookProcessed,
} from "./store";

/** Statut Stripe → statut interne (voir prisma Subscription.status). */
function mapStatus(sub: StripeSubscription): string {
  switch (sub.status) {
    case "active":
      return sub.cancel_at_period_end ? "canceled" : "active";
    case "trialing":
      return sub.cancel_at_period_end ? "canceled" : "trialing";
    case "past_due":
      return "past_due";
    case "incomplete":
      return "incomplete";
    // canceled / unpaid / incomplete_expired : l'abonnement a pris fin.
    default:
      return "expired";
  }
}

/**
 * Applique l'état faisant autorité d'un abonnement Stripe à un utilisateur.
 * Exporté pour une réconciliation immédiate après une action (changement
 * d'offre, résiliation) sans attendre le webhook.
 */
export async function syncStripeSubscription(
  userId: string,
  sub: StripeSubscription,
  opts?: { forceExpired?: boolean },
): Promise<void> {
  const priceId = sub.items?.data?.[0]?.price?.id ?? null;
  const plan = planByStripePriceId(priceId);
  if (!plan) {
    console.warn(`[stripe] webhook: Price inconnu (${priceId}) — abonnement ignoré.`);
    return;
  }
  await applySubscriptionState(userId, {
    plan,
    status: opts?.forceExpired ? "expired" : mapStatus(sub),
    stripeCustomerId: sub.customer,
    stripeSubscriptionId: sub.id,
    stripePriceId: priceId,
    currentPeriodStart: stripeDate(sub.current_period_start),
    currentPeriodEnd: stripeDate(sub.current_period_end),
    cancelAtPeriodEnd: sub.cancel_at_period_end,
    canceledAt: stripeDate(sub.canceled_at),
  });
}

/** Résout l'userId Orbs à partir des métadonnées / références Stripe. */
async function resolveUserId(hints: {
  metadataUserId?: string | null;
  subscriptionId?: string | null;
  customerId?: string | null;
}): Promise<string | null> {
  if (hints.metadataUserId) return hints.metadataUserId;
  return findUserIdByStripe({
    subscriptionId: hints.subscriptionId ?? null,
    customerId: hints.customerId ?? null,
  });
}

export type HandleResult = { handled: boolean; note?: string };

/** Point d'entrée : traite un événement Stripe déjà vérifié. */
export async function handleStripeEvent(event: StripeEvent): Promise<HandleResult> {
  // Idempotence : un événement déjà traité (et marqué après succès) est ignoré.
  if (await isWebhookProcessed(event.id)) return { handled: true, note: "duplicate" };

  switch (event.type) {
    case "checkout.session.completed": {
      const s = event.data.object as unknown as StripeCheckoutSession & {
        customer?: string | null;
        subscription?: string | null;
      };
      const subId = typeof s.subscription === "string" ? s.subscription : null;
      const userId = await resolveUserId({
        metadataUserId: s.client_reference_id || s.metadata?.userId,
        subscriptionId: subId,
        customerId: typeof s.customer === "string" ? s.customer : null,
      });
      if (!userId || !subId) return { handled: true, note: "missing userId/subscription" };
      const sub = await retrieveSubscription(subId);
      await syncStripeSubscription(userId, sub);
      return { handled: true };
    }

    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const sub = event.data.object as unknown as StripeSubscription;
      const userId = await resolveUserId({
        metadataUserId: sub.metadata?.userId,
        subscriptionId: sub.id,
        customerId: sub.customer,
      });
      if (!userId) return { handled: true, note: "no user" };
      await syncStripeSubscription(userId, sub, {
        forceExpired: event.type === "customer.subscription.deleted",
      });
      return { handled: true };
    }

    case "invoice.paid":
    case "invoice.payment_failed": {
      const inv = event.data.object as unknown as {
        subscription?: string | null;
        customer?: string | null;
      };
      const subId = typeof inv.subscription === "string" ? inv.subscription : null;
      if (!subId) return { handled: true, note: "no subscription on invoice" };
      const sub = await retrieveSubscription(subId);
      const userId = await resolveUserId({
        metadataUserId: sub.metadata?.userId,
        subscriptionId: subId,
        customerId: typeof inv.customer === "string" ? inv.customer : sub.customer,
      });
      if (!userId) return { handled: true, note: "no user" };
      // `invoice.paid` d'un renouvellement fait avancer la période → le store
      // détecte le nouveau cycle et renouvelle les crédits. `payment_failed`
      // reflète le statut past_due (accès en sursis pendant les relances).
      await syncStripeSubscription(userId, sub);
      return { handled: true };
    }

    default:
      return { handled: false, note: `type ignoré: ${event.type}` };
  }
}

/**
 * Réconciliation immédiate au retour de Checkout (sans attendre le webhook) :
 * récupère la session, puis l'abonnement, et applique son état. Best-effort.
 */
export async function reconcileFromCheckoutSession(
  userId: string,
  sessionId: string,
): Promise<void> {
  const session = await retrieveCheckoutSession(sessionId);
  // Sécurité : la session doit bien appartenir à cet utilisateur.
  const sessionUser = session.client_reference_id || session.metadata?.userId;
  if (sessionUser && sessionUser !== userId) return;
  const subId = typeof session.subscription === "string" ? session.subscription : null;
  if (!subId) return;
  const sub = await retrieveSubscription(subId);
  await syncStripeSubscription(userId, sub);
}
