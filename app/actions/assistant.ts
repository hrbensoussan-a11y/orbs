"use server";

// Réglages → Assistant IA : style d'accompagnement et profil d'apprentissage.
//
// Toujours pour le compte de la session (requireUser) : aucun identifiant
// n'est accepté depuis le navigateur. Les valeurs sont revalidées ici, même si
// l'interface ne propose que des choix valides.

import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { isAiStyle } from "@/lib/ai/style";
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
