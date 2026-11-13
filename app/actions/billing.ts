"use server";

// Server actions d'abonnement. Toute la logique de paiement reste SERVEUR :
// aucune clé Stripe n'atteint le navigateur. Le client appelle ces actions et,
// pour Checkout/Portail, se contente de suivre l'URL hébergée par Stripe.
//
// Sans Stripe configuré ET hors production, les actions SIMULENT l'abonnement
// (comme les codes e-mail s'affichent en console en dev) : tout le parcours
// reste testable sans service externe. En production sans configuration, elles
// échouent proprement avec un message clair.

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import {
  stripeConfigured,
  createCustomer,
  createCheckoutSession,
  createBillingPortalSession,
  updateSubscriptionPrice,
  setCancelAtPeriodEnd,
  StripeError,
} from "@/lib/billing/stripe";
import { isPaidPlan, stripePriceId, toPlanId, type PaidPlanId } from "@/lib/billing/plans";
import {
  getSubscriptionRow,
  setStripeCustomerId,
  applySubscriptionState,
  getBillingState,
} from "@/lib/billing/store";
import {
  syncStripeSubscription,
  reconcileFromCheckoutSession,
} from "@/lib/billing/webhook";

export type BillingActionResult =
  | { ok: true; url?: string }
  | { ok: false; error: string };

const DAY_MS = 24 * 60 * 60 * 1000;

/** Mode « simulation » : pas de Stripe et hors production. */
function devSimEnabled(): boolean {
  return !stripeConfigured() && process.env.NODE_ENV !== "production";
}

/** URL absolue vers une page de l'app (pour les retours Stripe). */
async function absoluteUrl(path: string): Promise<string> {
  const base = process.env.APP_BASE_URL?.replace(/\/+$/, "");
  if (base) return `${base}${path}`;
  const h = await headers();
  const host = h.get("x-forwarded-host") || h.get("host") || "localhost:3000";
  const proto =
    h.get("x-forwarded-proto") ||
    (process.env.NODE_ENV === "production" ? "https" : "http");
  return `${proto}://${host}${path}`;
}

/** Message d'erreur sûr (jamais de détail technique exposé au client). */
function friendly(err: unknown): string {
  if (err instanceof StripeError && err.code === "not_configured") {
    return "Les paiements ne sont pas encore configurés.";
  }
  return "Le paiement a échoué. Réessaie dans un instant.";
}

// ---------------------------------------------------------------------------
// Souscription (nouvel abonnement) — Stripe Checkout, ou simulation en dev.
// ---------------------------------------------------------------------------
export async function startCheckout(plan: string): Promise<BillingActionResult> {
  const user = await requireUser();
  const p = toPlanId(plan);
  if (!isPaidPlan(p)) return { ok: false, error: "Offre inconnue." };

  if (!stripeConfigured()) {
    if (devSimEnabled()) {
      await devActivateInternal(user.id, p);
      revalidatePath("/abonnement");
      revalidatePath("/", "layout");
      return { ok: true };
    }
    return {
      ok: false,
      error: "Les paiements ne sont pas encore configurés. Réessaie plus tard.",
    };
  }

  const priceId = stripePriceId(p);
  if (!priceId) {
    return { ok: false, error: "Offre non configurée côté paiement (Price Stripe manquant)." };
  }

  try {
    // Client Stripe : réutilise celui déjà lié, sinon le crée.
    const row = await getSubscriptionRow(user.id);
    let customerId = row?.stripeCustomerId ?? undefined;
    if (!customerId) {
      const c = await createCustomer(user.email, user.id);
      customerId = c.id;
      await setStripeCustomerId(user.id, customerId);
    }

    const session = await createCheckoutSession({
      priceId,
      userId: user.id,
      customerId,
      successUrl: await absoluteUrl("/abonnement?status=success&session_id={CHECKOUT_SESSION_ID}"),
      cancelUrl: await absoluteUrl("/abonnement?status=cancel"),
    });
    if (!session.url) return { ok: false, error: "Impossible d'ouvrir la page de paiement." };
    return { ok: true, url: session.url };
  } catch (err) {
    console.error("[billing] startCheckout", err);
    return { ok: false, error: friendly(err) };
  }
}

// ---------------------------------------------------------------------------
// Portail de facturation Stripe (gérer la carte, les factures, résilier).
// ---------------------------------------------------------------------------
export async function openBillingPortal(): Promise<BillingActionResult> {
  const user = await requireUser();
  if (!stripeConfigured()) {
    return { ok: false, error: "Les paiements ne sont pas encore configurés." };
  }
  const row = await getSubscriptionRow(user.id);
  if (!row?.stripeCustomerId) {
    return { ok: false, error: "Aucun espace de facturation pour ce compte." };
  }
  try {
    const portal = await createBillingPortalSession({
      customerId: row.stripeCustomerId,
      returnUrl: await absoluteUrl("/abonnement"),
    });
    return { ok: true, url: portal.url };
  } catch (err) {
    console.error("[billing] openBillingPortal", err);
    return { ok: false, error: friendly(err) };
  }
}

// ---------------------------------------------------------------------------
// Changement d'offre (montée / rétrogradation), effet immédiat avec prorata.
// ---------------------------------------------------------------------------
export async function changePlan(plan: string): Promise<BillingActionResult> {
  const user = await requireUser();
  const p = toPlanId(plan);
  if (!isPaidPlan(p)) return { ok: false, error: "Offre inconnue." };

  const state = await getBillingState(user.id);
  // Pas d'abonnement actif → c'est une première souscription.
  if (!state.hasPaidAccess) return startCheckout(p);
  if (state.plan === p) return { ok: true }; // déjà sur cette offre

  if (!stripeConfigured()) {
    if (devSimEnabled()) {
      await devChangeInternal(user.id, p);
      revalidatePath("/abonnement");
      revalidatePath("/", "layout");
      return { ok: true };
    }
    return { ok: false, error: "Les paiements ne sont pas encore configurés." };
  }

  const row = await getSubscriptionRow(user.id);
  if (!row?.stripeSubscriptionId) {
    return { ok: false, error: "Abonnement Stripe introuvable." };
  }
  const priceId = stripePriceId(p);
  if (!priceId) return { ok: false, error: "Offre non configurée (Price manquant)." };

  try {
    const sub = await updateSubscriptionPrice(row.stripeSubscriptionId, priceId);
    await syncStripeSubscription(user.id, sub); // reflète tout de suite
    revalidatePath("/abonnement");
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (err) {
    console.error("[billing] changePlan", err);
    return { ok: false, error: friendly(err) };
  }
}

// ---------------------------------------------------------------------------
// Résiliation (à la fin de la période) et reprise.
// ---------------------------------------------------------------------------
export async function cancelSubscription(): Promise<BillingActionResult> {
  const user = await requireUser();
  const state = await getBillingState(user.id);
  if (!state.hasPaidAccess) return { ok: false, error: "Aucun abonnement actif." };

  if (!stripeConfigured()) {
    if (devSimEnabled()) {
      await devSetCancelInternal(user.id, true);
      revalidatePath("/abonnement");
      return { ok: true };
    }
    return { ok: false, error: "Les paiements ne sont pas encore configurés." };
  }
  const row = await getSubscriptionRow(user.id);
  if (!row?.stripeSubscriptionId) return { ok: false, error: "Abonnement introuvable." };
  try {
    const sub = await setCancelAtPeriodEnd(row.stripeSubscriptionId, true);
    await syncStripeSubscription(user.id, sub);
    revalidatePath("/abonnement");
    return { ok: true };
  } catch (err) {
    console.error("[billing] cancelSubscription", err);
    return { ok: false, error: friendly(err) };
  }
}

export async function resumeSubscription(): Promise<BillingActionResult> {
  const user = await requireUser();
  if (!stripeConfigured()) {
    if (devSimEnabled()) {
      await devSetCancelInternal(user.id, false);
      revalidatePath("/abonnement");
      return { ok: true };
    }
    return { ok: false, error: "Les paiements ne sont pas encore configurés." };
  }
  const row = await getSubscriptionRow(user.id);
  if (!row?.stripeSubscriptionId) return { ok: false, error: "Abonnement introuvable." };
  try {
    const sub = await setCancelAtPeriodEnd(row.stripeSubscriptionId, false);
    await syncStripeSubscription(user.id, sub);
    revalidatePath("/abonnement");
    return { ok: true };
  } catch (err) {
    console.error("[billing] resumeSubscription", err);
    return { ok: false, error: friendly(err) };
  }
}

// ---------------------------------------------------------------------------
// Réconciliation au retour de Checkout (active l'abonnement sans attendre le
// webhook). Best-effort : en cas d'échec, le webhook prendra le relais.
// ---------------------------------------------------------------------------
export async function reconcileCheckout(sessionId: string): Promise<void> {
  const user = await requireUser();
  if (!stripeConfigured() || !sessionId) return;
  try {
    await reconcileFromCheckoutSession(user.id, sessionId);
    revalidatePath("/abonnement");
    revalidatePath("/", "layout");
  } catch (err) {
    console.error("[billing] reconcileCheckout", err);
  }
}

// ---------------------------------------------------------------------------
// Outils de DÉVELOPPEMENT (simulation sans Stripe). Inactifs en production.
// ---------------------------------------------------------------------------
export async function devExpireNow(): Promise<BillingActionResult> {
  if (!devSimEnabled()) return { ok: false, error: "Indisponible." };
  const user = await requireUser();
  const row = await getSubscriptionRow(user.id);
  if (!row) return { ok: false, error: "Aucun abonnement." };
  const plan: PaidPlanId = isPaidPlan(row.plan) ? row.plan : "plus";
  await applySubscriptionState(user.id, {
    plan,
    status: "expired",
    currentPeriodStart: row.currentPeriodStart,
    currentPeriodEnd: new Date(Date.now() - 1000),
    cancelAtPeriodEnd: false,
    canceledAt: new Date(),
  });
  revalidatePath("/abonnement");
  revalidatePath("/", "layout");
  return { ok: true };
}

// --- helpers de simulation (non exportés) ----------------------------------
async function devActivateInternal(userId: string, plan: PaidPlanId): Promise<void> {
  const now = new Date();
  await applySubscriptionState(userId, {
    plan,
    status: "active",
    currentPeriodStart: now,
    currentPeriodEnd: new Date(now.getTime() + 30 * DAY_MS),
    cancelAtPeriodEnd: false,
    canceledAt: null,
    stripeCustomerId: null,
    stripeSubscriptionId: null,
    stripePriceId: null,
  });
}

async function devChangeInternal(userId: string, plan: PaidPlanId): Promise<void> {
  const row = await getSubscriptionRow(userId);
  const start = row?.currentPeriodStart ?? new Date();
  const end = row?.currentPeriodEnd ?? new Date(Date.now() + 30 * DAY_MS);
  await applySubscriptionState(userId, {
    plan,
    status: "active",
    currentPeriodStart: start,
    currentPeriodEnd: end,
    cancelAtPeriodEnd: false,
    canceledAt: null,
  });
}

async function devSetCancelInternal(userId: string, cancel: boolean): Promise<void> {
  const row = await getSubscriptionRow(userId);
  if (!row) return;
  const plan: PaidPlanId = isPaidPlan(row.plan) ? row.plan : "plus";
  await applySubscriptionState(userId, {
    plan,
    status: cancel ? "canceled" : "active",
    currentPeriodStart: row.currentPeriodStart,
    currentPeriodEnd: row.currentPeriodEnd,
    cancelAtPeriodEnd: cancel,
    canceledAt: cancel ? new Date() : null,
  });
}
