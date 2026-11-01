"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";

export async function updateSettings(formData: FormData): Promise<void> {
  const user = await requireUser();

  const font = String(formData.get("font")) === "sans" ? "sans" : "serif";
  const sizeRaw = String(formData.get("fontSize"));
  const fontSize = ["sm", "base", "lg"].includes(sizeRaw) ? sizeRaw : "base";

  await prisma.settings.upsert({
    where: { userId: user.id },
    update: { font, fontSize },
    create: { userId: user.id, font, fontSize },
  });

  revalidatePath("/", "layout");
  redirect("/settings");
}
