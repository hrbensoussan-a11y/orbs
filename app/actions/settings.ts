"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { isLineSpacing } from "@/lib/reading";

export async function updateSettings(formData: FormData): Promise<void> {
  const user = await requireUser();

  // On ne lit que les champs présents dans le formulaire et on préserve le
  // reste (avant, enregistrer la taille du texte réinitialisait la police).
  const existing = await prisma.settings.findUnique({
    where: { userId: user.id },
  });

  const fontRaw = String(formData.get("font") ?? "");
  const font =
    fontRaw === "sans" || fontRaw === "serif"
      ? fontRaw
      : existing?.font ?? "serif";

  const sizeRaw = String(formData.get("fontSize") ?? "");
  const fontSize = ["sm", "base", "lg"].includes(sizeRaw)
    ? sizeRaw
    : existing?.fontSize ?? "base";

  await prisma.settings.upsert({
    where: { userId: user.id },
    update: { font, fontSize },
    create: { userId: user.id, font, fontSize },
  });

  revalidatePath("/", "layout");
  redirect("/settings");
}

export type ReadingSizeResult = { ok: true } | { ok: false; error: string };

/**
 * Espacement de lecture (Réglages → Apparence → Lecture), enregistré sur le
 * compte comme la taille du texte : relu par le layout après revalidation.
 */
export async function setLineSpacing(spacing: string): Promise<ReadingSizeResult> {
  const user = await requireUser();
  if (!isLineSpacing(spacing)) return { ok: false, error: "Espacement inconnu." };
  await prisma.settings.upsert({
    where: { userId: user.id },
    update: { lineSpacing: spacing },
    create: { userId: user.id, lineSpacing: spacing },
  });
  revalidatePath("/", "layout");
  return { ok: true };
}

/**
 * Taille du texte du journal, enregistrée dès qu'on la choisit (Réglages →
 * Apparence). Même donnée que `updateSettings` (Settings.fontSize, synchronisée
 * entre les appareils), sans rechargement ni redirection : le layout relit la
 * valeur après revalidation et l'applique partout.
 */
export async function setReadingSize(size: string): Promise<ReadingSizeResult> {
  const user = await requireUser();
  if (!["sm", "base", "lg"].includes(size)) {
    return { ok: false, error: "Taille inconnue." };
  }
  await prisma.settings.upsert({
    where: { userId: user.id },
    update: { fontSize: size },
    create: { userId: user.id, fontSize: size },
  });
  revalidatePath("/", "layout");
  return { ok: true };
}
