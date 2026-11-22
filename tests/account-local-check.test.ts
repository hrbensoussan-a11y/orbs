// /api/account/local-check : protections du serveur (authentification,
// limitation de débit par compte, taille du corps, validation, absence de
// fuite) et, côté appareil, garantie qu'aucune réponse d'échec — 429 compris
// — ne provoque de faux nettoyage. Base SQLite jetable (voir tests/setup).

import { describe, it, expect, beforeEach, afterEach, afterAll, vi } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { installBrowser, type FakeBrowser } from "./helpers/browser";
import { setActiveUser, userKey } from "@/lib/userStorage";
import { LOCAL_CHECK_LIMITS, LOCAL_CHECK_MAX_BODY_BYTES } from "@/lib/accountConstants";
import { sweepOtherDeviceAccounts, type SweepResponse } from "@/lib/localAccountData";

// Session simulée : la route lit l'utilisateur via getCurrentUser().
const session = vi.hoisted(() => ({ user: null as null | { id: string }, dbDown: false }));
vi.mock("@/lib/auth", () => ({ getCurrentUser: async () => session.user }));
// Panne de base simulée à la demande ; sinon, la vraie fonction (vraie base).
vi.mock("@/lib/account", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/account")>();
  return {
    ...actual,
    findGoneUserIds: async (ids: string[]) => {
      if (session.dbDown) throw new Error("base indisponible");
      return actual.findGoneUserIds(ids);
    },
  };
});

import { POST } from "@/app/api/account/local-check/route";

const URL = "http://localhost/api/account/local-check";
const created: string[] = [];

async function makeUser(): Promise<string> {
  const id = `test_lc_${crypto.randomUUID().replace(/-/g, "")}`.slice(0, 40);
  await prisma.user.create({ data: { id, email: `${id}@test.local`, passwordHash: "x" } });
  created.push(id);
  return id;
}

/** Nouvel appelant : compteur de débit vierge (identifiant jamais vu). */
function callerId(): string {
  return `caller_${crypto.randomUUID().replace(/-/g, "")}`;
}

function request(body: unknown, init?: { raw?: string; headers?: Record<string, string> }): NextRequest {
  const text = init?.raw ?? JSON.stringify(body);
  return new NextRequest(URL, {
    method: "POST",
    body: text,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
  });
}

async function call(body: unknown, init?: { raw?: string; headers?: Record<string, string> }) {
  const res = await POST(request(body, init));
  return { status: res.status, headers: res.headers, json: (await res.json()) as Record<string, unknown> };
}

let browser: FakeBrowser;

beforeEach(() => {
  session.user = null;
  session.dbDown = false;
  browser = installBrowser();
  setActiveUser(null);
});

afterEach(() => {
  vi.useRealTimers();
});

afterAll(async () => {
  for (const id of created) await prisma.user.delete({ where: { id } }).catch(() => {});
  await prisma.$disconnect();
});

// ---------------------------------------------------------------------------
describe("serveur : accès et validation", () => {
  it("refuse un visiteur non connecté (401), avant même de lire le corps", async () => {
    const huge = "x".repeat(LOCAL_CHECK_MAX_BODY_BYTES * 10);
    const r = await call(null, { raw: huge });
    expect(r.status).toBe(401);
    expect(r.json).toEqual({ error: "unauthorized" });
  });

  it("répond uniquement pour les identifiants DEMANDÉS, jamais pour l'appelant, sans mise en cache", async () => {
    const alive = await makeUser();
    const me = callerId();
    session.user = { id: me };
    const goneId = "cmdeleted0000000000000001";

    const r = await call({ ids: [alive, goneId, me] });
    expect(r.status).toBe(200);
    expect(r.json).toEqual({ gone: [goneId] }); // ni le compte existant, ni l'appelant
    expect(r.headers.get("cache-control")).toBe("no-store");
  });

  it("ignore les identifiants mal formés ou non textuels et dédoublonne", async () => {
    session.user = { id: callerId() };
    const ok = "cmdeleted0000000000000002";
    const r = await call({ ids: [ok, ok, "../../etc", "a b", "", "x".repeat(65), 42, null, { id: ok }] });
    expect(r.status).toBe(200);
    expect(r.json).toEqual({ gone: [ok] });
  });

  it("refuse plus de 20 identifiants, un corps sans liste, ou illisible (400)", async () => {
    session.user = { id: callerId() };
    const many = Array.from({ length: 21 }, (_, i) => `cmid${String(i).padStart(10, "0")}`);
    expect((await call({ ids: many })).status).toBe(400);
    expect((await call({ ids: "abc" })).status).toBe(400);
    expect((await call({})).status).toBe(400);
    expect((await call(null, { raw: "{pas du json" })).status).toBe(400);
  });

  it("refuse un corps trop volumineux (413), annoncé ou envoyé par morceaux", async () => {
    session.user = { id: callerId() };
    const big = JSON.stringify({ ids: [], pad: "x".repeat(LOCAL_CHECK_MAX_BODY_BYTES) });
    expect((await call(null, { raw: big })).status).toBe(413);

    // Sans longueur annoncée : le flux est coupé dès que la limite est dépassée.
    session.user = { id: callerId() };
    const chunk = new TextEncoder().encode("x".repeat(1024));
    let sent = 0;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (sent >= 64) return controller.close();
        sent++;
        controller.enqueue(chunk);
      },
    });
    const req = new NextRequest(URL, {
      method: "POST",
      body: stream,
      headers: { "content-type": "application/json" },
      duplex: "half", // requis par undici pour un corps envoyé en flux
    });
    expect(req.headers.get("content-length")).toBeNull();
    const res = await POST(req);
    expect(res.status).toBe(413);
    expect(sent).toBeLessThan(64); // lecture interrompue, pas tout le flux
  });

  it("base de données indisponible : 503, jamais « disparu » par défaut", async () => {
    session.user = { id: callerId() };
    session.dbDown = true;
    const r = await call({ ids: ["cmdeleted0000000000000003"] });
    session.dbDown = false;
    expect(r.status).toBe(503);
    expect(r.json).not.toHaveProperty("gone");
  });
});

// ---------------------------------------------------------------------------
describe("serveur : limitation de débit par compte", () => {
  it(`au-delà de ${LOCAL_CHECK_LIMITS.perMin} demandes par minute : 429 avec Retry-After`, async () => {
    session.user = { id: callerId() };
    for (let i = 0; i < LOCAL_CHECK_LIMITS.perMin; i++) {
      expect((await call({ ids: [] })).status).toBe(200);
    }
    const r = await call({ ids: ["cmdeleted0000000000000004"] });
    expect(r.status).toBe(429);
    expect(r.json).toEqual({ error: "rate_limited" });
    expect(Number(r.headers.get("retry-after"))).toBeGreaterThan(0);
    expect(r.headers.get("cache-control")).toBe("no-store");
  });

  it("la limite est PAR COMPTE : un autre compte n'est pas bloqué", async () => {
    session.user = { id: callerId() };
    for (let i = 0; i <= LOCAL_CHECK_LIMITS.perMin; i++) await call({ ids: [] });
    expect((await call({ ids: [] })).status).toBe(429);

    session.user = { id: callerId() };
    expect((await call({ ids: [] })).status).toBe(200);
  });

  it(`plafond quotidien : au-delà de ${LOCAL_CHECK_LIMITS.perDay} demandes par jour, 429 même en espaçant`, async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const start = Date.UTC(2026, 10, 22, 8, 0, 0);
    vi.setSystemTime(start);
    session.user = { id: callerId() };
    let accepted = 0;
    for (let i = 0; i < LOCAL_CHECK_LIMITS.perDay + 5; i++) {
      vi.setSystemTime(start + i * 61_000); // jamais plus d'une par minute
      if ((await call({ ids: [] })).status === 200) accepted++;
    }
    expect(accepted).toBe(LOCAL_CHECK_LIMITS.perDay);
    // Le lendemain, l'usage normal reprend.
    vi.setSystemTime(start + 25 * 60 * 60 * 1000);
    expect((await call({ ids: [] })).status).toBe(200);
  });

  it("les limites laissent une large marge à l'usage réel (≤ 1 vérification / 12 h / appareil)", () => {
    expect(LOCAL_CHECK_LIMITS.perMin).toBeGreaterThanOrEqual(3); // plusieurs onglets ouverts ensemble
    expect(LOCAL_CHECK_LIMITS.perDay).toBeGreaterThanOrEqual(20); // plusieurs appareils
    // Sondage massif impossible : au plus perDay × 20 identifiants par jour et par compte.
    expect(LOCAL_CHECK_LIMITS.perDay * 20).toBeLessThanOrEqual(1000);
  });
});

// ---------------------------------------------------------------------------
describe("appareil : jamais de faux nettoyage", () => {
  const ME = "cmuserme000000000001";
  const OTHER = "cmuserother000000002";
  const GONE = "cmusergone0000000003";

  function seedDevice(): void {
    for (const id of [ME, OTHER, GONE]) {
      browser.localStorage.setItem(userKey(id, "orbs.agenda.v1"), JSON.stringify({ owner: id }));
    }
  }
  const respond = (status: number, body: unknown): SweepResponse => ({
    ok: status >= 200 && status < 300,
    json: async () => body,
  });

  it("429, 401, 413, 503, réponse illisible ou réseau coupé : RIEN n'est effacé, la vérification sera retentée", async () => {
    seedDevice();
    const before = browser.localStorage.snapshot();
    const failures: (() => Promise<SweepResponse>)[] = [
      async () => respond(429, { error: "rate_limited", gone: [GONE, OTHER] }),
      async () => respond(401, { gone: [GONE] }),
      async () => respond(413, { gone: [GONE] }),
      async () => respond(503, { error: "unavailable" }),
      async () => respond(200, { gone: "tous" }),
      async () => respond(200, null),
      async () => ({ ok: true, json: async () => { throw new SyntaxError("json"); } }),
      async () => { throw new TypeError("Failed to fetch"); },
    ];
    for (const failure of failures) {
      const out = await sweepOtherDeviceAccounts(browser.localStorage, ME, failure);
      expect(out).toEqual({ status: "failed" });
      expect(browser.localStorage.snapshot()).toEqual(before); // ni effacement, ni date de vérification
    }
  });

  it("succès : seul le compte déclaré disparu ET demandé est effacé ; jamais le compte connecté", async () => {
    seedDevice();
    const out = await sweepOtherDeviceAccounts(browser.localStorage, ME, async (ids) => {
      expect(ids.sort()).toEqual([GONE, OTHER].sort()); // jamais le compte connecté
      return respond(200, { gone: [GONE, ME, "cmpasdemande00000009"] });
    });
    expect(out).toEqual({ status: "done", purged: [GONE] });
    expect(browser.localStorage.getItem(userKey(GONE, "orbs.agenda.v1"))).toBeNull();
    expect(browser.localStorage.getItem(userKey(ME, "orbs.agenda.v1"))).not.toBeNull();
    expect(browser.localStorage.getItem(userKey(OTHER, "orbs.agenda.v1"))).not.toBeNull();
    // Vérification faite : pas de nouvelle demande avant 12 h.
    const again = await sweepOtherDeviceAccounts(browser.localStorage, ME, async () => {
      throw new Error("ne doit pas être appelé");
    });
    expect(again).toEqual({ status: "skipped" });
  });

  it("de bout en bout avec la vraie route : la limitation de débit n'efface jamais rien", async () => {
    const alive = await makeUser();
    const me = callerId();
    session.user = { id: me };
    browser.localStorage.setItem(userKey(alive, "orbs.agenda.v1"), JSON.stringify({ owner: "vivant" }));
    browser.localStorage.setItem(userKey(GONE, "orbs.agenda.v1"), JSON.stringify({ owner: "disparu" }));

    // Épuise le débit de ce compte (autres onglets, autres appareils…).
    for (let i = 0; i < LOCAL_CHECK_LIMITS.perMin; i++) await call({ ids: [] });
    const before = browser.localStorage.snapshot();
    const viaRoute = (ids: string[]) => POST(request({ ids }));

    expect(await sweepOtherDeviceAccounts(browser.localStorage, me, viaRoute)).toEqual({ status: "failed" });
    expect(browser.localStorage.snapshot()).toEqual(before);

    // Une minute plus tard, la vérification aboutit : seul le compte disparu part.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.now() + 61_000);
    const out = await sweepOtherDeviceAccounts(browser.localStorage, me, viaRoute);
    expect(out).toEqual({ status: "done", purged: [GONE] });
    expect(browser.localStorage.getItem(userKey(alive, "orbs.agenda.v1"))).not.toBeNull();
    expect(browser.localStorage.getItem(userKey(GONE, "orbs.agenda.v1"))).toBeNull();
  });
});
