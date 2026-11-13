// Accès professionnel par code — SERVEUR UNIQUEMENT.
//
// Cinq codes permanents à 8 chiffres donnent accès à cinq comptes de
// démonstration « professionnels » (tests, présentations à de grands clients),
// SANS adresse e-mail réelle ni mot de passe à retenir :
//   - le code n'est JAMAIS stocké en clair ici : seulement son empreinte
//     SHA-256 (le code est distribué hors bande par le responsable du projet) ;
//   - chaque code correspond à un compte fixe (« slot »), créé paresseusement
//     à la première utilisation, avec une adresse interne non routable
//     (domaine réservé `.invalid`) et un mot de passe aléatoire inutilisable ;
//   - le compte bénéficie d'un abonnement Orbs Ultimate actif, entretenu à
//     chaque connexion par le même chemin que le mode dev
//     (applySubscriptionState) — aucun paiement, aucun appel Stripe ;
//   - anti-force-brute : petites limites de tentatives par IP, en mémoire.
//
// Ces comptes sont des comptes « élève » ordinaires pour tout le reste
// (journal, agenda, apprentissage, IA…).

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import bcrypt from "bcryptjs";
import { prisma } from "./prisma";
import { applySubscriptionState, getBillingState } from "./billing/store";

// ---------------------------------------------------------------------------
// Les codes (empreintes SHA-256) et leur compte associé.
// Pour changer un code : remplacer son empreinte (sha256 du nouveau code).
// ---------------------------------------------------------------------------
export type ProCodeEntry = { slot: number; sha256: string };

export const PRO_CODES: readonly ProCodeEntry[] = [
  { slot: 1, sha256: "2312bf683d9ab3f448d0ef947d63abb28a2b83502240b0c731b2c92c69d9e959" },
  { slot: 2, sha256: "760634410da65f4d79b94b0177f24826aedf1b29dc95ea9fda46a12102edaf71" },
  { slot: 3, sha256: "e2acfbd71cfa94db760a49ec4bd7e3a48d0fdf0368f9723ed17c59f52f5f4355" },
  { slot: 4, sha256: "264f002c3708b053daa2eaffbecba43f6dbb2649d1898b4a2030506405d3dcea" },
  { slot: 5, sha256: "c1c25bf3be8710469ef00df682345fbc8a386383efa4299f65a37ce6d7bbf5e5" },
] as const;

/** Adresse interne du compte d'un slot (domaine `.invalid` : jamais routable). */
export function proEmailForSlot(slot: number): string {
  return `pro-${slot}@comptes.orbs.invalid`;
}

/**
 * Retrouve le slot correspondant à un code saisi, ou null.
 * Comparaison en temps constant sur l'empreinte (pas de court-circuit).
 */
export function slotForCode(code: string): number | null {
  const normalized = code.trim();
  if (!/^\d{8}$/.test(normalized)) return null;
  const digest = createHash("sha256").update(normalized).digest();
  let found: number | null = null;
  for (const entry of PRO_CODES) {
    const expected = Buffer.from(entry.sha256, "hex");
    if (expected.length === digest.length && timingSafeEqual(digest, expected)) {
      found = entry.slot;
    }
  }
  return found;
}

// ---------------------------------------------------------------------------
// Anti-force-brute : limite de tentatives par IP (fenêtre glissante, mémoire).
// Volumétrie minuscule (5 codes) : une Map suffit, pas besoin de table.
// ---------------------------------------------------------------------------
const ATTEMPT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const MAX_ATTEMPTS_PER_WINDOW = 20;

const attemptsByIp = new Map<string, number[]>();

/** Enregistre une tentative et dit si l'IP a dépassé la limite. */
export function proAttemptAllowed(ip: string): boolean {
  const now = Date.now();
  const key = ip || "unknown";
  const prev = (attemptsByIp.get(key) ?? []).filter(
    (t) => now - t < ATTEMPT_WINDOW_MS,
  );
  // Ménage opportuniste pour éviter une croissance sans borne.
  if (attemptsByIp.size > 1000) {
    for (const [k, list] of attemptsByIp) {
      if (list.every((t) => now - t >= ATTEMPT_WINDOW_MS)) attemptsByIp.delete(k);
    }
  }
  prev.push(now);
  attemptsByIp.set(key, prev);
  return prev.length <= MAX_ATTEMPTS_PER_WINDOW;
}

// ---------------------------------------------------------------------------
// Provisionnement du compte d'un slot + entretien de l'abonnement Ultimate.
// ---------------------------------------------------------------------------
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Renvoie l'utilisateur du slot, en le créant à la première utilisation.
 * Mot de passe aléatoire (connexion uniquement par code professionnel).
 */
export async function getOrCreateProUser(slot: number) {
  const email = proEmailForSlot(slot);
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return existing;

  const passwordHash = await bcrypt.hash(randomBytes(32).toString("hex"), 10);
  try {
    return await prisma.user.create({
      data: {
        email,
        name: `Compte professionnel ${slot}`,
        passwordHash,
        role: "student",
        emailVerified: new Date(),
        settings: { create: {} },
      },
    });
  } catch (e) {
    // Course de création (deux connexions simultanées sur le même code) :
    // la contrainte unique sur l'e-mail n'en laisse passer qu'une.
    const again = await prisma.user.findUnique({ where: { email } });
    if (again) return again;
    throw e;
  }
}

/**
 * Garantit un abonnement Orbs Ultimate ACTIF sur le compte (sans Stripe) :
 * (ré)activé à la connexion si absent, expiré ou d'une offre inférieure.
 * Passe par applySubscriptionState (idempotent, même chemin que le mode dev),
 * qui gère aussi l'allocation de crédits du cycle.
 */
export async function ensureUltimateAccess(userId: string): Promise<void> {
  const state = await getBillingState(userId);
  if (state.hasPaidAccess && state.plan === "ultimate") return;
  const now = new Date();
  await applySubscriptionState(userId, {
    plan: "ultimate",
    status: "active",
    currentPeriodStart: now,
    currentPeriodEnd: new Date(now.getTime() + 30 * DAY_MS),
    cancelAtPeriodEnd: false,
    canceledAt: null,
    stripeCustomerId: null,
    stripeSubscriptionId: null,
    stripePriceId: null,
  });
}
