"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";

async function assertOwner(userId: string, id: string): Promise<boolean> {
  const entry = await prisma.entry.findUnique({
    where: { id },
    select: { userId: true },
  });
  return !!entry && entry.userId === userId;
}

export async function deleteEntry(formData: FormData): Promise<void> {
  const user = await requireUser();
  const id = String(formData.get("id") ?? "");
  if (!id || !(await assertOwner(user.id, id))) return;
  await prisma.entry.delete({ where: { id } });
  revalidatePath("/timeline");
  redirect("/timeline");
}

export async function toggleFavorite(formData: FormData): Promise<void> {
  const user = await requireUser();
  const id = String(formData.get("id") ?? "");
  if (!id || !(await assertOwner(user.id, id))) return;
  const entry = await prisma.entry.findUnique({
    where: { id },
    select: { favorite: true },
  });
  await prisma.entry.update({
    where: { id },
    data: { favorite: !entry?.favorite },
  });
  revalidatePath("/timeline");
  revalidatePath(`/entry/${id}`);
}

export async function togglePinned(formData: FormData): Promise<void> {
  const user = await requireUser();
  const id = String(formData.get("id") ?? "");
  if (!id || !(await assertOwner(user.id, id))) return;
  const entry = await prisma.entry.findUnique({
    where: { id },
    select: { pinned: true },
  });
  await prisma.entry.update({
    where: { id },
    data: { pinned: !entry?.pinned },
  });
  revalidatePath("/timeline");
  revalidatePath(`/entry/${id}`);
}
