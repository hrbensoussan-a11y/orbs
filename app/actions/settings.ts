"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";

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
