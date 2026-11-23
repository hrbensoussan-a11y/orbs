// Codes à usage unique envoyés par e-mail (vérification d'inscription,
// connexion sans mot de passe, réinitialisation du mot de passe).
//
// Règles de sécurité appliquées ici :
//   - le code est à 6 chiffres, tiré d'une source *cryptographique* ;
//   - il n'est JAMAIS stocké en clair : on garde seulement son hachage bcrypt
//     (comme un mot de passe), si bien qu'une fuite de base ne révèle rien ;
//   - un seul code est actif à la fois par (e-mail, usage) : en créer un
//     nouveau invalide les précédents ;
//   - expiration courte (10 min), nombre de saisies erronées limité (5),
//     cooldown entre deux envois (45 s) et quota horaire (5) pour éviter
//     le spam / le brute-force.
//
// Ce module ne connaît ni les utilisateurs ni l'envoi d'e-mails : il gère
// uniquement le cycle de vie du code en base. L'orchestration (vérifier qu'un
// compte existe, envoyer l'e-mail) est faite par les server actions.

import { randomInt } from "node:crypto";
import bcrypt from "bcryptjs";
import { prisma } from "./prisma";

export type CodePurpose = "verify" | "login" | "reset";

export const CODE_POLICY = {
  length: 6,
  ttlMs: 10 * 60 * 1000, // durée de validité d'un code : 10 minutes
  maxAttempts: 5, // saisies erronées avant invalidation
  resendCooldownMs: 45 * 1000, // délai minimal entre deux envois
  maxPerHour: 5, // nombre max d'envois par heure (par e-mail + usage)
  bcryptRounds: 10,
} as const;

/** Tire un code à `length` chiffres, uniformément, via une source crypto. */
export function generateCode(length = CODE_POLICY.length): string {
  const max = 10 ** length;
  return String(randomInt(0, max)).padStart(length, "0");
}

export type CreateCodeResult =
  | { ok: true; code: string }
  | { ok: false; reason: "cooldown" | "quota"; retryAfter: number };

/**
 * Crée un nouveau code pour (email, purpose) et renvoie sa valeur en clair
 * (à envoyer par e-mail — jamais persistée). Applique cooldown + quota et
 * invalide les codes précédents du même usage.
 */
export async function createEmailCode(params: {
  email: string;
  purpose: CodePurpose;
  payload?: string | null;
}): Promise<CreateCodeResult> {
  const email = params.email.trim().toLowerCase();
  const { purpose } = params;
  const now = Date.now();

  // Cooldown : un envoi récent bloque un nouvel envoi immédiat.
  const latest = await prisma.emailCode.findFirst({
    where: { email, purpose },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });
  if (latest) {
    const sinceLast = now - latest.createdAt.getTime();
    if (sinceLast < CODE_POLICY.resendCooldownMs) {
      return {
        ok: false,
        reason: "cooldown",
        retryAfter: Math.ceil((CODE_POLICY.resendCooldownMs - sinceLast) / 1000),
      };
    }
  }

  // Quota horaire glissant.
  const hourAgo = new Date(now - 60 * 60 * 1000);
  const sentLastHour = await prisma.emailCode.count({
    where: { email, purpose, createdAt: { gt: hourAgo } },
  });
  if (sentLastHour >= CODE_POLICY.maxPerHour) {
    return { ok: false, reason: "quota", retryAfter: 60 * 60 };
  }

  const code = generateCode();
  const codeHash = await bcrypt.hash(code, CODE_POLICY.bcryptRounds);

  // Un seul code actif à la fois : on invalide les précédents non consommés.
  await prisma.emailCode.updateMany({
    where: { email, purpose, consumedAt: null },
    data: { consumedAt: new Date() },
  });

  await prisma.emailCode.create({
    data: {
      email,
      purpose,
      codeHash,
      payload: params.payload ?? null,
      expiresAt: new Date(now + CODE_POLICY.ttlMs),
    },
  });

  return { ok: true, code };
}

export type VerifyCodeResult =
  | { ok: true; payload: string | null }
  | { ok: false; reason: "invalid" | "expired" | "too_many_attempts" };

/**
 * Vérifie un code saisi. En cas de succès, le code est consommé (usage unique)
 * et son `payload` éventuel est renvoyé. Les saisies erronées sont comptées et
 * le code est invalidé au-delà du seuil.
 */
export async function verifyEmailCode(params: {
  email: string;
  purpose: CodePurpose;
  code: string;
}): Promise<VerifyCodeResult> {
  const email = params.email.trim().toLowerCase();
  const { purpose } = params;
  const code = params.code.trim();

  const record = await prisma.emailCode.findFirst({
    where: { email, purpose, consumedAt: null },
    orderBy: { createdAt: "desc" },
  });

  // Aucun code actif : expiré, déjà utilisé, ou jamais demandé.
  if (!record) return { ok: false, reason: "invalid" };

  if (record.expiresAt.getTime() < Date.now()) {
    await prisma.emailCode.update({
      where: { id: record.id },
      data: { consumedAt: new Date() },
    });
    return { ok: false, reason: "expired" };
  }

  if (record.attempts >= CODE_POLICY.maxAttempts) {
    await prisma.emailCode.update({
      where: { id: record.id },
      data: { consumedAt: new Date() },
    });
    return { ok: false, reason: "too_many_attempts" };
  }

  const match = await bcrypt.compare(code, record.codeHash);
  if (!match) {
    const attempts = record.attempts + 1;
    const exhausted = attempts >= CODE_POLICY.maxAttempts;
    await prisma.emailCode.update({
      where: { id: record.id },
      data: {
        attempts,
        // Au dernier essai raté, on brûle le code pour de bon.
        ...(exhausted ? { consumedAt: new Date() } : {}),
      },
    });
    return {
      ok: false,
      reason: exhausted ? "too_many_attempts" : "invalid",
    };
  }

  // Succès : usage unique.
  await prisma.emailCode.update({
    where: { id: record.id },
    data: { consumedAt: new Date() },
  });
  return { ok: true, payload: record.payload };
}

/** Ménage optionnel : supprime les codes expirés/consommés anciens. */
export async function purgeStaleCodes(): Promise<number> {
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const { count } = await prisma.emailCode.deleteMany({
    where: {
      OR: [{ expiresAt: { lt: cutoff } }, { consumedAt: { lt: cutoff } }],
    },
  });
  return count;
}
