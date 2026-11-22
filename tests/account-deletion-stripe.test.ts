// Suppression de compte : vérification DIRECTE auprès de Stripe (lib/
// accountStripeCheck.ts) et nettoyage des codes e-mail. Stripe est SIMULÉ
// (aucun appel réseau) ; base SQLite jetable (voir tests/setup).
//
// Ce qu'on prouve :
//   - la décision suit l'état RÉEL chez Stripe, jamais le seul état local ;
//   - toute incertitude (erreur, indisponibilité, référence invalide,
//     incohérence, état ambigu) BLOQUE la suppression ;
//   - la procédure ne fait QUE lire chez Stripe (jamais d'annulation) ;
//   - les comptes sans référence Stripe ne sont pas bloqués.

import { describe, it, expect, afterAll, afterEach, vi } from "vitest";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { StripeError, type StripeSubscription, type StripeCustomer } from "@/lib/billing/stripe";
import {
  assessStripeSubscription,
  type StripeReadGateway,
} from "@/lib/accountStripeCheck";
import { canDeleteAccount, requestAccountDeletion, findGoneUserIds } from "@/lib/account";

const PASSWORD = "mot-de-passe-correct-1";
const DAY = 86_400;
const now = () => Math.floor(Date.now() / 1000);

afterAll(async () => {
  await prisma.$disconnect();
});

// --- Fabriques ---------------------------------------------------------------

async function makeUser(sub?: {
  stripeSubscriptionId?: string | null;
  stripeCustomerId?: string | null;
  status?: string;
  cancelAtPeriodEnd?: boolean;
}): Promise<{ id: string; email: string }> {
  const id = `test_${crypto.randomUUID()}`;
  const email = `${id}@test.local`;
  await prisma.user.create({
    data: { id, email, passwordHash: await bcrypt.hash(PASSWORD, 4), settings: { create: {} } },
  });
  if (sub) {
    // `stripeSubscriptionId` est unique : on libère l'identifiant fictif
    // réutilisé d'un test à l'autre (base jetable).
    if (sub.stripeSubscriptionId) {
      await prisma.subscription.deleteMany({ where: { stripeSubscriptionId: sub.stripeSubscriptionId } });
    }
    await prisma.subscription.create({
      data: {
        userId: id,
        plan: "ultimate",
        status: sub.status ?? "active",
        stripeSubscriptionId: sub.stripeSubscriptionId ?? null,
        stripeCustomerId: sub.stripeCustomerId ?? null,
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 30 * DAY * 1000),
        cancelAtPeriodEnd: sub.cancelAtPeriodEnd ?? false,
      },
    });
  }
  return { id, email };
}

const exists = async (id: string) => (await prisma.user.findUnique({ where: { id } })) !== null;

function stripeSub(over: Partial<StripeSubscription> = {}): StripeSubscription {
  return {
    id: "sub_1",
    status: "active",
    customer: "cus_1",
    cancel_at_period_end: false,
    canceled_at: null,
    current_period_start: now() - DAY,
    current_period_end: now() + 29 * DAY,
    items: { data: [{ id: "si_1" }] },
    ...over,
  };
}

type Calls = { method: string; arg: string }[];

/**
 * Stripe simulé, LECTURE SEULE par construction (aucune méthode d'écriture
 * n'existe sur la passerelle). Chaque appel est enregistré.
 */
function fakeStripe(o: {
  subs?: Record<string, StripeSubscription | Error>;
  customers?: Record<string, StripeCustomer | Error>;
  lists?: Record<string, { data: StripeSubscription[]; has_more?: boolean } | Error>;
  configured?: boolean;
}): StripeReadGateway & { calls: Calls } {
  const calls: Calls = [];
  const notFound = () => new StripeError("No such resource", 404, "invalid_request_error", "resource_missing");
  const answer = <T,>(v: T | Error | undefined): Promise<T> =>
    v === undefined ? Promise.reject(notFound()) : v instanceof Error ? Promise.reject(v) : Promise.resolve(v);
  return {
    calls,
    configured: () => o.configured ?? true,
    retrieveSubscription: (id) => {
      calls.push({ method: "retrieveSubscription", arg: id });
      return answer(o.subs?.[id]);
    },
    retrieveCustomer: (id) => {
      calls.push({ method: "retrieveCustomer", arg: id });
      return answer(o.customers?.[id]);
    },
    listCustomerSubscriptions: (id) => {
      calls.push({ method: "listCustomerSubscriptions", arg: id });
      const l = o.lists?.[id];
      if (l instanceof Error) return Promise.reject(l);
      return Promise.resolve({ data: l?.data ?? [], has_more: l?.has_more ?? false });
    },
  };
}

/** Stripe cohérent : abonnement sub_1 du client cus_1, appartenant à `userId`. */
function consistentStripe(userId: string, sub: Partial<StripeSubscription>) {
  const s = stripeSub({ metadata: { userId }, ...sub });
  return fakeStripe({
    subs: { sub_1: s },
    customers: { cus_1: { id: "cus_1", metadata: { userId } } },
    lists: { cus_1: { data: [s] } },
  });
}

// --- Lecture de l'état d'un abonnement ---------------------------------------

describe("assessStripeSubscription — interprétation stricte", () => {
  it("terminé : canceled, incomplete_expired", () => {
    expect(assessStripeSubscription(stripeSub({ status: "canceled" }))).toBe("ended");
    expect(assessStripeSubscription(stripeSub({ status: "incomplete_expired" }))).toBe("ended");
  });
  it("actif sans résiliation : se renouvelle", () => {
    expect(assessStripeSubscription(stripeSub())).toBe("renewing");
    expect(assessStripeSubscription(stripeSub({ status: "trialing" }))).toBe("renewing");
  });
  it("résiliation programmée en fin de période, ou datée avant la fin de période", () => {
    expect(assessStripeSubscription(stripeSub({ cancel_at_period_end: true }))).toBe("cancel_scheduled");
    expect(assessStripeSubscription(stripeSub({ cancel_at: now() + 10 * DAY }))).toBe("cancel_scheduled");
  });
  it("résiliation datée APRÈS la fin de période : un renouvellement aura lieu", () => {
    expect(assessStripeSubscription(stripeSub({ cancel_at: now() + 90 * DAY }))).toBe("renewing");
  });
  it("paiement en attente : past_due, unpaid, incomplete", () => {
    for (const status of ["past_due", "unpaid", "incomplete"]) {
      expect(assessStripeSubscription(stripeSub({ status }))).toBe("payment_pending");
    }
    // Même avec résiliation programmée : une facture peut encore être réclamée.
    expect(assessStripeSubscription(stripeSub({ status: "past_due", cancel_at_period_end: true }))).toBe(
      "payment_pending",
    );
  });
  it("ambigu : paused, statut inconnu, échéancier, cancel_at sans période connue", () => {
    expect(assessStripeSubscription(stripeSub({ status: "paused" }))).toBe("ambiguous");
    expect(assessStripeSubscription(stripeSub({ status: "bizarre" }))).toBe("ambiguous");
    expect(assessStripeSubscription(stripeSub({ schedule: "sub_sched_1", cancel_at_period_end: true }))).toBe(
      "ambiguous",
    );
    expect(
      assessStripeSubscription(
        stripeSub({ cancel_at: now() + DAY, current_period_end: null, current_period_start: null }),
      ),
    ).toBe("ambiguous");
  });
});

// --- Décisions de suppression ------------------------------------------------

describe("suppression — décision selon l'état RÉEL chez Stripe", () => {
  const refs = { stripeSubscriptionId: "sub_1", stripeCustomerId: "cus_1" };

  it("abonnement actif sans résiliation : BLOQUÉ, compte intact", async () => {
    const u = await makeUser(refs);
    const stripe = consistentStripe(u.id, {});
    expect(await canDeleteAccount(u.id, stripe)).toMatchObject({ blocked: true, reason: "subscription_active" });
    const res = await requestAccountDeletion(u.id, PASSWORD, stripe);
    expect(res).toMatchObject({ ok: false, reason: "subscription_active" });
    expect(await exists(u.id)).toBe(true);
  });

  it("résiliation réellement programmée chez Stripe : autorisé", async () => {
    const u = await makeUser(refs);
    const stripe = consistentStripe(u.id, { cancel_at_period_end: true });
    expect(await canDeleteAccount(u.id, stripe)).toEqual({ blocked: false, checkedWithStripe: true });
    expect(await requestAccountDeletion(u.id, PASSWORD, stripe)).toEqual({ ok: true, deletedUserId: u.id });
    expect(await exists(u.id)).toBe(false);
  });

  it("abonnement résilié chez Stripe : autorisé", async () => {
    const u = await makeUser(refs);
    expect(await canDeleteAccount(u.id, consistentStripe(u.id, { status: "canceled" }))).toMatchObject({
      blocked: false,
    });
  });

  it("abonnement expiré chez Stripe (incomplete_expired) : autorisé", async () => {
    const u = await makeUser(refs);
    expect(await canDeleteAccount(u.id, consistentStripe(u.id, { status: "incomplete_expired" }))).toMatchObject({
      blocked: false,
    });
  });

  it("état local « résilié » mais Stripe dit « actif, se renouvelle » : BLOQUÉ (Stripe fait foi)", async () => {
    const u = await makeUser({ ...refs, status: "canceled", cancelAtPeriodEnd: true });
    const res = await requestAccountDeletion(u.id, PASSWORD, consistentStripe(u.id, {}));
    expect(res).toMatchObject({ ok: false, reason: "subscription_active" });
    expect(await exists(u.id)).toBe(true);
  });

  it("état local « actif » mais Stripe dit « résilié » : autorisé (Stripe fait foi)", async () => {
    const u = await makeUser({ ...refs, status: "active", cancelAtPeriodEnd: false });
    expect(await canDeleteAccount(u.id, consistentStripe(u.id, { status: "canceled" }))).toMatchObject({
      blocked: false,
    });
  });

  it("paiement en retard (past_due) : BLOQUÉ par prudence", async () => {
    const u = await makeUser(refs);
    expect(await canDeleteAccount(u.id, consistentStripe(u.id, { status: "past_due" }))).toMatchObject({
      blocked: true,
      reason: "payment_pending",
    });
  });

  it("abonnement inconnu localement mais actif chez le client Stripe (webhook en retard) : BLOQUÉ", async () => {
    const u = await makeUser({ stripeCustomerId: "cus_1" }); // pas encore d'id d'abonnement local
    const hidden = stripeSub({ id: "sub_hidden", metadata: { userId: u.id } });
    const stripe = fakeStripe({
      customers: { cus_1: { id: "cus_1", metadata: { userId: u.id } } },
      lists: { cus_1: { data: [hidden] } },
    });
    expect(await canDeleteAccount(u.id, stripe)).toMatchObject({ blocked: true, reason: "subscription_active" });
  });

  it("un autre abonnement actif du même client bloque, même si celui connu est résilié", async () => {
    const u = await makeUser(refs);
    const known = stripeSub({ status: "canceled", metadata: { userId: u.id } });
    const other = stripeSub({ id: "sub_2", metadata: { userId: u.id } });
    const stripe = fakeStripe({
      subs: { sub_1: known },
      customers: { cus_1: { id: "cus_1", metadata: { userId: u.id } } },
      lists: { cus_1: { data: [known, other] } },
    });
    expect(await canDeleteAccount(u.id, stripe)).toMatchObject({ blocked: true, reason: "subscription_active" });
  });

  it("client Stripe supprimé et abonnement résilié : autorisé", async () => {
    const u = await makeUser(refs);
    const stripe = fakeStripe({
      subs: { sub_1: stripeSub({ status: "canceled" }) },
      customers: { cus_1: { id: "cus_1", deleted: true } },
    });
    expect(await canDeleteAccount(u.id, stripe)).toMatchObject({ blocked: false });
    expect(stripe.calls.map((c) => c.method)).not.toContain("listCustomerSubscriptions");
  });
});

describe("suppression — toute incertitude BLOQUE", () => {
  const refs = { stripeSubscriptionId: "sub_1", stripeCustomerId: "cus_1" };

  it("identifiant d'abonnement invalide (introuvable chez Stripe) : BLOQUÉ", async () => {
    const u = await makeUser(refs);
    const stripe = fakeStripe({ customers: { cus_1: { id: "cus_1" } } }); // sub_1 absent → 404
    const res = await requestAccountDeletion(u.id, PASSWORD, stripe);
    expect(res).toMatchObject({ ok: false, reason: "stripe_unverifiable" });
    expect(await exists(u.id)).toBe(true);
  });

  it("client Stripe introuvable : BLOQUÉ", async () => {
    const u = await makeUser({ stripeCustomerId: "cus_missing" });
    expect(await canDeleteAccount(u.id, fakeStripe({}))).toMatchObject({
      blocked: true,
      reason: "stripe_unverifiable",
    });
  });

  it("abonnement d'un AUTRE client que celui enregistré : BLOQUÉ (incohérence)", async () => {
    const u = await makeUser(refs);
    const stripe = fakeStripe({
      subs: { sub_1: stripeSub({ customer: "cus_autre", status: "canceled" }) },
      customers: { cus_1: { id: "cus_1" } },
    });
    expect(await canDeleteAccount(u.id, stripe)).toMatchObject({ blocked: true, reason: "stripe_unverifiable" });
  });

  it("client Stripe rattaché à un AUTRE compte Orbs : BLOQUÉ (incohérence)", async () => {
    const u = await makeUser({ stripeCustomerId: "cus_1" });
    const stripe = fakeStripe({ customers: { cus_1: { id: "cus_1", metadata: { userId: "quelqu_un_d_autre" } } } });
    expect(await canDeleteAccount(u.id, stripe)).toMatchObject({ blocked: true, reason: "stripe_unverifiable" });
  });

  it("abonnement rattaché à un AUTRE compte Orbs : BLOQUÉ (incohérence)", async () => {
    const u = await makeUser(refs);
    const stripe = fakeStripe({
      subs: { sub_1: stripeSub({ status: "canceled", metadata: { userId: "quelqu_un_d_autre" } }) },
      customers: { cus_1: { id: "cus_1" } },
    });
    expect(await canDeleteAccount(u.id, stripe)).toMatchObject({ blocked: true, reason: "stripe_unverifiable" });
  });

  it("liste d'abonnements tronquée (has_more) : BLOQUÉ", async () => {
    const u = await makeUser({ stripeCustomerId: "cus_1" });
    const stripe = fakeStripe({
      customers: { cus_1: { id: "cus_1" } },
      lists: { cus_1: { data: [stripeSub({ status: "canceled" })], has_more: true } },
    });
    expect(await canDeleteAccount(u.id, stripe)).toMatchObject({ blocked: true, reason: "stripe_unverifiable" });
  });

  it("erreur réseau : BLOQUÉ temporairement, message « réessaie », compte intact", async () => {
    const u = await makeUser(refs);
    const stripe = fakeStripe({ subs: { sub_1: new StripeError("Impossible de contacter Stripe.", 502, "network") } });
    const res = await requestAccountDeletion(u.id, PASSWORD, stripe);
    expect(res).toMatchObject({ ok: false, reason: "stripe_unavailable" });
    if (!res.ok) expect(res.error).toMatch(/réessaie/i);
    expect(await exists(u.id)).toBe(true);
  });

  it("Stripe en panne (500) ou limitation (429) : BLOQUÉ temporairement", async () => {
    for (const status of [500, 503, 429]) {
      const u = await makeUser(refs);
      const stripe = fakeStripe({ subs: { sub_1: new StripeError("boom", status, "api_error") } });
      expect(await canDeleteAccount(u.id, stripe)).toMatchObject({ blocked: true, reason: "stripe_unavailable" });
    }
  });

  it("erreur inattendue (non Stripe) pendant la liste : BLOQUÉ", async () => {
    const u = await makeUser({ stripeCustomerId: "cus_1" });
    const stripe = fakeStripe({
      customers: { cus_1: { id: "cus_1" } },
      lists: { cus_1: new TypeError("réponse illisible") },
    });
    expect(await canDeleteAccount(u.id, stripe)).toMatchObject({ blocked: true, reason: "stripe_unavailable" });
  });

  it("références Stripe présentes mais Stripe non configuré sur le serveur : BLOQUÉ", async () => {
    const u = await makeUser(refs);
    const stripe = fakeStripe({ configured: false });
    expect(await canDeleteAccount(u.id, stripe)).toMatchObject({ blocked: true, reason: "stripe_unavailable" });
    expect(stripe.calls).toEqual([]);
  });
});

describe("suppression — ne fait QUE lire chez Stripe", () => {
  const ORIGINAL_KEY = process.env.STRIPE_SECRET_KEY;
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
    if (ORIGINAL_KEY === undefined) delete process.env.STRIPE_SECRET_KEY;
    else process.env.STRIPE_SECRET_KEY = ORIGINAL_KEY;
  });

  it("la vraie passerelle n'envoie que des requêtes GET, jamais d'annulation", async () => {
    const u = await makeUser({ stripeSubscriptionId: "sub_1", stripeCustomerId: "cus_1" });
    process.env.STRIPE_SECRET_KEY = "sk_test_fictive_pour_le_test";
    vi.resetModules();
    const requests: { method: string; url: string }[] = [];
    vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
      requests.push({ method: init?.method ?? "GET", url: String(url) });
      const path = new URL(String(url)).pathname;
      const body =
        path === "/v1/subscriptions/sub_1"
          ? stripeSub({ status: "canceled", metadata: { userId: u.id } })
          : path === "/v1/customers/cus_1"
            ? { id: "cus_1", metadata: { userId: u.id } }
            : { data: [stripeSub({ status: "canceled" })], has_more: false };
      return new Response(JSON.stringify(body), { status: 200 });
    });
    const { canDeleteAccount: fresh } = await import("@/lib/account");
    expect(await fresh(u.id)).toEqual({ blocked: false, checkedWithStripe: true });

    expect(requests.length).toBe(3);
    for (const r of requests) {
      expect(r.method).toBe("GET");
      expect(r.url).toMatch(/^https:\/\/api\.stripe\.com\/v1\//);
    }
    expect(requests.map((r) => new URL(r.url).pathname).sort()).toEqual([
      "/v1/customers/cus_1",
      "/v1/subscriptions",
      "/v1/subscriptions/sub_1",
    ]);
  });

  it("la passerelle simulée n'expose aucune méthode d'écriture", () => {
    const gateway = fakeStripe({});
    const methods = Object.keys(gateway).filter((k) => typeof (gateway as Record<string, unknown>)[k] === "function");
    expect(methods.sort()).toEqual(
      ["configured", "listCustomerSubscriptions", "retrieveCustomer", "retrieveSubscription"].sort(),
    );
  });
});

// --- Codes e-mail -------------------------------------------------------------

describe("suppression — codes e-mail de l'adresse supprimée", () => {
  it("supprime les codes de l'adresse EXACTE, garde ceux des autres adresses", async () => {
    const u = await makeUser();
    const other = await makeUser();
    const expiresAt = new Date(Date.now() + 600_000);
    for (const purpose of ["login", "verify", "reset"]) {
      await prisma.emailCode.create({ data: { email: u.email, codeHash: "x", purpose, expiresAt } });
      await prisma.emailCode.create({ data: { email: other.email, codeHash: "x", purpose, expiresAt } });
    }
    // Adresse proche (préfixe identique) : ne doit pas être touchée.
    await prisma.emailCode.create({ data: { email: `${u.email}.autre`, codeHash: "x", purpose: "login", expiresAt } });

    expect(await requestAccountDeletion(u.id, PASSWORD)).toEqual({ ok: true, deletedUserId: u.id });
    expect(await prisma.emailCode.count({ where: { email: u.email } })).toBe(0);
    expect(await prisma.emailCode.count({ where: { email: other.email } })).toBe(3);
    expect(await prisma.emailCode.count({ where: { email: `${u.email}.autre` } })).toBe(1);
    await prisma.emailCode.deleteMany({ where: { email: { in: [other.email, `${u.email}.autre`] } } });
    await prisma.user.delete({ where: { id: other.id } });
  });

  it("refus (mauvais mot de passe) : aucun code supprimé", async () => {
    const u = await makeUser();
    await prisma.emailCode.create({
      data: { email: u.email, codeHash: "x", purpose: "login", expiresAt: new Date(Date.now() + 600_000) },
    });
    const res = await requestAccountDeletion(u.id, "mauvais");
    expect(res.ok).toBe(false);
    expect(await prisma.emailCode.count({ where: { email: u.email } })).toBe(1);
    await prisma.emailCode.deleteMany({ where: { email: u.email } });
    await prisma.user.delete({ where: { id: u.id } });
  });
});

// --- Autres appareils : quels comptes n'existent plus ? ----------------------

describe("findGoneUserIds", () => {
  it("ne déclare disparus que les comptes réellement absents", async () => {
    const alive = await makeUser();
    const gone = await makeUser();
    await prisma.user.delete({ where: { id: gone.id } });
    expect(await findGoneUserIds([alive.id, gone.id, "jamais_existe_123"])).toEqual([
      gone.id,
      "jamais_existe_123",
    ]);
    expect(await findGoneUserIds([])).toEqual([]);
    await prisma.user.delete({ where: { id: alive.id } });
  });
});
