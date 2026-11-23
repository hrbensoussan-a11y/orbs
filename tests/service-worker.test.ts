import { describe, it, expect, beforeEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

// Service worker (public/sw.js) : son cache contient des pages rendues pour
// le compte connecté — avec ses données serveur. On charge le VRAI fichier
// dans un faux environnement (cache en mémoire, réseau simulé) pour vérifier
// que ce cache ne survit jamais au compte : déconnexion, changement de compte,
// écran de connexion, session expirée.

const ORIGIN = "https://orbs.test";
const SOURCE = fs.readFileSync(path.resolve(__dirname, "../public/sw.js"), "utf8");
const A = "cmuseraaaa0001";

type FakeResponse = {
  status: number;
  type: string;
  redirected: boolean;
  body: string;
  clone(): FakeResponse;
  json(): Promise<unknown>;
};

function response(body: string, extra: Partial<FakeResponse> = {}): FakeResponse {
  const res: FakeResponse = {
    status: 200,
    type: "basic",
    redirected: false,
    body,
    clone: () => response(body, extra),
    json: async () => JSON.parse(body),
    ...extra,
  };
  return res;
}

type Req = { url: string; method: string; mode: string };
const get = (pathname: string, mode = "cors"): Req => ({ url: ORIGIN + pathname, method: "GET", mode });

function loadServiceWorker() {
  const listeners: Record<string, (event: never) => void> = {};
  const stores = new Map<string, Map<string, FakeResponse>>();
  const keyOf = (r: Req | string) => (typeof r === "string" ? (r.startsWith("/") ? ORIGIN + r : r) : r.url);
  const clock = { now: Date.parse("2026-11-12T10:00:00Z") };

  const cacheApi = (name: string) => {
    if (!stores.has(name)) stores.set(name, new Map());
    const store = stores.get(name) as Map<string, FakeResponse>;
    return {
      put: async (r: Req | string, res: FakeResponse) => void store.set(keyOf(r), res),
      match: async (r: Req | string) => store.get(keyOf(r))?.clone(),
      delete: async (r: Req | string) => store.delete(keyOf(r)),
    };
  };
  const caches = {
    open: async (name: string) => cacheApi(name),
    keys: async () => [...stores.keys()],
    delete: async (name: string) => stores.delete(name),
    match: async (r: Req | string) => {
      for (const store of stores.values()) {
        const hit = store.get(keyOf(r));
        if (hit) return hit.clone();
      }
      return undefined;
    },
  };

  // Réseau simulé : `network.online = false` fait échouer toutes les requêtes.
  const network = {
    online: true,
    handler: (req: Req): FakeResponse | Promise<FakeResponse> => response(`page ${req.url}`),
  };
  const ERROR = { error: true };

  class SwResponse {
    constructor(public body: string) {}
    clone() {
      return new SwResponse(this.body);
    }
    async json() {
      return JSON.parse(this.body);
    }
    static error() {
      return ERROR;
    }
  }

  vm.runInNewContext(SOURCE, {
    self: {
      addEventListener: (type: string, fn: (event: never) => void) => void (listeners[type] = fn),
      skipWaiting: () => {},
      clients: { claim: async () => {} },
      location: { origin: ORIGIN },
    },
    caches,
    fetch: async (req: Req) => {
      if (!network.online) throw new TypeError("Failed to fetch");
      return network.handler(req);
    },
    Response: SwResponse,
    URL,
    JSON,
    Promise,
    Date: { now: () => clock.now },
  });

  const settle = () => new Promise((r) => setTimeout(r, 0));

  async function request(req: Req): Promise<FakeResponse | typeof ERROR | undefined> {
    let answer: Promise<FakeResponse | typeof ERROR> | undefined;
    const waits: Promise<unknown>[] = [];
    (listeners.fetch as (e: unknown) => void)({
      request: req,
      respondWith: (p: Promise<FakeResponse>) => void (answer = p),
      waitUntil: (p: Promise<unknown>) => void waits.push(p),
    });
    const res = answer ? await answer : undefined;
    await Promise.all(waits);
    await settle(); // la mise en cache se fait sans bloquer la réponse
    return res;
  }

  async function message(data: unknown): Promise<void> {
    const waits: Promise<unknown>[] = [];
    (listeners.message as (e: unknown) => void)({ data, waitUntil: (p: Promise<unknown>) => void waits.push(p) });
    await Promise.all(waits);
  }

  /** Requête dont on contrôle l'arrivée de la réponse (pour les courses). */
  function slowRequest(req: Req) {
    let release: (res: FakeResponse) => void = () => {};
    const previous = network.handler;
    network.handler = (r) =>
      r.url === req.url ? new Promise<FakeResponse>((resolve) => (release = resolve)) : previous(r);
    const done = request(req);
    return { done, release: (res: FakeResponse) => release(res) };
  }

  const cachedUrls = () => [...(stores.get("orbs-v2")?.keys() ?? [])].filter((u) => !u.includes("/__orbs/"));

  return { request, message, slowRequest, network, clock, cachedUrls, stores, ERROR };
}

let sw: ReturnType<typeof loadServiceWorker>;

beforeEach(() => {
  sw = loadServiceWorker();
});

describe("Service worker : le cache hors ligne ne survit pas au compte", () => {
  it("met en cache les pages du compte connecté et les sert hors ligne (comportement conservé)", async () => {
    await sw.request(get("/accueil", "navigate"));
    await sw.request(get("/agenda"));
    expect(sw.cachedUrls().sort()).toEqual([ORIGIN + "/accueil", ORIGIN + "/agenda"]);

    sw.network.online = false;
    const offline = (await sw.request(get("/agenda"))) as FakeResponse;
    expect(offline.body).toBe(`page ${ORIGIN}/agenda`);
    // Page jamais visitée : on retombe sur l'accueil en cache.
    const shell = (await sw.request(get("/notes", "navigate"))) as FakeResponse;
    expect(shell.body).toBe(`page ${ORIGIN}/accueil`);
  });

  it("2. déconnexion ou changement de compte signalé par la page : le cache est vidé", async () => {
    await sw.request(get("/accueil", "navigate"));
    await sw.request(get("/timeline"));

    await sw.message({ type: "orbs:session", userId: null, exp: null, purge: true });

    expect(sw.cachedUrls()).toEqual([]);
    sw.network.online = false;
    expect(await sw.request(get("/accueil", "navigate"))).toBe(sw.ERROR);
    expect(await sw.request(get("/timeline"))).toBe(sw.ERROR);
  });

  it("2. l'écran de connexion servi par le serveur vide le cache, même sans JavaScript côté page", async () => {
    await sw.request(get("/accueil", "navigate"));
    expect(sw.cachedUrls()).toHaveLength(1);

    await sw.request(get("/login", "navigate"));

    expect(sw.cachedUrls()).toEqual([]);
    sw.network.online = false;
    expect(await sw.request(get("/accueil", "navigate"))).toBe(sw.ERROR);
  });

  it("idem pour l'écran d'inscription et pour une navigation sans rechargement (?_rsc=…)", async () => {
    await sw.request(get("/accueil", "navigate"));
    await sw.request(get("/register?_rsc=abc"));
    expect(sw.cachedUrls()).toEqual([]);
  });

  it("un compte connecté redirigé depuis /login garde son cache (le serveur a redirigé : session valide)", async () => {
    await sw.request(get("/accueil", "navigate"));
    sw.network.handler = (req) => response(`page ${req.url}`, { redirected: true });
    await sw.request(get("/login"));
    expect(sw.cachedUrls()).toContain(ORIGIN + "/accueil");
  });

  it("4. une réponse demandée avant le changement de compte n'est jamais remise en cache après", async () => {
    await sw.request(get("/accueil", "navigate"));
    // Une page de A est encore en route quand A se déconnecte.
    const pending = sw.slowRequest(get("/timeline"));
    await sw.message({ type: "orbs:session", userId: null, exp: null, purge: true });
    pending.release(response("journal de A"));
    await pending.done;

    expect(sw.cachedUrls()).toEqual([]);
    sw.network.online = false;
    expect(await sw.request(get("/timeline"))).toBe(sw.ERROR);
  });

  it("5. session expirée : hors ligne, plus rien n'est servi et le cache est vidé", async () => {
    const exp = sw.clock.now + 60_000;
    await sw.message({ type: "orbs:session", userId: A, exp, purge: true });
    await sw.request(get("/accueil", "navigate"));
    await sw.request(get("/timeline"));
    sw.network.online = false;

    // Avant l'échéance : le hors-ligne fonctionne.
    expect(((await sw.request(get("/timeline"))) as FakeResponse).body).toContain("/timeline");

    // Après l'échéance : refus, et vidage.
    sw.clock.now = exp + 1;
    expect(await sw.request(get("/timeline"))).toBe(sw.ERROR);
    expect(await sw.request(get("/accueil", "navigate"))).toBe(sw.ERROR);
    expect(sw.cachedUrls()).toEqual([]);
  });

  it("l'échéance notée disparaît à la déconnexion et n'est jamais servie comme une page", async () => {
    await sw.message({ type: "orbs:session", userId: A, exp: sw.clock.now + 60_000, purge: false });
    expect(sw.stores.get("orbs-v2")?.has(ORIGIN + "/__orbs/session-meta")).toBe(true);
    await sw.message({ type: "orbs:session", userId: null, exp: null, purge: false });
    expect(sw.stores.get("orbs-v2")?.has(ORIGIN + "/__orbs/session-meta")).toBe(false);
  });

  it("ignore les messages inconnus et ne met pas en cache ce qui n'est pas une page d'Orbs", async () => {
    await sw.request(get("/accueil", "navigate"));
    await sw.message({ type: "autre-chose", purge: true });
    await sw.message(null);
    expect(sw.cachedUrls()).toHaveLength(1);

    sw.network.handler = () => response("erreur", { status: 500 });
    await sw.request(get("/agenda"));
    await sw.request({ url: "https://ailleurs.test/x", method: "GET", mode: "cors" });
    expect(sw.cachedUrls()).toEqual([ORIGIN + "/accueil"]);
  });
});
