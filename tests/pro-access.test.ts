// Tests de l'accès professionnel par code (lib/proAccess.ts) sur la base
// SQLite jetable. Les codes en clair ne figurent pas dans le dépôt (seules
// leurs empreintes SHA-256 y sont) : la correspondance code → compte est donc
// vérifiée de bout en bout par ailleurs (navigateur) ; ici on couvre le refus
// des saisies invalides, le provisionnement du compte d'un slot et l'entretien
// de l'abonnement Ultimate.

import { describe, it, expect } from "vitest";
import { prisma } from "@/lib/prisma";
import { getBillingState } from "@/lib/billing/store";
import { monthlyCreditsFor } from "@/lib/billing/plans";
import {
  PRO_CODES,
  slotForCode,
  proEmailForSlot,
  getOrCreateProUser,
  ensureUltimateAccess,
} from "@/lib/proAccess";

describe("codes professionnels — table", () => {
  it("contient 5 codes, slots uniques, empreintes SHA-256 valides", () => {
    expect(PRO_CODES).toHaveLength(5);
    const slots = new Set(PRO_CODES.map((e) => e.slot));
    expect(slots.size).toBe(5);
    for (const e of PRO_CODES) {
      expect(e.sha256).toMatch(/^[0-9a-f]{64}$/);
    }
    const hashes = new Set(PRO_CODES.map((e) => e.sha256));
    expect(hashes.size).toBe(5);
  });
});

describe("slotForCode — refus des saisies invalides", () => {
  it("rejette les formats invalides sans lever", () => {
    for (const bad of ["", "1234", "123456789", "abcdefgh", "1234567a", "        "]) {
      expect(slotForCode(bad)).toBeNull();
    }
  });

  it("rejette un code à 8 chiffres qui n'est pas dans la table", () => {
    expect(slotForCode("00000000")).toBeNull();
    expect(slotForCode("99999999")).toBeNull();
  });
});

describe("compte professionnel — provisionnement et abonnement", () => {
  it("crée le compte du slot à la première utilisation, puis le réutilise", async () => {
    const u1 = await getOrCreateProUser(1);
    expect(u1.email).toBe(proEmailForSlot(1));
    expect(u1.role).toBe("student");
    expect(u1.emailVerified).not.toBeNull();

    const u2 = await getOrCreateProUser(1);
    expect(u2.id).toBe(u1.id); // même compte, pas de doublon

    const settings = await prisma.settings.findUnique({
      where: { userId: u1.id },
    });
    expect(settings).not.toBeNull();
  });

  it("active un abonnement Ultimate avec l'allocation de crédits", async () => {
    const user = await getOrCreateProUser(2);
    await ensureUltimateAccess(user.id);

    const state = await getBillingState(user.id);
    expect(state.plan).toBe("ultimate");
    expect(state.hasPaidAccess).toBe(true);
    expect(state.status).toBe("active");
    expect(state.wallet.allowance).toBe(monthlyCreditsFor("ultimate"));
    expect(state.wallet.balance).toBe(monthlyCreditsFor("ultimate"));

    // Idempotent : un second appel ne re-crédite pas.
    await ensureUltimateAccess(user.id);
    const again = await getBillingState(user.id);
    expect(again.wallet.balance).toBe(monthlyCreditsFor("ultimate"));
  });
});
