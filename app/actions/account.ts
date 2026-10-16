"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { parseAvatar } from "@/lib/avatar/config";

export type AccountState =
  | { ok?: boolean; error?: string; fieldErrors?: Record<string, string> }
  | undefined;

const clean = (v: FormDataEntryValue | null, max = 80): string =>
  String(v ?? "").trim().slice(0, max);

/** Nom d'affichage dérivé du prénom + nom (repli sur l'e-mail). */
function displayName(firstName: string, lastName: string, email: string): string {
  const full = `${firstName} ${lastName}`.trim();
  return full || email.split("@")[0];
}

export async function updateAccount(
  _prev: AccountState,
  formData: FormData,
): Promise<AccountState> {
  const user = await requireUser();

  const firstName = clean(formData.get("firstName"), 40);
  const lastName = clean(formData.get("lastName"), 40);
  const schoolClass = clean(formData.get("schoolClass"), 40);
  const school = clean(formData.get("school"), 80);
  const email = clean(formData.get("email"), 120).toLowerCase();

  const fieldErrors: Record<string, string> = {};
  if (!email) fieldErrors.email = "L’e-mail est requis.";
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    fieldErrors.email = "Adresse e-mail invalide.";

  if (email && email !== user.email) {
    const taken = await prisma.user.findUnique({ where: { email } });
    if (taken && taken.id !== user.id)
      fieldErrors.email = "Cette adresse est déjà utilisée.";
  }

  if (Object.keys(fieldErrors).length > 0) return { fieldErrors };

  await prisma.user.update({
    where: { id: user.id },
    data: {
      firstName: firstName || null,
      lastName: lastName || null,
      schoolClass: schoolClass || null,
      school: school || null,
      email,
      name: displayName(firstName, lastName, email),
    },
  });

  revalidatePath("/", "layout");
  return { ok: true };
}

/** Enregistre la configuration d'avatar (soumise par l'éditeur). */
export async function updateAvatar(formData: FormData): Promise<void> {
  const user = await requireUser();
  const cfg = parseAvatar(String(formData.get("avatar") ?? ""));
  await prisma.user.update({
    where: { id: user.id },
    data: { avatar: JSON.stringify(cfg) },
  });
  revalidatePath("/", "layout");
}
