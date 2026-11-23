// Centre de gestion du compte (lib/account.ts + lib/proAccess.ts) sur la base
// SQLite jetable (voir tests/setup). On teste la logique SERVEUR directement
// (pas les server actions, qui dépendent de `cookies()` hors contexte de
// requête — convention déjà suivie par les autres tests du projet).

import { describe, it, expect, afterAll } from "vitest";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { isProAccountEmail, proEmailForSlot, getOrCreateProUser, ensureUltimateAccess } from "@/lib/proAccess";
import type { StripeReadGateway } from "@/lib/accountStripeCheck";
import {
  exportAccountData,
  changeUserPassword,
  canDeleteAccount,
  requestAccountDeletion,
  PRO_DELETE_CONFIRM_PHRASE,
} from "@/lib/account";

const PASSWORD = "mot-de-passe-correct-1";

async function makeUser(opts: {
  role?: "student" | "parent";
  password?: string;
}): Promise<{ id: string; email: string }> {
  const id = `test_${crypto.randomUUID()}`;
  const email = `${id}@test.local`;
  const passwordHash = await bcrypt.hash(opts.password ?? PASSWORD, 10);
  await prisma.user.create({
    data: { id, email, passwordHash, role: opts.role ?? "student", settings: { create: {} } },
  });
  return { id, email };
}

async function cleanup(id: string): Promise<void> {
  await prisma.user.delete({ where: { id } }).catch(() => {});
}

async function passwordHashOf(id: string): Promise<string> {
  const u = await prisma.user.findUniqueOrThrow({ where: { id }, select: { passwordHash: true } });
  return u.passwordHash;
}

afterAll(async () => {
  await prisma.$disconnect();
});

// ---------------------------------------------------------------------------
describe("isProAccountEmail", () => {
  it("reconnaît les adresses de comptes professionnels, insensible à la casse", () => {
    expect(isProAccountEmail(proEmailForSlot(1))).toBe(true);
    expect(isProAccountEmail("PRO-5@COMPTES.ORBS.INVALID")).toBe(true);
  });

  it("rejette une adresse normale, même proche du motif", () => {
    expect(isProAccountEmail("eleve@college.fr")).toBe(false);
    expect(isProAccountEmail("parent@comptes.orbs.invalid.attacker.com")).toBe(false);
    expect(isProAccountEmail("x@comptes.orbs.invalidx")).toBe(false);
    expect(isProAccountEmail("")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
describe("changeUserPassword", () => {
  it("refuse un mauvais mot de passe actuel, sans rien changer", async () => {
    const u = await makeUser({});
    const before = await passwordHashOf(u.id);
    const res = await changeUserPassword(u.id, "faux-mot-de-passe", "nouveau-mot-de-passe-1");
    expect(res.ok).toBe(false);
    expect(await passwordHashOf(u.id)).toBe(before);
    await cleanup(u.id);
  });

  it("refuse un nouveau mot de passe trop court", async () => {
    const u = await makeUser({});
    const before = await passwordHashOf(u.id);
    const res = await changeUserPassword(u.id, PASSWORD, "court");
    expect(res.ok).toBe(false);
    expect(await passwordHashOf(u.id)).toBe(before);
    await cleanup(u.id);
  });

  it("change le mot de passe quand l'actuel est correct ; l'ancien ne fonctionne plus", async () => {
    const u = await makeUser({});
    const res = await changeUserPassword(u.id, PASSWORD, "un-nouveau-mot-de-passe");
    expect(res.ok).toBe(true);
    const hash = await passwordHashOf(u.id);
    expect(await bcrypt.compare("un-nouveau-mot-de-passe", hash)).toBe(true);
    expect(await bcrypt.compare(PASSWORD, hash)).toBe(false);
    await cleanup(u.id);
  });

  it("refuse pour un compte professionnel, en expliquant pourquoi — sans rien changer", async () => {
    const slot = 3;
    const pro = await getOrCreateProUser(slot);
    const before = await passwordHashOf(pro.id);
    const res = await changeUserPassword(pro.id, "n'importe quoi", "un-nouveau-mot-de-passe");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/professionnel/i);
    expect(await passwordHashOf(pro.id)).toBe(before);
    // Compte de démonstration partagé entre tests : on ne le supprime pas.
  });
});

// ---------------------------------------------------------------------------
describe("canDeleteAccount — comptes sans référence Stripe (Stripe jamais interrogé)", () => {
  // Une passerelle qui échoue si on l'appelle : prouve qu'aucun appel n'a lieu.
  const noStripe: StripeReadGateway = {
    configured: () => true,
    retrieveSubscription: () => Promise.reject(new Error("Stripe ne doit pas être appelé")),
    retrieveCustomer: () => Promise.reject(new Error("Stripe ne doit pas être appelé")),
    listCustomerSubscriptions: () => Promise.reject(new Error("Stripe ne doit pas être appelé")),
  };

  it("n'est pas bloqué sans abonnement du tout", async () => {
    const u = await makeUser({});
    expect(await canDeleteAccount(u.id, noStripe)).toEqual({ blocked: false, checkedWithStripe: false });
    await cleanup(u.id);
  });

  it("compte professionnel Ultimate SANS référence Stripe : jamais bloqué, suppression par phrase", async () => {
    const pro = await getOrCreateProUser(4);
    await ensureUltimateAccess(pro.id);
    const state = await prisma.subscription.findUnique({ where: { userId: pro.id } });
    expect(state?.stripeSubscriptionId).toBeNull(); // bien la situation testée
    expect(state?.stripeCustomerId).toBeNull();
    expect(await canDeleteAccount(pro.id, noStripe)).toEqual({ blocked: false, checkedWithStripe: false });

    // Mauvaise phrase : refusée, compte intact.
    const bad = await requestAccountDeletion(pro.id, "supprimer", noStripe);
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.reason).toBe("bad_proof");
    expect(await prisma.user.findUnique({ where: { id: pro.id } })).not.toBeNull();

    // Bonne phrase : supprimé.
    const ok = await requestAccountDeletion(pro.id, PRO_DELETE_CONFIRM_PHRASE, noStripe);
    expect(ok).toEqual({ ok: true, deletedUserId: pro.id });
    expect(await prisma.user.findUnique({ where: { id: pro.id } })).toBeNull();
  });

  it("simulation de développement (abonnement local sans Stripe) : jamais bloqué", async () => {
    const u = await makeUser({});
    await prisma.subscription.create({
      data: {
        userId: u.id,
        plan: "plus",
        status: "active",
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 30 * 86_400_000),
      },
    });
    expect(await canDeleteAccount(u.id, noStripe)).toEqual({ blocked: false, checkedWithStripe: false });
    await cleanup(u.id);
  });
});

// ---------------------------------------------------------------------------
describe("requestAccountDeletion — vérification d'identité", () => {
  it("refuse un mauvais mot de passe pour un compte normal, sans supprimer", async () => {
    const u = await makeUser({});
    const res = await requestAccountDeletion(u.id, "mauvais-mot-de-passe");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe("bad_proof");
    expect(await prisma.user.findUnique({ where: { id: u.id } })).not.toBeNull();
    await cleanup(u.id);
  });

  it("supprime réellement le compte et TOUT ce qui lui est rattaché (cascade)", async () => {
    const u = await makeUser({});
    const other = await makeUser({ role: "parent" });

    // Fabrique des données dans tous les coins du schéma.
    const tag = await prisma.tag.create({ data: { userId: u.id, name: "école" } });
    await prisma.entry.create({
      data: {
        userId: u.id,
        title: "Une page",
        content: "contenu à supprimer",
        tags: { connect: [{ id: tag.id }] },
        media: { create: [{ url: "https://x.test/img.png", type: "image" }] },
      },
    });
    await prisma.familyLink.create({ data: { parentId: other.id, childId: u.id } });
    await prisma.cheer.create({ data: { fromId: other.id, toId: u.id, sticker: "🌟" } });
    await prisma.challenge.create({ data: { fromId: other.id, toId: u.id, kind: "streak", target: 5 } });
    await prisma.subscription.create({
      data: { userId: u.id, plan: "plus", status: "canceled", cancelAtPeriodEnd: false },
    });
    const wallet = await prisma.creditWallet.create({
      data: { userId: u.id, balance: 10, allowance: 10 },
    });
    await prisma.creditLedger.create({
      data: { walletId: wallet.id, userId: u.id, delta: 10, balanceAfter: 10, reason: "grant_cycle" },
    });

    const res = await requestAccountDeletion(u.id, PASSWORD);
    expect(res.ok).toBe(true);

    expect(await prisma.user.findUnique({ where: { id: u.id } })).toBeNull();
    expect(await prisma.entry.findMany({ where: { userId: u.id } })).toHaveLength(0);
    expect(await prisma.tag.findMany({ where: { userId: u.id } })).toHaveLength(0);
    expect(await prisma.settings.findUnique({ where: { userId: u.id } })).toBeNull();
    expect(await prisma.subscription.findUnique({ where: { userId: u.id } })).toBeNull();
    expect(await prisma.creditWallet.findUnique({ where: { userId: u.id } })).toBeNull();
    expect(await prisma.creditLedger.findMany({ where: { userId: u.id } })).toHaveLength(0);
    expect(await prisma.familyLink.findMany({ where: { childId: u.id } })).toHaveLength(0);
    expect(await prisma.cheer.findMany({ where: { toId: u.id } })).toHaveLength(0);
    expect(await prisma.challenge.findMany({ where: { toId: u.id } })).toHaveLength(0);

    // Le parent, lui, existe toujours : la cascade n'a touché QUE le compte supprimé.
    expect(await prisma.user.findUnique({ where: { id: other.id } })).not.toBeNull();
    await cleanup(other.id);
  });
});

// ---------------------------------------------------------------------------
describe("exportAccountData", () => {
  it("exporte un profil complet, sans jamais inclure de secret", async () => {
    const student = await makeUser({ role: "student" });
    const parent = await makeUser({ role: "parent" });

    await prisma.user.update({
      where: { id: student.id },
      data: {
        firstName: "Alix",
        lastName: "Martin",
        schoolClass: "Terminale",
        school: "Lycée Victor Hugo",
        avatar: JSON.stringify({ skin: "s2" }),
        shareMood: true,
      },
    });
    const tag = await prisma.tag.create({ data: { userId: student.id, name: "maths" } });
    await prisma.entry.create({
      data: { userId: student.id, title: "Journée", content: "Contenu du journal d'Alix.", tags: { connect: [{ id: tag.id }] } },
    });
    await prisma.familyLink.create({ data: { parentId: parent.id, childId: student.id } });
    await prisma.cheer.create({ data: { fromId: parent.id, toId: student.id, sticker: "🌟", message: "Bravo !" } });
    await prisma.challenge.create({ data: { fromId: parent.id, toId: student.id, kind: "streak", target: 5 } });
    await prisma.subscription.create({
      data: {
        userId: student.id,
        plan: "plus",
        status: "active",
        stripeCustomerId: "cus_abc",
        stripeSubscriptionId: "sub_abc",
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 30 * 86_400_000),
      },
    });
    const wallet = await prisma.creditWallet.create({ data: { userId: student.id, balance: 42, allowance: 100 } });
    await prisma.creditLedger.create({
      data: { walletId: wallet.id, userId: student.id, delta: -8, balanceAfter: 42, reason: "spend_chat", engine: "core" },
    });

    // Un AUTRE utilisateur, avec un contenu bien distinct : ne doit JAMAIS
    // apparaître dans l'export d'Alix (isolation).
    const stranger = await makeUser({});
    await prisma.entry.create({
      data: { userId: stranger.id, title: "Secret d'un autre", content: "CONTENU-ETRANGER-ne-doit-pas-fuiter" },
    });

    const data = await exportAccountData(student.id);
    const blob = JSON.stringify(data);

    // Contenu attendu.
    expect(data.compte.email).toBe(student.email);
    expect(data.compte.type).toBe("élève");
    expect(data.compte.prenom).toBe("Alix");
    expect(data.journal.entrees).toHaveLength(1);
    expect(blob).toContain("Contenu du journal d'Alix.");
    expect((data.avatar as { skin: string }).skin).toBe("s2");
    expect(data.famille.parents).toHaveLength(1);
    expect(data.famille.parents[0].email).toBe(parent.email);
    expect(data.famille.encouragementsRecus).toHaveLength(1);
    expect(data.famille.defisRecus).toHaveLength(1);
    expect((data.abonnement as { offre: string }).offre).toBe("Orbs Plus");
    expect((data.abonnement as { referenceAbonnementStripe: string }).referenceAbonnementStripe).toBe("sub_abc");
    expect((data.creditsPortefeuille as { solde: number }).solde).toBe(42);
    expect(data.mouvementsCredits).toHaveLength(1);

    // Jamais de secret, sous aucune forme.
    const user = await prisma.user.findUniqueOrThrow({ where: { id: student.id } });
    expect(blob).not.toContain(user.passwordHash);
    expect(blob).not.toContain("un-hash-secret-de-pin");
    expect(blob.toLowerCase()).not.toContain("pinhash");
    expect(data.preferences && "pinHash" in data.preferences).toBe(false);

    // Isolation : rien de l'étranger.
    expect(blob).not.toContain("CONTENU-ETRANGER-ne-doit-pas-fuiter");

    await cleanup(student.id);
    await cleanup(parent.id);
    await cleanup(stranger.id);
  });

  it("identifie correctement un compte parent et un compte professionnel", async () => {
    const parent = await makeUser({ role: "parent" });
    const parentData = await exportAccountData(parent.id);
    expect(parentData.compte.type).toBe("parent");
    await cleanup(parent.id);

    const pro = await getOrCreateProUser(5);
    const proData = await exportAccountData(pro.id);
    expect(proData.compte.type).toBe("professionnel (démonstration)");
    expect(proData.compte.note).toMatch(/généré/i);
  });
});
