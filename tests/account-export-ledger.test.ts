// Export du compte : historique des crédits COMPLET (plus de limite à 5 000
// mouvements), lu par pages, sans doublon ni oubli, et strictement limité au
// compte demandé. Base SQLite jetable (voir tests/setup).

import { describe, it, expect, afterAll } from "vitest";
import { prisma } from "@/lib/prisma";
import {
  exportAccountData,
  readFullCreditLedger,
  LEDGER_EXPORT_PAGE_SIZE,
} from "@/lib/account";

const created: string[] = [];

async function makeUserWithWallet(): Promise<{ id: string; walletId: string }> {
  const id = `test_ledger_${crypto.randomUUID()}`;
  await prisma.user.create({
    data: { id, email: `${id}@test.local`, passwordHash: "x", settings: { create: {} } },
  });
  const w = await prisma.creditWallet.create({ data: { userId: id, balance: 0, allowance: 0 } });
  created.push(id);
  return { id, walletId: w.id };
}

/** Insère `n` mouvements ; `at(i)` donne la date du i-ème. */
async function addMovements(
  user: { id: string; walletId: string },
  n: number,
  at: (i: number) => Date,
  tag = user.id,
): Promise<void> {
  for (let start = 0; start < n; start += 2500) {
    await prisma.creditLedger.createMany({
      data: Array.from({ length: Math.min(2500, n - start) }, (_, k) => {
        const i = start + k;
        return {
          walletId: user.walletId,
          userId: user.id,
          delta: -1,
          balanceAfter: n - i,
          reason: "spend_chat",
          engine: "core",
          meta: JSON.stringify({ n: i, owner: tag }),
          createdAt: at(i),
        };
      }),
    });
  }
}

afterAll(async () => {
  for (const id of created) await prisma.user.delete({ where: { id } }).catch(() => {});
  await prisma.$disconnect();
});

describe("export : historique des crédits complet", () => {
  it("contient les 5 123 mouvements (au-delà de l'ancienne limite de 5 000), du plus récent au plus ancien", async () => {
    const u = await makeUserWithWallet();
    const N = 5123; // > 5 000 et pas un multiple de la taille de page
    const base = Date.UTC(2026, 0, 1);
    await addMovements(u, N, (i) => new Date(base + i * 60_000));

    const data = await exportAccountData(u.id);
    const rows = data.mouvementsCredits as { date: string; details: { n: number; owner: string } }[];

    expect(rows).toHaveLength(N);
    // Chaque mouvement exactement une fois.
    const seen = new Set(rows.map((r) => r.details.n));
    expect(seen.size).toBe(N);
    expect(Math.min(...seen)).toBe(0);
    expect(Math.max(...seen)).toBe(N - 1);
    // Ordre : le plus récent d'abord, le plus ancien (le tout premier) en dernier.
    expect(rows[0].details.n).toBe(N - 1);
    expect(rows[N - 1].details.n).toBe(0);
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i - 1].date >= rows[i].date).toBe(true);
    }
    // Les détails enregistrés par le serveur sont exportés, lisibles.
    expect(rows[0].details.owner).toBe(u.id);
  }, 60_000);

  it("ne perd ni ne double aucun mouvement quand beaucoup partagent la même milliseconde, à cheval sur plusieurs pages", async () => {
    const u = await makeUserWithWallet();
    const N = 53;
    const same = new Date(Date.UTC(2026, 5, 1, 12, 0, 0));
    // 40 mouvements à la même milliseconde, puis 13 autres.
    await addMovements(u, N, (i) => (i < 40 ? same : new Date(same.getTime() + i * 1000)));

    for (const pageSize of [1, 7, 40, 52, 53, 54]) {
      const rows = await readFullCreditLedger(u.id, pageSize);
      expect(rows).toHaveLength(N);
      expect(new Set(rows.map((r) => r.id)).size).toBe(N);
    }
  });

  it("une taille d'historique multiple exact de la taille de page est lue entièrement", async () => {
    const u = await makeUserWithWallet();
    const base = Date.UTC(2026, 2, 1);
    await addMovements(u, 30, (i) => new Date(base + i));
    expect(await readFullCreditLedger(u.id, 10)).toHaveLength(30);
    expect(await readFullCreditLedger(u.id, 30)).toHaveLength(30);
  });

  it("ne contient JAMAIS de mouvement d'un autre compte, même entrelacé dans le temps", async () => {
    const a = await makeUserWithWallet();
    const b = await makeUserWithWallet();
    const base = Date.UTC(2026, 3, 1);
    // Mêmes horodatages pour les deux comptes, pages plus petites que l'historique.
    await addMovements(a, 2100, (i) => new Date(base + i * 1000));
    await addMovements(b, 2300, (i) => new Date(base + i * 1000));

    const rowsA = await readFullCreditLedger(a.id, 250);
    expect(rowsA).toHaveLength(2100);
    const ids = rowsA.map((r) => r.id);
    const foreign = await prisma.creditLedger.count({ where: { id: { in: ids }, userId: { not: a.id } } });
    expect(foreign).toBe(0);

    const data = await exportAccountData(a.id);
    const rows = data.mouvementsCredits as { details: { owner: string } }[];
    expect(rows).toHaveLength(2100);
    expect(rows.every((r) => r.details.owner === a.id)).toBe(true);
    expect(JSON.stringify(data)).not.toContain(b.id);
  }, 60_000);

  it("compte sans aucun mouvement : historique vide, sans erreur", async () => {
    const u = await makeUserWithWallet();
    const data = await exportAccountData(u.id);
    expect(data.mouvementsCredits).toEqual([]);
  });

  it("la taille de page par défaut est raisonnable (lecture bornée par requête)", () => {
    expect(LEDGER_EXPORT_PAGE_SIZE).toBeGreaterThanOrEqual(500);
    expect(LEDGER_EXPORT_PAGE_SIZE).toBeLessThanOrEqual(5000);
  });
});
