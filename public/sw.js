// Service worker Orbs — stratégie « réseau d'abord » (sûr avec l'auth) :
// on tente toujours le réseau, on met en cache les GET même origine,
// et hors-ligne on sert la dernière version en cache.
//
// Le cache contient des pages rendues pour le compte connecté : il ne doit
// jamais survivre à ce compte. Trois garde-fous :
//   1. la page prévient (message "orbs:session") dès que le compte actif
//      change — connexion, déconnexion, autre compte : le cache est vidé ;
//   2. si le serveur sert l'écran de connexion ou d'inscription, c'est qu'il
//      n'y a plus de session valide (il redirige sinon) : le cache est vidé,
//      même si le JavaScript de la page ne s'exécute pas ;
//   3. hors-ligne, on ne sert plus rien une fois la session arrivée à
//      échéance (date notée par la page).
// Une réponse demandée AVANT un vidage n'est jamais remise en cache après.
const CACHE = "orbs-v2";

// Entrée interne (jamais demandée par une page) : échéance de la session.
const SESSION_META = "/__orbs/session-meta";

// Pages servies uniquement quand personne n'est connecté (voir proxy.ts).
const AUTH_PAGES = ["/login", "/register"];

// Incrémenté à chaque vidage : une réponse partie avant n'est pas stockée.
let epoch = 0;

async function purge() {
  epoch++;
  await caches.delete(CACHE);
}

async function sessionExpired() {
  try {
    const cache = await caches.open(CACHE);
    const meta = await cache.match(SESSION_META);
    if (!meta) return false; // échéance inconnue : comportement habituel
    const data = await meta.json();
    return typeof data.exp === "number" && Date.now() >= data.exp;
  } catch {
    return false;
  }
}

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

// Message de la page (components/StorageScope) : compte actif et échéance.
self.addEventListener("message", (event) => {
  const data = event.data;
  if (!data || data.type !== "orbs:session") return;
  event.waitUntil(
    (async () => {
      try {
        if (data.purge) await purge();
        const cache = await caches.open(CACHE);
        if (data.userId && typeof data.exp === "number") {
          await cache.put(SESSION_META, new Response(JSON.stringify({ exp: data.exp })));
        } else {
          await cache.delete(SESSION_META);
        }
      } catch {
        /* cache indisponible : rien à protéger */
      }
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  let sameOrigin = false;
  let path = "";
  try {
    const url = new URL(req.url);
    sameOrigin = url.origin === self.location.origin;
    path = url.pathname;
  } catch {
    sameOrigin = false;
  }
  const startedAt = epoch;
  event.respondWith(
    fetch(req)
      .then((res) => {
        const basicOk = sameOrigin && res && res.status === 200 && res.type === "basic";
        if (basicOk && !res.redirected && AUTH_PAGES.includes(path)) {
          // Écran de connexion servi par le serveur : plus de session valide.
          event.waitUntil(purge().catch(() => {}));
          return res;
        }
        if (basicOk && startedAt === epoch) {
          const copy = res.clone();
          caches
            .open(CACHE)
            .then((c) => (startedAt === epoch ? c.put(req, copy) : undefined))
            .catch(() => {});
        }
        return res;
      })
      .catch(async () => {
        if (await sessionExpired()) {
          await purge().catch(() => {});
          return Response.error();
        }
        const cached = await caches.match(req);
        if (cached) return cached;
        if (req.mode === "navigate") {
          const shell = await caches.match("/accueil");
          if (shell) return shell;
        }
        return Response.error();
      }),
  );
});
