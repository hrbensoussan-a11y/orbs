"use server";

// Réglages → Assistant IA : style d'accompagnement et profil d'apprentissage.
//
// Toujours pour le compte de la session (requireUser) : aucun identifiant
// n'est accepté depuis le navigateur. Les valeurs sont revalidées ici, même si
// l'interface ne propose que des choix valides.

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, requireUser } from "@/lib/auth";
import { isAiStyle } from "@/lib/ai/style";
import { isAiRetention, toAiRetention, type AiRetention } from "@/lib/ai/retention";
import {
  EMPTY_PROFILE,
  serializeProfile,
  validateProfileInput,
  type LearningProfile,
} from "@/lib/ai/learningProfile";

const SAVE_ERROR = "L’enregistrement a échoué. Réessaie.";

export type StyleResult = { ok: true } | { ok: false; error: string };

/** Style d'accompagnement (Guide / Équilibré / Direct), enregistré sur le compte. */
export async function setAiStyle(style: unknown): Promise<StyleResult> {
  const user = await requireUser();
  if (!isAiStyle(style)) return { ok: false, error: "Style inconnu." };
  try {
    await prisma.settings.upsert({
      where: { userId: user.id },
      update: { aiStyle: style },
      create: { userId: user.id, aiStyle: style },
    });
    return { ok: true };
  } catch {
    return { ok: false, error: SAVE_ERROR };
  }
}

export type ProfileResult =
  | { ok: true; schoolClass: string; profile: LearningProfile }
  | { ok: false; error: string };

async function writeProfile(
  userId: string,
  currentClass: string | null,
  schoolClass: string,
  profile: LearningProfile,
): Promise<void> {
  const learningProfile = serializeProfile(profile);
  const nextClass = schoolClass || null;
  await prisma.$transaction([
    // La classe est celle du compte (Compte → Profil) : une seule donnée.
    ...(nextClass !== currentClass
      ? [prisma.user.update({ where: { id: userId }, data: { schoolClass: nextClass } })]
      : []),
    prisma.settings.upsert({
      where: { userId },
      update: { learningProfile },
      create: { userId, learningProfile },
    }),
  ]);
}

/** Enregistre le profil complet tel qu'affiché (chaque modification l'envoie). */
export async function saveLearningProfile(input: unknown): Promise<ProfileResult> {
  const user = await requireUser();
  const checked = validateProfileInput(input);
  if (!checked.ok) return checked;
  const { schoolClass, profile } = checked.value;
  try {
    await writeProfile(user.id, user.schoolClass, schoolClass, profile);
    return { ok: true, schoolClass, profile };
  } catch {
    return { ok: false, error: SAVE_ERROR };
  }
}

/** Vide entièrement le profil : classe comprise. Rien n'est conservé. */
export async function clearLearningProfile(): Promise<ProfileResult> {
  const user = await requireUser();
  try {
    await writeProfile(user.id, user.schoolClass, "", EMPTY_PROFILE);
    return { ok: true, schoolClass: "", profile: { ...EMPTY_PROFILE } };
  } catch {
    return { ok: false, error: SAVE_ERROR };
  }
}

// ---------------------------------------------------------------------------
// Conservation des conversations (lib/ai/retention)
// ---------------------------------------------------------------------------

export type RetentionResult = { ok: true } | { ok: false; error: string };

/** Règle de conservation du compte : keep | 30d | none. */
export async function setAiRetention(retention: unknown): Promise<RetentionResult> {
  const user = await requireUser();
  if (!isAiRetention(retention)) return { ok: false, error: "Choix inconnu." };
  try {
    await prisma.settings.upsert({
      where: { userId: user.id },
      update: { aiRetention: retention },
      create: { userId: user.id, aiRetention: retention },
    });
    // Le layout (AiHistoryKeeper) relit la règle : sans cela, il appliquerait
    // l'ancienne jusqu'au prochain rechargement complet.
    revalidatePath("/", "layout");
    return { ok: true };
  } catch {
    return { ok: false, error: SAVE_ERROR };
  }
}

export type ClearHistoryResult = { ok: true; clearedAt: number } | { ok: false; error: string };

/**
 * « Supprimer l'historique » : date la demande sur le compte. Chaque appareil
 * efface alors tout son historique de conversations, une fois (lib/ai/history
 * → enforceRetention) ; celui-ci tout de suite, les autres à leur prochaine
 * ouverture d'Orbs. Le serveur n'a aucune conversation à effacer : il n'en
 * stocke pas.
 */
export async function clearAiHistory(): Promise<ClearHistoryResult> {
  const user = await requireUser();
  const clearedAt = new Date();
  try {
    await prisma.settings.upsert({
      where: { userId: user.id },
      update: { aiHistoryClearedAt: clearedAt },
      create: { userId: user.id, aiHistoryClearedAt: clearedAt },
    });
    revalidatePath("/", "layout");
    return { ok: true, clearedAt: clearedAt.getTime() };
  } catch {
    return { ok: false, error: SAVE_ERROR };
  }
}

export type AiHistoryRule = { retention: AiRetention; clearedAt: number | null };

/**
 * Règle de conservation ACTUELLE du compte, relue avant chaque passage
 * périodique de AiHistoryKeeper : un onglet resté ouvert ne doit jamais
 * appliquer une règle changée depuis (par ex. « 30 jours » → « Conserver »
 * sur un autre appareil). null sans session : rien n'est appliqué.
 */
export async function getAiHistoryRule(): Promise<AiHistoryRule | null> {
  const user = await getCurrentUser();
  if (!user) return null;
  const s = await prisma.settings.findUnique({
    where: { userId: user.id },
    select: { aiRetention: true, aiHistoryClearedAt: true },
  });
  return { retention: toAiRetention(s?.aiRetention), clearedAt: s?.aiHistoryClearedAt?.getTime() ?? null };
}
