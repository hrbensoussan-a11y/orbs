// Tests des deux correctifs P0 de l'audit Stripe (webhooks d'abonnement) :
//
//   P0 nº1 — Récupération FIABLE de la période de facturation, tolérante aux
//            DEUX formats Stripe : période au niveau de l'abonnement (API
//            historique) OU sur les lignes d'abonnement (API « basil » 2025-03+).
//            Et : une période INCONNUE n'est JAMAIS remplacée par la date
//            courante (ce qui déclencherait un octroi de crédits à tort).
//
//   P0 nº2 — Attribution des crédits STRICTEMENT idempotente : un utilisateur ne
//            reçoit son allocation qu'UNE SEULE fois par période, même si des
//            webhooks sont rejoués (répétés) ou livrés SIMULTANÉMENT. La garantie
//            repose sur une contrainte unique en base (CreditLedger.userId +
//            cycleKey) : l'octroi et son marqueur sont insérés atomiquement.
//
// Base SQLite jetable isolée (voir tests/setup). Aucun appel réseau à Stripe :
// on exerce `subscriptionPeriod`, `syncStripeSubscription` et `handleStripeEvent`
// sur des objets d'abonnement construits à la main (les deux formats).

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/prisma";
import { subscriptionPeriod, type StripeSubscription, type StripeEvent } from "@/lib/billing/stripe";
import { syncStripeSubscription, handleStripeEvent } from "@/lib/billing/webhook";
import { getSubscriptionRow } from "@/lib/billing/store";
import { monthlyCreditsFor } from "@/lib/billing/plans";

const DAY = 24 * 60 * 60 * 1000;
const PRICE_PLUS = "price_plus_test";
const PRICE_ULTIMATE = "price_ultimate_test";

// `planByStripePriceId` lit l'environnement à l'exécution : on relie nos Price
// de test aux offres plus/ultimate (références non secrètes).
beforeAll(() => {
  process.env.STRIPE_PRICE_PLUS = PRICE_PLUS;
  process.env.STRIPE_PRICE_ULTIMATE = PRICE_ULTIMATE;
});

afterAll(async () => {
  await prisma.$disconnect();
});

// --- Fabriques d'abonnements Stripe (les deux formats de période) ------------
type SubOpts = {
  id: string;
  userId?: string;
  customer?: string;
  status?: string;
  price?: string;
  startSec: number | null;
  endSec: number | null;
};

/** Format HISTORIQUE : période au niveau de l'abonnement. */
function legacySub(o: SubOpts): StripeSubscription {
  return {
    id: o.id,
    status: o.status ?? "active",
    customer: o.customer ?? "cus_test",
    cancel_at_period_end: false,
    canceled_at: null,
    current_period_start: o.startSec,
    current_period_end: o.endSec,
    items: { data: [{ id: "si_1", price: { id: o.price ?? PRICE_PLUS } }] },
    metadata: o.userId ? { userId: o.userId } : undefined,
  };
}

/** Format « basil »+ : période portée par les LIGNES, ABSENTE de l'abonnement. */
function basilSub(o: SubOpts): StripeSubscription {
  return {
    id: o.id,
    status: o.status ?? "active",
    customer: o.customer ?? "cus_test",
    cancel_at_period_end: false,
    canceled_at: null,
    // current_period_start/end volontairement absents au niveau abonnement.
    items: {
      data: [
        {
          id: "si_1",
          price: { id: o.price ?? PRICE_PLUS },
          current_period_start: o.startSec,
          current_period_end: o.endSec,
        },
      ],
    },
    metadata: o.userId ? { userId: o.userId } : undefined,
  };
}

// --- Helpers base ------------------------------------------------------------
async function makeUser(): Promise<string> {
  const id = `test_${crypto.randomUUID()}`;
  await prisma.user.create({ data: { id, email: `${id}@test.local`, passwordHash: "x" } });
  return id;
}
async function cleanup(id: string): Promise<void> {
  await prisma.user.delete({ where: { id } }).catch(() => {});
}
async function balanceOf(id: string): Promise<number> {
  const w = await prisma.creditWallet.findUnique({ where: { userId: id } });
  return w?.balance ?? 0;
}
async function grantRows(id: string, reason = "grant_cycle") {
  return prisma.creditLedger.findMany({
    where: { userId: id, reason },
    orderBy: { createdAt: "asc" },
  });
}

// ===========================================================================
// P0 nº1 — Récupération fiable de la période (deux formats + période inconnue)
// ===========================================================================
describe("P0 nº1 — période de facturation tolérante aux deux formats Stripe", () => {
  it("extrait la même fenêtre depuis le niveau abonnement OU depuis les lignes", () => {
    const start = Math.floor(Date.UTC(2026, 0, 1) / 1000);
    const end = Math.floor(Date.UTC(2026, 1, 1) / 1000);

    const legacy = subscriptionPeriod(legacySub({ id: "sub_a", startSec: start, endSec: end }));
    const basil = subscriptionPeriod(basilSub({ id: "sub_b", startSec: start, endSec: end }));

    expect(legacy.start?.getTime()).toBe(start * 1000);
    expect(legacy.end?.getTime()).toBe(end * 1000);
    // Format « basil » : lu sur la ligne, résultat IDENTIQUE.
    expect(basil.start?.getTime()).toBe(start * 1000);
    expect(basil.end?.getTime()).toBe(end * 1000);
  });

  it("renvoie null quand la période est RÉELLEMENT absente (pas de repli sur maintenant)", () => {
    const sub: StripeSubscription = {
      id: "sub_none",
      status: "active",
      customer: "cus_test",
      cancel_at_period_end: false,
      canceled_at: null,
      items: { data: [{ id: "si_1", price: { id: PRICE_PLUS } }] },
    };
    const p = subscriptionPeriod(sub);
    expect(p.start).toBeNull();
    expect(p.end).toBeNull();
  });

  it("écrit la bonne période dans l'abonnement local — format HISTORIQUE", async () => {
    const u = await makeUser();
    const start = Math.floor((Date.now() - 2 * DAY) / 1000);
    const end = Math.floor((Date.now() + 28 * DAY) / 1000);

    await syncStripeSubscription(u, legacySub({ id: "sub_leg", userId: u, startSec: start, endSec: end }));

    const row = await getSubscriptionRow(u);
    expect(row?.currentPeriodStart?.getTime()).toBe(start * 1000);
    expect(row?.currentPeriodEnd?.getTime()).toBe(end * 1000);
    expect(await balanceOf(u)).toBe(monthlyCreditsFor("plus"));
    await cleanup(u);
  });

  it("écrit la bonne période dans l'abonnement local — format « basil » (lignes)", async () => {
    const u = await makeUser();
    const start = Math.floor((Date.now() - 2 * DAY) / 1000);
    const end = Math.floor((Date.now() + 28 * DAY) / 1000);

    await syncStripeSubscription(u, basilSub({ id: "sub_bas", userId: u, startSec: start, endSec: end }));

    const row = await getSubscriptionRow(u);
    expect(row?.currentPeriodStart?.getTime()).toBe(start * 1000);
    expect(row?.currentPeriodEnd?.getTime()).toBe(end * 1000);
    // Avant le correctif, la période « basil » était illisible → null → repli sur
    // maintenant → octroi à chaque webhook. Ici : une allocation propre et unique.
    expect(await balanceOf(u)).toBe(monthlyCreditsFor("plus"));
    await cleanup(u);
  });

  it("période INCONNUE : aucun octroi, aucune date fabriquée, aucune accumulation au rejeu", async () => {
    const u = await makeUser();
    const noPeriod = (): StripeSubscription => ({
      id: "sub_x",
      status: "active",
      customer: "cus_test",
      cancel_at_period_end: false,
      canceled_at: null,
      items: { data: [{ id: "si_1", price: { id: PRICE_PLUS } }] },
      metadata: { userId: u },
    });

    // Plusieurs webhooks sans période : jamais d'octroi (sinon chaque appel
    // créditerait à tort en se repliant sur la date courante).
    await syncStripeSubscription(u, noPeriod());
    await syncStripeSubscription(u, noPeriod());
    await syncStripeSubscription(u, noPeriod());

    const row = await getSubscriptionRow(u);
    expect(row?.status).toBe("active");
    expect(row?.currentPeriodStart).toBeNull(); // jamais remplacée par « maintenant »
    expect(await balanceOf(u)).toBe(0); // aucun crédit fabriqué
    expect(await grantRows(u)).toHaveLength(0);
    await cleanup(u);
  });
});

// ===========================================================================
// P0 nº2 — Idempotence stricte de l'allocation (rejeu + simultané)
// ===========================================================================
describe("P0 nº2 — une seule allocation par période (rejeu & simultané)", () => {
  it("webhooks RÉPÉTÉS (même période) : crédite une seule fois", async () => {
    const u = await makeUser();
    const start = Math.floor((Date.now() - DAY) / 1000);
    const end = Math.floor((Date.now() + 29 * DAY) / 1000);
    const sub = basilSub({ id: "sub_rep", userId: u, startSec: start, endSec: end });

    // Cinq livraisons successives du même état (rejeu Stripe).
    for (let i = 0; i < 5; i++) await syncStripeSubscription(u, sub);

    expect(await balanceOf(u)).toBe(monthlyCreditsFor("plus")); // pas 5×
    expect(await grantRows(u)).toHaveLength(1); // un seul octroi journalisé
    await cleanup(u);
  });

  it("webhooks SIMULTANÉS (même période) : jamais de double allocation", async () => {
    const u = await makeUser();
    const start = Math.floor((Date.now() - DAY) / 1000);
    const end = Math.floor((Date.now() + 29 * DAY) / 1000);
    const sub = basilSub({ id: "sub_sim", userId: u, startSec: start, endSec: end });

    // 10 livraisons CONCURRENTES de la même activation. Sur SQLite (un seul
    // écrivain), certaines peuvent échouer par contention d'écriture → en
    // production Stripe renvoie alors l'événement (500). L'INVARIANT P0 à
    // garantir ici : la garde atomique (userId, cycleKey) interdit tout
    // double crédit, quelle que soit l'ordonnance.
    const results = await Promise.allSettled(
      Array.from({ length: 10 }, () => syncStripeSubscription(u, sub)),
    );
    expect(results.some((r) => r.status === "fulfilled")).toBe(true); // au moins une passe

    // AU PLUS un octroi, jamais de sur-crédit, même en pleine course.
    expect((await grantRows(u)).length).toBeLessThanOrEqual(1);
    expect([0, monthlyCreditsFor("plus")]).toContain(await balanceOf(u));

    // Convergence (comme un renvoi Stripe d'une livraison échouée) → EXACTEMENT
    // une allocation, jamais davantage, même après d'autres rejeux.
    await syncStripeSubscription(u, sub);
    await syncStripeSubscription(u, sub);
    expect(await grantRows(u)).toHaveLength(1); // une seule ligne grant_cycle
    expect(await balanceOf(u)).toBe(monthlyCreditsFor("plus")); // exactement l'allocation
    await cleanup(u);
  });

  it("un NOUVEAU cycle crédite à nouveau, et son rejeu n'ajoute rien", async () => {
    const u = await makeUser();
    const s1 = Math.floor((Date.now() - 31 * DAY) / 1000);
    const e1 = Math.floor((Date.now() - DAY) / 1000);
    const s2 = Math.floor((Date.now() - DAY) / 1000);
    const e2 = Math.floor((Date.now() + 29 * DAY) / 1000);

    // Cycle 1.
    await syncStripeSubscription(u, basilSub({ id: "sub_r", userId: u, startSec: s1, endSec: e1 }));
    expect(await grantRows(u)).toHaveLength(1);

    // Cycle 2 (renouvellement : nouvelle période) → nouvel octroi.
    const cycle2 = basilSub({ id: "sub_r", userId: u, startSec: s2, endSec: e2 });
    await syncStripeSubscription(u, cycle2);
    await syncStripeSubscription(u, cycle2); // rejeu du cycle 2
    await syncStripeSubscription(u, cycle2); // rejeu du cycle 2

    expect(await grantRows(u)).toHaveLength(2); // cycle1 + cycle2, pas plus
    expect(await balanceOf(u)).toBe(monthlyCreditsFor("plus"));
    await cleanup(u);
  });

  it("montée d'offre dans le même cycle : crédite le différentiel UNE fois (rejeu inclus)", async () => {
    const u = await makeUser();
    const start = Math.floor((Date.now() - DAY) / 1000);
    const end = Math.floor((Date.now() + 29 * DAY) / 1000);

    // Activation Plus.
    await syncStripeSubscription(u, basilSub({ id: "sub_up", userId: u, startSec: start, endSec: end, price: PRICE_PLUS }));
    expect(await balanceOf(u)).toBe(monthlyCreditsFor("plus"));

    // Montée Ultimate dans la MÊME période, rejouée plusieurs fois.
    const up = basilSub({ id: "sub_up", userId: u, startSec: start, endSec: end, price: PRICE_ULTIMATE });
    await syncStripeSubscription(u, up);
    await syncStripeSubscription(u, up);
    await syncStripeSubscription(u, up);

    // Solde = allocation Ultimate (Plus + différentiel), crédité une seule fois.
    expect(await balanceOf(u)).toBe(monthlyCreditsFor("ultimate"));
    expect(await grantRows(u, "grant_cycle")).toHaveLength(1);
    expect(await grantRows(u, "grant_upgrade")).toHaveLength(1); // un seul différentiel
    await cleanup(u);
  });

  it("handleStripeEvent (customer.subscription.updated, format « basil ») : rejeu sans double crédit", async () => {
    const u = await makeUser();
    const start = Math.floor((Date.now() - DAY) / 1000);
    const end = Math.floor((Date.now() + 29 * DAY) / 1000);
    const sub = basilSub({ id: "sub_evt", userId: u, startSec: start, endSec: end });

    const makeEvent = (evtId: string): StripeEvent => ({
      id: evtId,
      type: "customer.subscription.updated",
      created: Math.floor(Date.now() / 1000),
      data: { object: sub as unknown as Record<string, unknown> },
    });

    // Deux livraisons concurrentes du MÊME event.id (avant tout marquage amont) :
    // la garde atomique interdit le double crédit même sans dédoublonnage par
    // event.id. (Une des deux peut échouer par contention SQLite → 500 → renvoi
    // Stripe ; l'invariant reste : jamais de sur-crédit.)
    const burst = await Promise.allSettled([
      handleStripeEvent(makeEvent("evt_1")),
      handleStripeEvent(makeEvent("evt_1")),
    ]);
    expect(burst.some((r) => r.status === "fulfilled")).toBe(true);
    expect((await grantRows(u)).length).toBeLessThanOrEqual(1); // jamais deux octrois

    // Un autre event.id, même période (ex. mise à jour du moyen de paiement) et
    // un renvoi : ne re-crédite jamais → convergence sur UNE seule allocation.
    await handleStripeEvent(makeEvent("evt_2"));
    await handleStripeEvent(makeEvent("evt_1"));

    expect(await balanceOf(u)).toBe(monthlyCreditsFor("plus"));
    expect(await grantRows(u)).toHaveLength(1);
    await cleanup(u);
  });
});
