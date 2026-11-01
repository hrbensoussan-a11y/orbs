"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireParent, requireStudent } from "@/lib/auth";
import {
  CODE_TTL_MS,
  CHALLENGE_KINDS,
  STICKERS,
  isChallengeKind,
  isLinked,
  newFamilyCode,
  normalizeCode,
  rawValue,
  readSummary,
  validateSummary,
} from "@/lib/family";

// ================= Côté élève =================

/** Enregistre le résumé de progression Apprendre (appelé par le client). */
export async function syncLearnSummary(raw: unknown): Promise<void> {
  const user = await requireStudent();
  const summary = validateSummary(raw);
  if (!summary) return;
  await prisma.user.update({
    where: { id: user.id },
    data: { learnSnapshot: JSON.stringify(summary), learnSyncedAt: new Date() },
  });
}

/** Génère un nouveau code famille valable 24 h. */
export async function createFamilyCode(): Promise<void> {
  const user = await requireStudent();
  for (let i = 0; i < 5; i++) {
    try {
      await prisma.user.update({
        where: { id: user.id },
        data: { familyCode: newFamilyCode(), familyCodeExpires: new Date(Date.now() + CODE_TTL_MS) },
      });
      break;
    } catch {
      // collision (très improbable) : on retente
    }
  }
  revalidatePath("/compte");
}

export async function removeParent(formData: FormData): Promise<void> {
  const user = await requireStudent();
  const parentId = String(formData.get("parentId") ?? "");
  await prisma.familyLink.deleteMany({ where: { parentId, childId: user.id } });
  revalidatePath("/compte");
}

export async function setShareMood(formData: FormData): Promise<void> {
  const user = await requireStudent();
  await prisma.user.update({
    where: { id: user.id },
    data: { shareMood: formData.get("shareMood") === "on" },
  });
  revalidatePath("/compte");
}

/** L'élève a vu ses encouragements (bouton « Merci ! »). */
export async function markCheersSeen(): Promise<void> {
  const user = await requireStudent();
  await prisma.cheer.updateMany({
    where: { toId: user.id, seenAt: null },
    data: { seenAt: new Date() },
  });
  revalidatePath("/accueil");
}

// ================= Côté parent =================

export type LinkState = { error?: string } | undefined;

export async function linkChild(_prev: LinkState, formData: FormData): Promise<LinkState> {
  const parent = await requireParent();
  const code = normalizeCode(String(formData.get("code") ?? ""));
  if (code.length !== 6) return { error: "Le code fait 6 caractères." };

  const child = await prisma.user.findUnique({
    where: { familyCode: code },
    select: { id: true, role: true, familyCodeExpires: true },
  });
  if (
    !child ||
    child.role !== "student" ||
    !child.familyCodeExpires ||
    child.familyCodeExpires < new Date()
  ) {
    return { error: "Code inconnu ou expiré. Demande un nouveau code à ton enfant." };
  }

  await prisma.familyLink.upsert({
    where: { parentId_childId: { parentId: parent.id, childId: child.id } },
    create: { parentId: parent.id, childId: child.id },
    update: {},
  });
  // Code à usage unique.
  await prisma.user.update({
    where: { id: child.id },
    data: { familyCode: null, familyCodeExpires: null },
  });
  revalidatePath("/parent");
  return undefined;
}

export type CheerState = { ok?: boolean; error?: string } | undefined;

export async function sendCheer(_prev: CheerState, formData: FormData): Promise<CheerState> {
  const parent = await requireParent();
  const childId = String(formData.get("childId") ?? "");
  const sticker = String(formData.get("sticker") ?? "");
  const message = String(formData.get("message") ?? "").trim().slice(0, 140);

  if (!(await isLinked(parent.id, childId))) return { error: "Accès refusé." };
  if (!STICKERS.some((s) => s.emoji === sticker)) return { error: "Choisis un sticker." };

  await prisma.cheer.create({
    data: { fromId: parent.id, toId: childId, sticker, message: message || null },
  });
  revalidatePath(`/parent/${childId}`);
  return { ok: true };
}

export type ChallengeState = { ok?: boolean; error?: string } | undefined;

export async function createChallenge(
  _prev: ChallengeState,
  formData: FormData,
): Promise<ChallengeState> {
  const parent = await requireParent();
  const childId = String(formData.get("childId") ?? "");
  const kind = String(formData.get("kind") ?? "");
  const target = Number(formData.get("target"));
  const reward = String(formData.get("reward") ?? "").trim().slice(0, 80);

  if (!(await isLinked(parent.id, childId))) return { error: "Accès refusé." };
  if (!isChallengeKind(kind)) return { error: "Choisis un type de défi." };
  if (!Number.isInteger(target) || target < 1 || target > 1000)
    return { error: "Objectif entre 1 et 1000." };

  const active = await prisma.challenge.count({
    where: { toId: childId, fromId: parent.id, completedAt: null, cancelled: false },
  });
  if (active >= 5) return { error: "5 défis en cours maximum : laisse-lui le temps !" };

  const child = await prisma.user.findUnique({
    where: { id: childId },
    select: { learnSnapshot: true },
  });
  const baseline = CHALLENGE_KINDS[kind].cumulative
    ? rawValue(kind, readSummary(child?.learnSnapshot ?? null))
    : 0;

  await prisma.challenge.create({
    data: { fromId: parent.id, toId: childId, kind, target, baseline, reward: reward || null },
  });
  revalidatePath(`/parent/${childId}`);
  return { ok: true };
}

export async function cancelChallenge(formData: FormData): Promise<void> {
  const parent = await requireParent();
  const id = String(formData.get("id") ?? "");
  const c = await prisma.challenge.findUnique({ where: { id }, select: { fromId: true, toId: true } });
  if (!c || c.fromId !== parent.id) return;
  await prisma.challenge.update({ where: { id }, data: { cancelled: true } });
  revalidatePath(`/parent/${c.toId}`);
}
