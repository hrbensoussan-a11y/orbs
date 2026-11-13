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
import { Prisma } from "@prisma/client";
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
/**
 * Récupère le portefeuille, ou le crée VIDE si absent.
 *
 * Il N'Y A PAS d'allocation gratuite : un nouveau compte (ou un compte sans
 * abonnement) démarre à 0 crédit. Les crédits ne sont accordés que par un
 * abonnement payant (voir applySubscriptionState / grantCycle). Aucun octroi
 * automatique à la création.
 */
async function getOrCreateWallet(userId: string): Promise<CreditWallet> {
  const existing = await prisma.creditWallet.findUnique({ where: { userId } });
  if (existing) return existing;
  try {
    return await prisma.creditWallet.create({
      data: {
        userId,
        balance: 0,
        allowance: 0,
        cycleStart: new Date(),
        cycleEnd: null, // pas de cycle tant qu'il n'y a pas d'abonnement
      },
    });
  } catch (e) {
    // Course de création : deux webhooks simultanés pour un tout nouvel
    // abonnement créent le portefeuille en même temps. La contrainte unique
    // (userId) n'en laisse passer qu'un ; l'autre relit la ligne déjà créée.
    if (isUniqueViolation(e)) {
      const w = await prisma.creditWallet.findUnique({ where: { userId } });
      if (w) return w;
    }
    throw e;
  }
}

// ---------------------------------------------------------------------------
// Service de crédits « réserver → réconcilier » (cœur de l'intégration IA)
//
// Chaque requête IA suit ce cycle (cahier des charges) :
//   1) vérifier le solde ; 2) RÉSERVER une estimation (retenue atomique) ;
//   3) appeler le modèle ; 4) récupérer la consommation réelle ; 5) calculer le
//   coût réel ; 6) débiter ; 7) LIBÉRER le reste réservé ; 8) refuser si solde
//   insuffisant. Core et Ultra partagent le MÊME portefeuille, seuls les coûts
//   diffèrent (voir lib/billing/pricing.ts).
//
// Toutes les écritures de solde sont des opérations SQL atomiques à une seule
// instruction (décrément gardé, incréments, suppression-réclamation) : pas de
// solde négatif, pas de double débit, sûres sous requêtes simultanées. Les
// réservations orphelines (crash / interruption) sont libérées par balayage.
// ---------------------------------------------------------------------------

/** Durée de vie d'une réservation avant libération automatique (ms). */
function reservationTtlMs(): number {
  const raw = process.env.CREDITS_RESERVATION_TTL_MS;
  const n = raw == null || raw === "" ? NaN : Number(raw);
  return Number.isFinite(n) && n > 0 ? n : 5 * 60 * 1000; // 5 min par défaut
}

export type ReserveResult =
  | { ok: true; reservationId: string; estimated: number; balance: number }
  | { ok: false; reason: "insufficient"; needed: number; balance: number };

/**
 * Étape 2 — RÉSERVE `estimated` crédits (retenue sur le solde). Libère d'abord
 * les réservations orphelines. Refuse (étape 8) si le solde disponible est
 * insuffisant, sans rien retenir. Un compte sans abonnement a 0 crédit, donc la
 * réservation échoue : il n'y a aucune allocation automatique.
 */
export async function reserve(
  userId: string,
  op: CreditOp,
  info: {
    estimated: number;
    engine?: CreditEngine | null;
    meta?: Record<string, unknown>;
    hasPaidAccess?: boolean;
  },
): Promise<ReserveResult> {
  const estimated = Math.max(1, Math.ceil(info.estimated));
  await releaseStaleReservations(userId);
  await getOrCreateWallet(userId);

  // Décrément atomique GARDÉ : ne retient que si le solde couvre l'estimation.
  const res = await prisma.creditWallet.updateMany({
    where: { userId, balance: { gte: estimated } },
    data: { balance: { decrement: estimated } },
  });
  if (res.count === 0) {
    const w = await prisma.creditWallet.findUnique({ where: { userId } });
    return { ok: false, reason: "insufficient", needed: estimated, balance: w?.balance ?? 0 };
  }

  const resv = await prisma.creditReservation.create({
    data: {
      userId,
      op,
      engine: info.engine ?? null,
      estimated,
      meta: info.meta ? JSON.stringify(info.meta) : null,
    },
  });
  const w = await prisma.creditWallet.findUnique({ where: { userId } });
  return { ok: true, reservationId: resv.id, estimated, balance: w?.balance ?? 0 };
}

/**
 * Étapes 5-7 — RÉCONCILIE une réservation au coût réel (`actualCost`, en
 * crédits) : débite ce coût et REND la différence réservée. Le coût est borné à
 * l'estimation (jamais de solde négatif). Idempotent : la suppression de la
 * réservation sert de verrou (un seul règlement gagne).
 */
export async function settle(
  reservationId: string,
  actualCost: number,
): Promise<{ settled: boolean; charged: number }> {
  const resv = await prisma.creditReservation.findUnique({ where: { id: reservationId } });
  if (!resv) return { settled: false, charged: 0 };
  const charged = Math.min(Math.max(0, Math.ceil(actualCost)), resv.estimated);

  // Réclamation atomique : la suppression empêche tout double règlement.
  const claim = await prisma.creditReservation.deleteMany({ where: { id: reservationId } });
  if (claim.count === 0) return { settled: false, charged: 0 };

  const refund = resv.estimated - charged; // ≥ 0
  const updated = await prisma.creditWallet.update({
    where: { userId: resv.userId },
    data: { balance: { increment: refund } },
  });
  await prisma.creditLedger.create({
    data: {
      walletId: updated.id,
      userId: resv.userId,
      delta: -charged,
      balanceAfter: updated.balance,
      reason: spendReason(resv.op as CreditOp),
      engine: resv.engine,
      meta: resv.meta,
    },
  });
  return { settled: true, charged };
}

/**
 * Libère INTÉGRALEMENT une réservation (échec de l'appel, interruption avant
 * toute consommation) : rend les crédits retenus, sans écrire au journal.
 */
export async function release(reservationId: string): Promise<void> {
  const resv = await prisma.creditReservation.findUnique({ where: { id: reservationId } });
  if (!resv) return;
  const claim = await prisma.creditReservation.deleteMany({ where: { id: reservationId } });
  if (claim.count === 0) return;
  await prisma.creditWallet
    .update({ where: { userId: resv.userId }, data: { balance: { increment: resv.estimated } } })
    .catch(() => {});
}

/**
 * Libère les réservations orphelines (plus vieilles que le TTL) : couvre les
 * crashs / interruptions où `settle`/`release` n'a jamais été appelé. Renvoie le
 * nombre de réservations libérées.
 */
export async function releaseStaleReservations(
  userId?: string,
  olderThanMs = reservationTtlMs(),
): Promise<number> {
  const cutoff = new Date(Date.now() - olderThanMs);
  const stale = await prisma.creditReservation.findMany({
    where: { createdAt: { lt: cutoff }, ...(userId ? { userId } : {}) },
  });
  let n = 0;
  for (const r of stale) {
    const claim = await prisma.creditReservation.deleteMany({ where: { id: r.id } });
    if (claim.count === 0) continue;
    await prisma.creditWallet
      .update({ where: { userId: r.userId }, data: { balance: { increment: r.estimated } } })
      .catch(() => {});
    n++;
  }
  return n;
}

/** Consommation (crédits dépensés) par moteur depuis `since` — pour l'UI. */
export async function creditUsageByEngine(
  userId: string,
  since: Date,
): Promise<{ core: number; ultra: number; other: number; total: number }> {
  const rows = await prisma.creditLedger.groupBy({
    by: ["engine"],
    where: { userId, createdAt: { gte: since }, reason: { startsWith: "spend_" } },
    _sum: { delta: true },
  });
  let core = 0;
  let ultra = 0;
  let other = 0;
  for (const r of rows) {
    const spent = -(r._sum.delta ?? 0); // delta négatif → dépense positive
    if (r.engine === "core") core += spent;
    else if (r.engine === "ultra") ultra += spent;
    else other += spent;
  }
  return { core, ultra, other, total: core + ultra + other };
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
//
// IDEMPOTENCE STRICTE (fix audit Stripe P0 nº2) : chaque octroi lié à une
// période écrit une ligne de journal portant une `cycleKey` DÉTERMINISTE dérivée
// du DÉBUT de période. La contrainte unique (userId, cycleKey) fait de cette
// insertion une GARDE ATOMIQUE en base : deux webhooks rejoués ou livrés
// SIMULTANÉMENT pour la même période se disputent la même clé, un seul gagne,
// l'autre heurte la contrainte (P2002) et n'a aucun effet. L'octroi (réécriture
// du solde) et son marqueur vivent dans la MÊME transaction : pas de marqueur
// sans octroi (ni l'inverse), même en cas d'interruption.
// ---------------------------------------------------------------------------

/** Vrai si l'erreur Prisma est une violation de contrainte unique (P2002). */
function isUniqueViolation(e: unknown): boolean {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";
}

/** Clé d'idempotence d'un octroi de cycle, calée sur le début de période. */
function cycleGrantKey(periodStart: Date): string {
  return `cycle:${periodStart.toISOString()}`;
}

/** Clé d'idempotence d'un différentiel de montée d'offre dans une période. */
function upgradeGrantKey(periodStart: Date, toPlan: PlanId): string {
  return `upgrade:${periodStart.toISOString()}:${toPlan}`;
}

/**
 * Octroi de cycle ATOMIQUE et IDEMPOTENT : ramène le solde à l'allocation de
 * l'offre (reset « use-it-or-lose-it ») et cale le cycle du portefeuille sur la
 * période. Garde atomique via `cycleGrantKey(periodStart)` : un seul octroi
 * aboutit par (utilisateur, période). Renvoie `true` si CET appel a accordé,
 * `false` si la période était déjà créditée (doublon / rejeu / course).
 */
async function grantCycleOnce(
  userId: string,
  plan: PlanId,
  periodStart: Date,
  periodEnd: Date | null,
): Promise<boolean> {
  const alloc = monthlyCreditsFor(plan);
  const cycleKey = cycleGrantKey(periodStart);
  // Court-circuit SILENCIEUX si la période est déjà créditée (cas courant :
  // plusieurs événements Stripe — invoice.paid, customer.subscription.updated —
  // pour le même cycle). Évite une transaction vouée à lever P2002. La garde
  // ATOMIQUE ci-dessous reste le vrai rempart contre les courses simultanées.
  if (await prisma.creditLedger.findFirst({ where: { userId, cycleKey }, select: { id: true } })) {
    return false;
  }
  const wallet = await getOrCreateWallet(userId);
  // Solde courant pour le `delta` d'audit (le `balanceAfter` est toujours
  // l'allocation, puisqu'un octroi de cycle REMET le solde à `alloc`).
  const before = wallet.balance;
  try {
    // Transaction ATOMIQUE en lot (pas d'aller-retour interactif) : l'insertion
    // du marqueur unique (garde) et le reset du solde réussissent ou échouent
    // ensemble. Si le marqueur existe déjà (rejeu / course), le `create` lève
    // P2002 et TOUTE la transaction est annulée → aucun double octroi.
    await prisma.$transaction([
      prisma.creditLedger.create({
        data: {
          walletId: wallet.id,
          userId,
          delta: alloc - before, // mouvement net (octroi, éventuelle expiration du reliquat)
          balanceAfter: alloc,
          reason: "grant_cycle",
          cycleKey,
          meta: JSON.stringify({ plan, periodStart: periodStart.toISOString() }),
        },
      }),
      prisma.creditWallet.update({
        where: { userId },
        data: {
          balance: alloc, // reset « use-it-or-lose-it »
          allowance: alloc,
          cycleStart: periodStart,
          cycleEnd: periodEnd,
        },
      }),
    ]);
    return true;
  } catch (e) {
    if (isUniqueViolation(e)) return false; // période déjà créditée : aucun effet
    throw e;
  }
}

/**
 * Différentiel de MONTÉE d'offre dans un cycle DÉJÀ crédité : crédite seulement
 * l'écart d'allocation (jamais un reset complet). Atomique et idempotent via
 * `upgradeGrantKey(periodStart, toPlan)`. L'allocation affichée (jauge) est
 * toujours alignée sur la nouvelle offre, même quand le différentiel a déjà été
 * crédité (rejeu) ou qu'il est nul/négatif.
 */
async function topUpUpgradeOnce(
  userId: string,
  fromPlan: PlanId,
  toPlan: PlanId,
  periodStart: Date,
  periodEnd: Date | null,
): Promise<void> {
  const alloc = monthlyCreditsFor(toPlan);
  const delta = alloc - monthlyCreditsFor(fromPlan);
  const wallet = await getOrCreateWallet(userId);

  // Pas de crédit différentiel positif : on aligne seulement la jauge.
  if (delta <= 0) {
    await prisma.creditWallet.update({
      where: { userId },
      data: { allowance: alloc, cycleEnd: periodEnd ?? wallet.cycleEnd },
    });
    return;
  }

  const cycleKey = upgradeGrantKey(periodStart, toPlan);
  // Court-circuit SILENCIEUX si ce différentiel a déjà été crédité (rejeu) : on
  // réaligne seulement la jauge, sans tenter une transaction vouée à P2002.
  if (await prisma.creditLedger.findFirst({ where: { userId, cycleKey }, select: { id: true } })) {
    await prisma.creditWallet
      .update({ where: { userId }, data: { allowance: alloc, cycleEnd: periodEnd ?? wallet.cycleEnd } })
      .catch(() => {});
    return;
  }
  const before = wallet.balance;
  try {
    // Transaction ATOMIQUE en lot : garde unique (userId, cycleKey) + crédit du
    // différentiel. Un seul différentiel par (utilisateur, période, offre).
    await prisma.$transaction([
      prisma.creditLedger.create({
        data: {
          walletId: wallet.id,
          userId,
          delta,
          balanceAfter: before + delta,
          reason: "grant_upgrade",
          cycleKey,
          meta: JSON.stringify({ fromPlan, toPlan, periodStart: periodStart.toISOString() }),
        },
      }),
      prisma.creditWallet.update({
        where: { userId },
        data: {
          allowance: alloc,
          balance: { increment: delta },
          cycleEnd: periodEnd ?? wallet.cycleEnd,
        },
      }),
    ]);
  } catch (e) {
    if (!isUniqueViolation(e)) throw e;
    // Différentiel déjà crédité pour cette montée : on garantit tout de même que
    // la jauge reflète la nouvelle offre, sans re-créditer le solde.
    await prisma.creditWallet
      .update({
        where: { userId },
        data: { allowance: alloc, cycleEnd: periodEnd ?? wallet.cycleEnd },
      })
      .catch(() => {});
  }
}

/**
 * Fin d'accès payant (résiliation arrivée à terme, expiration). L'allocation
 * s'arrête : plus de crédits, plus de renouvellement. Il n'y a AUCUN repli
 * gratuit — un non-abonné n'a pas de crédits IA. On journalise le retrait du
 * reliquat. (Les abonnés ACTIFS ne passent jamais ici : leurs crédits restent
 * intacts.)
 */
async function endPaidAccess(userId: string): Promise<void> {
  const wallet = await getOrCreateWallet(userId);
  const updated = await prisma.creditWallet.update({
    where: { userId },
    data: {
      allowance: 0,
      balance: 0,
      cycleStart: new Date(),
      cycleEnd: null,
    },
  });
  if (wallet.balance !== 0) {
    await prisma.creditLedger.create({
      data: {
        walletId: updated.id,
        userId,
        delta: -wallet.balance,
        balanceAfter: 0,
        reason: "expire_cycle",
        meta: JSON.stringify({ plan: "none" }),
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
  //
  // Tout OCTROI de crédits (allocation de cycle OU différentiel de montée
  // d'offre) exige un PAIEMENT CONFIRMÉ, c.-à-d. un statut `active` ou
  // `trialing` (fix sécurité #1). On DÉCOUPLE ainsi deux notions que
  // `statusHasAccess` confond volontairement :
  //   • le DROIT D'ACCÈS (consommer le solde restant), qui peut subsister en
  //     sursis pendant `past_due`/`canceled` jusqu'à la fin de période ;
  //   • le DROIT À UNE NOUVELLE ALLOCATION, qui n'est accordé qu'une fois le
  //     paiement confirmé.
  // Sans ce découplage, un renouvellement ÉCHOUÉ (Stripe fait avancer la
  // période puis bascule en `past_due`) créditait un mois PLEIN à chaque cycle
  // non payé pendant toute la fenêtre de relance. Désormais `past_due` conserve
  // l'accès et le solde restant SANS nouvelle allocation ; quand la relance
  // aboutit (→ `active`, MÊME période), `grantCycleOnce` crédite une seule fois
  // (garde d'idempotence `cycleKey`).
  const paymentConfirmed = p.status === "active" || p.status === "trialing";

  if (paymentConfirmed) {
    const prevPlan: PlanId = prev ? toPlanId(prev.plan) : "free";
    const periodStart = p.currentPeriodStart ?? null;

    if (periodStart == null) {
      // PÉRIODE INCONNUE : on NE fabrique JAMAIS la date courante pour la clé
      // d'octroi (sinon chaque webhook rejouerait un octroi à tort — c'était le
      // bug P0). Le fix du format de période (stripe.ts/subscriptionPeriod)
      // garantit qu'en pratique elle est connue ; ce garde-fou couvre les états
      // dégradés (abonnement incomplet, payload partiel). On ne touche pas au
      // solde ; on peut au plus créditer un différentiel de montée d'offre en
      // s'appuyant sur une période LOCALE déjà connue.
      if (
        prevAccess &&
        prev?.currentPeriodStart &&
        PLAN_RANK[p.plan] > PLAN_RANK[prevPlan]
      ) {
        await topUpUpgradeOnce(
          userId,
          prevPlan,
          p.plan,
          prev.currentPeriodStart,
          p.currentPeriodEnd ?? prev.currentPeriodEnd ?? null,
        );
      }
      return;
    }

    // Octroi de cycle ATOMIQUE et IDEMPOTENT : une seule fois par (utilisateur,
    // période), que ce soit une activation, un renouvellement ou un rejeu.
    const granted = await grantCycleOnce(userId, p.plan, periodStart, p.currentPeriodEnd ?? null);
    if (!granted && prevAccess && PLAN_RANK[p.plan] > PLAN_RANK[prevPlan]) {
      // Période déjà créditée ET l'utilisateur avait DÉJÀ un accès payant d'une
      // offre inférieure → MONTÉE d'offre : on crédite le différentiel (idempotent).
      // `prevAccess` est ESSENTIEL : sans lui, une activation concurrente (où un
      // autre webhook a déjà accordé la période mais où `prev` est encore lu
      // « free ») serait prise à tort pour une montée free→offre et re-créditée.
      // Baisse d'offre dans le même cycle : aucun changement de solde ici.
      await topUpUpgradeOnce(userId, prevPlan, p.plan, periodStart, p.currentPeriodEnd ?? null);
    }
  } else if (!nowAccess && prevAccess) {
    // L'accès payant vient de prendre fin (expiration, ou `past_due`/`canceled`
    // dont la période est désormais échue) → arrêt de l'allocation (0 crédit).
    await endPaidAccess(userId);
  }
  // Cas restant — `nowAccess` vrai mais paiement NON confirmé (`past_due` ou
  // `canceled` encore en sursis) : on ne touche PAS au portefeuille. L'accès et
  // le solde RESTANT sont conservés, mais AUCUNE nouvelle allocation n'est
  // octroyée tant que le paiement n'est pas confirmé.
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
  /** Statut de l'abonnement (ou "none" si aucun abonnement payant actif). */
  status: string;
  entitlements: Entitlements;
  hasPaidAccess: boolean;
  wallet: { balance: number; allowance: number; cycleStart: Date; cycleEnd: Date | null };
  costs: Record<CreditOp, number>;
  /** Consommation du cycle courant, répartie par moteur (Core / Ultra / autres). */
  usage: { core: number; ultra: number; other: number; total: number };
  subscription: Subscription | null;
  /** Détail de l'abonnement payant (même si l'accès est encore actif après résiliation). */
  cancelAtPeriodEnd: boolean;
};

/**
 * État de facturation complet d'un utilisateur. Libère au passage les
 * réservations orphelines. AUCUN octroi automatique : un non-abonné reste à
 * 0 crédit. À appeler une fois par requête concernée.
 */
export async function getBillingState(userId: string): Promise<BillingState> {
  // Libère d'éventuelles réservations orphelines avant de lire le solde.
  await releaseStaleReservations(userId);

  const sub = await prisma.subscription.findUnique({ where: { userId } });
  const hasPaidAccess = sub
    ? statusHasAccess(sub.status, sub.currentPeriodEnd)
    : false;
  // « free » = état interne « sans abonnement actif » (pas une offre).
  const effectivePlan: PlanId = hasPaidAccess ? toPlanId(sub!.plan) : "free";

  const wallet = await getOrCreateWallet(userId);
  const usage = await creditUsageByEngine(userId, wallet.cycleStart);

  return {
    plan: effectivePlan,
    status: sub && hasPaidAccess ? sub.status : "none",
    entitlements: entitlementsFor(effectivePlan),
    hasPaidAccess,
    wallet: {
      balance: wallet.balance,
      allowance: wallet.allowance,
      cycleStart: wallet.cycleStart,
      cycleEnd: wallet.cycleEnd,
    },
    costs: creditCosts(),
    usage,
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
