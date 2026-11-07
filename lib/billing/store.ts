// Portefeuille de crédits + cycle de vie de l'abonnement — SERVEUR UNIQUEMENT.
//
// Toutes les écritures de crédits et d'abonnement passent par ici afin de garder
// une seule source de vérité et un journal (CreditLedger) cohérent. Les appels
// réseau à Stripe vivent dans lib/billing/stripe.ts ; ce module ne touche que la
// base de données (Prisma), ce qui le rend simple à raisonner et à tester.
//
// Règles de crédits (documentées) :
//   • Portefeuille UNIQUE : un seul solde pour Core, Ultra, voix et fiches.
//   • Allocation mensuelle « use-it-or-lose-it » : à chaque nouveau cycle, le
//     solde est ramené à l'allocation de l'offre (pas de cumul).
//   • Renouvellement payant : piloté par les webhooks Stripe (cycle de
//     facturation). Renouvellement gratuit : rafraîchissement « paresseux »
//     mensuel au fil des lectures (aucune tâche planifiée requise).
//   • Montée d'offre : complément immédiat (différence d'allocation). Baisse
//     d'offre : aucun changement immédiat de solde ; la plus petite allocation
//     s'applique au cycle suivant.

import { prisma } from "@/lib/prisma";
import type { CreditWallet, Subscription } from "@prisma/client";
import {
  type PlanId,
  type PaidPlanId,
  type Entitlements,
  PLAN_RANK,
  monthlyCreditsFor,
  entitlementsFor,
  planConfig,
  toPlanId,
} from "./plans";
import { type CreditOp, type CreditEngine, creditCost, creditCosts } from "./pricing";

const DAY_MS = 24 * 60 * 60 * 1000;

function freeCycleMs(): number {
  const raw = process.env.CREDITS_FREE_CYCLE_DAYS;
  const n = raw == null || raw === "" ? NaN : Number(raw);
  return (Number.isFinite(n) && n > 0 ? n : 30) * DAY_MS;
}

// ---------------------------------------------------------------------------
// Accès « payant actif » : l'utilisateur bénéficie-t-il encore des droits de
// son offre ? (actif/essai, ou résilié/impayé mais avant la fin de période)
// ---------------------------------------------------------------------------
function statusHasAccess(status: string, periodEnd: Date | null): boolean {
  if (status === "active" || status === "trialing") return true;
  if (
    (status === "past_due" || status === "canceled") &&
    periodEnd != null &&
    periodEnd.getTime() > Date.now()
  ) {
    return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Portefeuille
// ---------------------------------------------------------------------------
async function getOrCreateWallet(userId: string): Promise<CreditWallet> {
  const existing = await prisma.creditWallet.findUnique({ where: { userId } });
  if (existing) return existing;
  // Nouveau compte : on crédite tout de suite l'allocation gratuite.
  const alloc = monthlyCreditsFor("free");
  const now = new Date();
  const wallet = await prisma.creditWallet.create({
    data: {
      userId,
      balance: alloc,
      allowance: alloc,
      cycleStart: now,
      cycleEnd: new Date(now.getTime() + freeCycleMs()),
    },
  });
  await prisma.creditLedger.create({
    data: {
      walletId: wallet.id,
      userId,
      delta: alloc,
      balanceAfter: alloc,
      reason: "grant_signup",
      meta: JSON.stringify({ plan: "free" }),
    },
  });
  return wallet;
}

/**
 * Rafraîchissement « paresseux » du portefeuille gratuit : si le cycle mensuel
 * est écoulé et que l'utilisateur n'a pas d'accès payant, on ramène le solde à
 * l'allocation gratuite. Les comptes payants sont rafraîchis par les webhooks.
 */
async function ensureFreeCycleFresh(
  userId: string,
  hasPaidAccess: boolean,
): Promise<CreditWallet> {
  const wallet = await getOrCreateWallet(userId);
  if (hasPaidAccess) return wallet;
  const now = Date.now();
  if (wallet.cycleEnd && now <= wallet.cycleEnd.getTime()) return wallet;

  const alloc = monthlyCreditsFor("free");
  const start = new Date();
  const end = new Date(start.getTime() + freeCycleMs());
  const updated = await prisma.creditWallet.update({
    where: { userId },
    data: { balance: alloc, allowance: alloc, cycleStart: start, cycleEnd: end },
  });
  await prisma.creditLedger.create({
    data: {
      walletId: updated.id,
      userId,
      delta: alloc - wallet.balance,
      balanceAfter: alloc,
      reason: "grant_cycle",
      meta: JSON.stringify({ plan: "free" }),
    },
  });
  return updated;
}

// ---------------------------------------------------------------------------
// Dépense / remboursement de crédits (le cœur de l'intégration IA ⇄ crédits)
// ---------------------------------------------------------------------------
export type SpendResult =
  | { ok: true; spent: number; balance: number }
  | { ok: false; reason: "insufficient"; needed: number; balance: number };

/**
 * Débite le portefeuille pour une action d'IA, de façon atomique (le solde ne
 * peut jamais devenir négatif). Rafraîchit d'abord le cycle gratuit pour que
 * l'allocation mensuelle soit à jour.
 */
export async function spendCredits(
  userId: string,
  op: CreditOp,
  info?: { engine?: CreditEngine; meta?: Record<string, unknown>; hasPaidAccess?: boolean },
): Promise<SpendResult> {
  await ensureFreeCycleFresh(userId, info?.hasPaidAccess ?? false);
  const cost = creditCost(op);

  return prisma.$transaction(async (tx) => {
    const wallet = await tx.creditWallet.findUnique({ where: { userId } });
    if (!wallet || wallet.balance < cost) {
      return {
        ok: false as const,
        reason: "insufficient" as const,
        needed: cost,
        balance: wallet?.balance ?? 0,
      };
    }
    const updated = await tx.creditWallet.update({
      where: { userId },
      data: { balance: { decrement: cost } },
    });
    await tx.creditLedger.create({
      data: {
        walletId: wallet.id,
        userId,
        delta: -cost,
        balanceAfter: updated.balance,
        reason: spendReason(op),
        engine: info?.engine ?? null,
        meta: info?.meta ? JSON.stringify(info.meta) : null,
      },
    });
    return { ok: true as const, spent: cost, balance: updated.balance };
  });
}

/** Rembourse des crédits (ex. échec d'un appel IA après réservation). */
export async function refundCredits(
  userId: string,
  amount: number,
  meta?: Record<string, unknown>,
): Promise<void> {
  if (amount <= 0) return;
  const wallet = await prisma.creditWallet.findUnique({ where: { userId } });
  if (!wallet) return;
  const updated = await prisma.creditWallet.update({
    where: { userId },
    data: { balance: { increment: amount } },
  });
  await prisma.creditLedger.create({
    data: {
      walletId: wallet.id,
      userId,
      delta: amount,
      balanceAfter: updated.balance,
      reason: "refund",
      meta: meta ? JSON.stringify(meta) : null,
    },
  });
}

function spendReason(op: CreditOp): string {
  switch (op) {
    case "chat_core":
    case "chat_ultra":
      return "spend_chat";
    case "cards":
      return "spend_cards";
    case "voice_stt":
      return "spend_voice_stt";
    case "voice_tts":
      return "spend_voice_tts";
  }
}

// ---------------------------------------------------------------------------
// Octroi d'allocation (activation, renouvellement, montée d'offre)
// ---------------------------------------------------------------------------
async function grantCycle(
  userId: string,
  plan: PlanId,
  periodStart: Date,
  periodEnd: Date | null,
): Promise<void> {
  const alloc = monthlyCreditsFor(plan);
  const wallet = await getOrCreateWallet(userId);
  const updated = await prisma.creditWallet.update({
    where: { userId },
    data: {
      balance: alloc, // reset « use-it-or-lose-it »
      allowance: alloc,
      cycleStart: periodStart,
      cycleEnd: periodEnd,
    },
  });
  await prisma.creditLedger.create({
    data: {
      walletId: updated.id,
      userId,
      delta: alloc - wallet.balance, // mouvement net (octroi, éventuelle expiration du reliquat)
      balanceAfter: alloc,
      reason: "grant_cycle",
      meta: JSON.stringify({ plan }),
    },
  });
}

async function topUpUpgrade(
  userId: string,
  fromPlan: PlanId,
  toPlan: PlanId,
  periodEnd: Date | null,
): Promise<void> {
  const delta = monthlyCreditsFor(toPlan) - monthlyCreditsFor(fromPlan);
  const wallet = await getOrCreateWallet(userId);
  const updated = await prisma.creditWallet.update({
    where: { userId },
    data: {
      allowance: monthlyCreditsFor(toPlan),
      balance: delta > 0 ? { increment: delta } : undefined,
      cycleEnd: periodEnd ?? wallet.cycleEnd,
    },
  });
  if (delta > 0) {
    await prisma.creditLedger.create({
      data: {
        walletId: updated.id,
        userId,
        delta,
        balanceAfter: updated.balance,
        reason: "grant_upgrade",
        meta: JSON.stringify({ fromPlan, toPlan }),
      },
    });
  }
}

/** Fin d'accès payant : on plafonne le reliquat au niveau gratuit. */
async function revertToFree(userId: string): Promise<void> {
  const freeAlloc = monthlyCreditsFor("free");
  const wallet = await getOrCreateWallet(userId);
  const newBalance = Math.min(wallet.balance, freeAlloc);
  const start = new Date();
  const updated = await prisma.creditWallet.update({
    where: { userId },
    data: {
      allowance: freeAlloc,
      balance: newBalance,
      cycleStart: start,
      cycleEnd: new Date(start.getTime() + freeCycleMs()),
    },
  });
  if (newBalance !== wallet.balance) {
    await prisma.creditLedger.create({
      data: {
        walletId: updated.id,
        userId,
        delta: newBalance - wallet.balance,
        balanceAfter: newBalance,
        reason: "expire_cycle",
        meta: JSON.stringify({ plan: "free" }),
      },
    });
  }
}

// ---------------------------------------------------------------------------
// Application d'un état d'abonnement (appelé par les webhooks et le mode dev)
// ---------------------------------------------------------------------------
export type ApplySubscriptionParams = {
  plan: PaidPlanId;
  status: string; // active | trialing | past_due | canceled | expired | incomplete
  stripeCustomerId?: string | null;
  stripeSubscriptionId?: string | null;
  stripePriceId?: string | null;
  currentPeriodStart?: Date | null;
  currentPeriodEnd?: Date | null;
  cancelAtPeriodEnd?: boolean;
  canceledAt?: Date | null;
  scheduledPlan?: string | null;
};

/**
 * Réconcilie l'abonnement local + le portefeuille à partir d'un état (issu de
 * Stripe ou du mode dev). Idempotent : les octrois sont indexés sur le début de
 * période, donc rejouer un même état ne re-crédite pas.
 */
export async function applySubscriptionState(
  userId: string,
  p: ApplySubscriptionParams,
): Promise<void> {
  const prev = await prisma.subscription.findUnique({ where: { userId } });
  const prevAccess = prev
    ? statusHasAccess(prev.status, prev.currentPeriodEnd)
    : false;
  const nowAccess = statusHasAccess(p.status, p.currentPeriodEnd ?? null);

  // Upsert de la ligne d'abonnement.
  await prisma.subscription.upsert({
    where: { userId },
    create: {
      userId,
      plan: p.plan,
      status: p.status,
      stripeCustomerId: p.stripeCustomerId ?? null,
      stripeSubscriptionId: p.stripeSubscriptionId ?? null,
      stripePriceId: p.stripePriceId ?? null,
      currentPeriodStart: p.currentPeriodStart ?? null,
      currentPeriodEnd: p.currentPeriodEnd ?? null,
      cancelAtPeriodEnd: p.cancelAtPeriodEnd ?? false,
      canceledAt: p.canceledAt ?? null,
      scheduledPlan: p.scheduledPlan ?? null,
    },
    update: {
      plan: p.plan,
      status: p.status,
      // On ne remplace les références Stripe que si elles sont fournies.
      stripeCustomerId: p.stripeCustomerId ?? prev?.stripeCustomerId ?? null,
      stripeSubscriptionId: p.stripeSubscriptionId ?? prev?.stripeSubscriptionId ?? null,
      stripePriceId: p.stripePriceId ?? prev?.stripePriceId ?? null,
      currentPeriodStart: p.currentPeriodStart ?? prev?.currentPeriodStart ?? null,
      currentPeriodEnd: p.currentPeriodEnd ?? prev?.currentPeriodEnd ?? null,
      cancelAtPeriodEnd: p.cancelAtPeriodEnd ?? false,
      canceledAt: p.canceledAt ?? null,
      scheduledPlan: p.scheduledPlan ?? null,
    },
  });

  // Réconciliation des crédits.
  if (nowAccess) {
    const wallet = await getOrCreateWallet(userId);
    const periodStart = p.currentPeriodStart ?? new Date();
    const periodChanged =
      !wallet.cycleStart || wallet.cycleStart.getTime() !== periodStart.getTime();
    const activating = !prevAccess;

    if (periodChanged || activating) {
      // Première activation ou nouveau cycle de facturation → reset.
      await grantCycle(userId, p.plan, periodStart, p.currentPeriodEnd ?? null);
    } else {
      // Même cycle : seule une MONTÉE d'offre crédite la différence.
      const prevPlan: PlanId = prev ? toPlanId(prev.plan) : "free";
      if (PLAN_RANK[p.plan] > PLAN_RANK[prevPlan]) {
        await topUpUpgrade(userId, prevPlan, p.plan, p.currentPeriodEnd ?? null);
      }
      // Baisse d'offre dans le même cycle : aucun changement de solde ici.
    }
  } else if (prevAccess) {
    // L'accès payant vient de prendre fin.
    await revertToFree(userId);
  }
}

// ---------------------------------------------------------------------------
// Références Stripe
// ---------------------------------------------------------------------------
export async function getSubscriptionRow(userId: string): Promise<Subscription | null> {
  return prisma.subscription.findUnique({ where: { userId } });
}

export async function setStripeCustomerId(userId: string, customerId: string): Promise<void> {
  await prisma.subscription.upsert({
    where: { userId },
    create: { userId, plan: "plus", status: "incomplete", stripeCustomerId: customerId },
    update: { stripeCustomerId: customerId },
  });
}

/** Retrouve l'utilisateur Orbs lié à un client / abonnement Stripe (webhooks). */
export async function findUserIdByStripe(opts: {
  subscriptionId?: string | null;
  customerId?: string | null;
}): Promise<string | null> {
  if (opts.subscriptionId) {
    const s = await prisma.subscription.findUnique({
      where: { stripeSubscriptionId: opts.subscriptionId },
      select: { userId: true },
    });
    if (s) return s.userId;
  }
  if (opts.customerId) {
    const s = await prisma.subscription.findFirst({
      where: { stripeCustomerId: opts.customerId },
      select: { userId: true },
    });
    if (s) return s.userId;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Idempotence des webhooks
// ---------------------------------------------------------------------------
/** Déjà traité ? (lecture seule — pour court-circuiter un doublon en entrée) */
export async function isWebhookProcessed(id: string): Promise<boolean> {
  const row = await prisma.processedWebhookEvent.findUnique({ where: { id } });
  return row != null;
}

/**
 * Marque un événement comme traité. À appeler APRÈS un traitement réussi : si le
 * traitement échoue (500), on ne marque pas, et Stripe réessaiera. Les
 * opérations sous-jacentes étant idempotentes, un éventuel double traitement
 * (course entre deux livraisons) reste sans effet de bord.
 */
export async function markWebhookProcessed(id: string, type: string): Promise<void> {
  try {
    await prisma.processedWebhookEvent.create({ data: { id, type } });
  } catch {
    /* déjà marqué : sans conséquence */
  }
}

// ---------------------------------------------------------------------------
// Modèle de lecture (UI + routes IA)
// ---------------------------------------------------------------------------
export type BillingState = {
  /** Offre dont l'utilisateur bénéficie EFFECTIVEMENT en ce moment. */
  plan: PlanId;
  /** Statut de l'abonnement (ou "free" si aucun abonnement payant actif). */
  status: string;
  entitlements: Entitlements;
  hasPaidAccess: boolean;
  wallet: { balance: number; allowance: number; cycleStart: Date; cycleEnd: Date | null };
  costs: Record<CreditOp, number>;
  subscription: Subscription | null;
  /** Détail de l'abonnement payant (même si l'accès est encore actif après résiliation). */
  cancelAtPeriodEnd: boolean;
};

/**
 * État de facturation complet d'un utilisateur. Rafraîchit au passage le cycle
 * gratuit (lazy). À appeler une fois par requête concernée.
 */
export async function getBillingState(userId: string): Promise<BillingState> {
  const sub = await prisma.subscription.findUnique({ where: { userId } });
  const hasPaidAccess = sub
    ? statusHasAccess(sub.status, sub.currentPeriodEnd)
    : false;
  const effectivePlan: PlanId = hasPaidAccess ? toPlanId(sub!.plan) : "free";

  const wallet = await ensureFreeCycleFresh(userId, hasPaidAccess);

  return {
    plan: effectivePlan,
    status: sub && hasPaidAccess ? sub.status : "free",
    entitlements: entitlementsFor(effectivePlan),
    hasPaidAccess,
    wallet: {
      balance: wallet.balance,
      allowance: wallet.allowance,
      cycleStart: wallet.cycleStart,
      cycleEnd: wallet.cycleEnd,
    },
    costs: creditCosts(),
    subscription: sub,
    cancelAtPeriodEnd: sub?.cancelAtPeriodEnd ?? false,
  };
}

/** Liste des derniers mouvements de crédits (affichage « conso »). */
export async function recentLedger(userId: string, take = 8) {
  return prisma.creditLedger.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take,
  });
}

// Ré-exports pratiques pour les consommateurs serveur.
export { planConfig, monthlyCreditsFor, creditCost };
