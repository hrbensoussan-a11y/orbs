// Tests du service centralisé de crédits (lib/billing/store.ts) sur une base
// SQLite jetable. Couvre : débits (réserver → réconcilier), remboursements
// (libération), erreurs (solde insuffisant, bornage), interruptions
// (réservations orphelines), renouvellements (cycle d'abonnement) et requêtes
// simultanées (aucun solde négatif, aucune sur-réservation).

import { describe, it, expect, afterAll } from "vitest";
import { prisma } from "@/lib/prisma";
import {
  reserve,
  settle,
  release,
  releaseStaleReservations,
  applySubscriptionState,
  creditUsageByEngine,
} from "@/lib/billing/store";
import { monthlyCreditsFor } from "@/lib/billing/plans";

const DAY = 24 * 60 * 60 * 1000;

/** Crée un utilisateur + un portefeuille au solde contrôlé (cycle non échu). */
async function makeUser(balance: number): Promise<string> {
  const id = `test_${crypto.randomUUID()}`;
  await prisma.user.create({
    data: { id, email: `${id}@test.local`, passwordHash: "x" },
  });
  const now = new Date();
  await prisma.creditWallet.create({
    data: {
      userId: id,
      balance,
      allowance: Math.max(balance, 0),
      cycleStart: now,
      cycleEnd: new Date(now.getTime() + 30 * DAY),
    },
  });
  return id;
}

async function cleanup(id: string): Promise<void> {
  await prisma.user.delete({ where: { id } }).catch(() => {});
}
async function balanceOf(id: string): Promise<number> {
  const w = await prisma.creditWallet.findUnique({ where: { userId: id } });
  return w?.balance ?? 0;
}
async function reservationCount(id: string): Promise<number> {
  return prisma.creditReservation.count({ where: { userId: id } });
}
async function spends(id: string) {
  return prisma.creditLedger.findMany({
    where: { userId: id, reason: { startsWith: "spend_" } },
    orderBy: { createdAt: "asc" },
  });
}

afterAll(async () => {
  await prisma.$disconnect();
});

describe("service de crédits — réserver → réconcilier", () => {
  it("débite le coût réel et rend le reste réservé (portefeuille unique Core/Ultra)", async () => {
    const u = await makeUser(100);
    const r = await reserve(u, "chat_ultra", { estimated: 20, engine: "ultra", hasPaidAccess: true });
    expect(r.ok).toBe(true);
    expect(await balanceOf(u)).toBe(80); // 100 - 20 (retenue)

    const s = await settle(r.ok ? r.reservationId : "", 7);
    expect(s).toMatchObject({ settled: true, charged: 7 });
    expect(await balanceOf(u)).toBe(93); // 80 + (20 - 7) rendu
    expect(await reservationCount(u)).toBe(0);

    const led = await spends(u);
    expect(led).toHaveLength(1);
    expect(led[0].delta).toBe(-7);
    expect(led[0].engine).toBe("ultra");

    // La consommation par moteur alimente l'UI (répartition Core/Ultra).
    const usage = await creditUsageByEngine(u, new Date(Date.now() - DAY));
    expect(usage.ultra).toBe(7);
    expect(usage.core).toBe(0);
    await cleanup(u);
  });

  it("libère intégralement en cas d'échec (remboursement, rien journalisé)", async () => {
    const u = await makeUser(50);
    const r = await reserve(u, "chat_core", { estimated: 10, engine: "core", hasPaidAccess: true });
    expect(await balanceOf(u)).toBe(40);
    await release(r.ok ? r.reservationId : "");
    expect(await balanceOf(u)).toBe(50); // tout rendu
    expect(await reservationCount(u)).toBe(0);
    expect(await spends(u)).toHaveLength(0);
    await cleanup(u);
  });

  it("refuse si le solde est insuffisant, sans rien retenir", async () => {
    const u = await makeUser(5);
    const r = await reserve(u, "chat_ultra", { estimated: 10, engine: "ultra", hasPaidAccess: true });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("insufficient");
    expect(await balanceOf(u)).toBe(5); // inchangé
    expect(await reservationCount(u)).toBe(0);
    await cleanup(u);
  });

  it("borne le coût réel à l'estimation (jamais de solde négatif)", async () => {
    const u = await makeUser(30);
    const r = await reserve(u, "chat_ultra", { estimated: 10, engine: "ultra", hasPaidAccess: true });
    const s = await settle(r.ok ? r.reservationId : "", 999); // sous-estimation extrême
    expect(s.charged).toBe(10); // plafonné à la retenue
    expect(await balanceOf(u)).toBe(20); // 30 - 10, jamais négatif
    await cleanup(u);
  });

  it("ignore un double règlement (idempotent)", async () => {
    const u = await makeUser(100);
    const r = await reserve(u, "chat_core", { estimated: 20, engine: "core", hasPaidAccess: true });
    const id = r.ok ? r.reservationId : "";
    const s1 = await settle(id, 5);
    const s2 = await settle(id, 5); // rejoué
    expect(s1.settled).toBe(true);
    expect(s2.settled).toBe(false);
    expect(await balanceOf(u)).toBe(95); // 80 + 15, une seule fois
    expect(await spends(u)).toHaveLength(1);
    await cleanup(u);
  });

  it("libère les réservations orphelines (interruption / crash)", async () => {
    const u = await makeUser(40);
    const r = await reserve(u, "chat_ultra", { estimated: 15, engine: "ultra", hasPaidAccess: true });
    expect(await balanceOf(u)).toBe(25);
    // Antidate la réservation pour la rendre « périmée ».
    await prisma.creditReservation.update({
      where: { id: r.ok ? r.reservationId : "" },
      data: { createdAt: new Date(Date.now() - 10 * 60 * 1000) },
    });
    const n = await releaseStaleReservations(u, 5 * 60 * 1000);
    expect(n).toBe(1);
    expect(await balanceOf(u)).toBe(40); // retenue rendue
    expect(await reservationCount(u)).toBe(0);
    await cleanup(u);
  });

  it("renouvelle (réinitialise) les crédits selon le cycle d'abonnement", async () => {
    const u = await makeUser(10); // solde bas
    const plus = monthlyCreditsFor("plus");
    const now = new Date();

    await applySubscriptionState(u, {
      plan: "plus",
      status: "active",
      currentPeriodStart: now,
      currentPeriodEnd: new Date(now.getTime() + 30 * DAY),
      cancelAtPeriodEnd: false,
      canceledAt: null,
    });
    expect(await balanceOf(u)).toBe(plus); // alloc accordée

    // Consomme un peu, puis nouveau cycle (période avancée) → reset.
    const r = await reserve(u, "chat_core", { estimated: 5, engine: "core", hasPaidAccess: true });
    await settle(r.ok ? r.reservationId : "", 5);
    expect(await balanceOf(u)).toBe(plus - 5);

    const next = new Date(now.getTime() + 30 * DAY);
    await applySubscriptionState(u, {
      plan: "plus",
      status: "active",
      currentPeriodStart: next,
      currentPeriodEnd: new Date(next.getTime() + 30 * DAY),
      cancelAtPeriodEnd: false,
      canceledAt: null,
    });
    expect(await balanceOf(u)).toBe(plus); // renouvelé
    await cleanup(u);
  });

  it("requêtes simultanées : jamais de solde négatif ni de sur-réservation", async () => {
    const u = await makeUser(100);
    const cost = 7;
    const attempts = 20; // 20 × 7 = 140 > 100
    const results = await Promise.allSettled(
      Array.from({ length: attempts }, () =>
        reserve(u, "chat_core", { estimated: cost, engine: "core", hasPaidAccess: true }),
      ),
    );
    const okCount = results.filter((r) => r.status === "fulfilled" && r.value.ok).length;
    const held = await reservationCount(u);
    const bal = await balanceOf(u);

    expect(bal).toBeGreaterThanOrEqual(0); // jamais négatif
    expect(okCount).toBe(held); // une réservation par réservation réussie
    expect(bal).toBe(100 - held * cost); // solde = retenues exactes
    expect(held).toBeLessThanOrEqual(Math.floor(100 / cost)); // pas de sur-réservation
    await cleanup(u);
  });
});
