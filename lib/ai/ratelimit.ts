// Limitation de débit simple, par utilisateur connecté.
//
// V1 : en mémoire (RAM du serveur). C'est suffisant pour un lancement et
// ça évite un service externe. Limites :
//   - remis à zéro à chaque redémarrage/redéploiement du serveur ;
//   - non partagé si l'app tourne sur plusieurs instances.
// Pour la suite : remplacer cette implémentation par un stockage partagé
// (ex. Upstash Redis) SANS changer l'interface `checkRateLimit`.

import { AI_CONFIG } from "./config";

type Bucket = {
  minute: number[]; // timestamps (ms) des requêtes de la dernière minute
  dayCount: number;
  dayResetAt: number; // ms
};

const buckets = new Map<string, Bucket>();

export type RateResult =
  | { ok: true }
  | { ok: false; retryAfter: number; scope: "minute" | "day" };

export function checkRateLimit(userId: string): RateResult {
  const now = Date.now();
  let b = buckets.get(userId);
  if (!b) {
    b = { minute: [], dayCount: 0, dayResetAt: now + 24 * 60 * 60 * 1000 };
    buckets.set(userId, b);
  }

  // Fenêtre jour (réinitialisation fixe toutes les 24 h).
  if (now >= b.dayResetAt) {
    b.dayCount = 0;
    b.dayResetAt = now + 24 * 60 * 60 * 1000;
  }
  if (b.dayCount >= AI_CONFIG.rateMaxPerDay) {
    return {
      ok: false,
      scope: "day",
      retryAfter: Math.max(1, Math.ceil((b.dayResetAt - now) / 1000)),
    };
  }

  // Fenêtre minute glissante.
  const cutoff = now - 60 * 1000;
  b.minute = b.minute.filter((t) => t > cutoff);
  if (b.minute.length >= AI_CONFIG.rateMaxPerMin) {
    const oldest = b.minute[0];
    return {
      ok: false,
      scope: "minute",
      retryAfter: Math.max(1, Math.ceil((oldest + 60 * 1000 - now) / 1000)),
    };
  }

  // OK : on comptabilise la requête.
  b.minute.push(now);
  b.dayCount += 1;
  return { ok: true };
}
