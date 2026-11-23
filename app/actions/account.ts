"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser, getCurrentUser, deleteSession } from "@/lib/auth";
import { parseAvatar } from "@/lib/avatar/config";
import { isProAccountEmail } from "@/lib/proAccess";
import {
  changeUserPassword,
  requestAccountDeletion,
  type DeletionResult,
} from "@/lib/account";

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
  // Compte professionnel par code (lib/proAccess) : l'adresse est générée et
  // RECHERCHÉE PAR VALEUR EXACTE à chaque connexion par code. La modifier
  // casserait l'accès actuel et créerait un compte en double au prochain
  // usage du code — on l'ignore donc totalement, même si le formulaire a été
  // manipulé côté client (vérification refaite ici, côté serveur).
  const pro = isProAccountEmail(user.email);

  const firstName = clean(formData.get("firstName"), 40);
  const lastName = clean(formData.get("lastName"), 40);
  const schoolClass = clean(formData.get("schoolClass"), 40);
  const school = clean(formData.get("school"), 80);

  const fieldErrors: Record<string, string> = {};
  let email = user.email;

  if (!pro) {
    email = clean(formData.get("email"), 120).toLowerCase();
    if (!email) fieldErrors.email = "L’e-mail est requis.";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      fieldErrors.email = "Adresse e-mail invalide.";

    if (email && email !== user.email) {
      const taken = await prisma.user.findUnique({ where: { email } });
      if (taken && taken.id !== user.id)
        fieldErrors.email = "Cette adresse est déjà utilisée.";
    }
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

// ---------------------------------------------------------------------------
// Sécurité : changement de mot de passe (comptes avec mot de passe réel).
// ---------------------------------------------------------------------------

export type PasswordState = { ok?: boolean; error?: string } | undefined;

export async function changePassword(
  _prev: PasswordState,
  formData: FormData,
): Promise<PasswordState> {
  const user = await requireUser();
  const currentPassword = String(formData.get("currentPassword") ?? "");
  const newPassword = String(formData.get("newPassword") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");

  if (newPassword !== confirmPassword) {
    return { error: "Les deux mots de passe ne correspondent pas." };
  }

  const result = await changeUserPassword(user.id, currentPassword, newPassword);
  if (!result.ok) return { error: result.error };

  return { ok: true };
}

// ---------------------------------------------------------------------------
// Mes données : suppression définitive du compte.
//
// Pas de redirection ici : l'action RÉPOND au navigateur, qui n'efface les
// données locales de l'appareil qu'après cette confirmation, puis quitte la
// page (voir lib/localAccountData → runAccountDeletion). Une erreur ou une
// coupure réseau ne provoque donc jamais d'effacement local prématuré.
// ---------------------------------------------------------------------------

export type DeleteAccountState =
  | { ok: true; deletedUserId: string }
  | { ok: false; error: string }
  | undefined;

export async function deleteAccount(
  _prev: DeleteAccountState,
  formData: FormData,
): Promise<DeleteAccountState> {
  // Pas de requireUser : sa redirection masquerait l'erreur au navigateur.
  const user = await getCurrentUser();
  if (!user) {
    return { ok: false, error: "Ta session a expiré. Reconnecte-toi, puis recommence." };
  }
  const acknowledged = formData.get("acknowledged") === "on";
  const proof = String(formData.get("proof") ?? "");

  if (!acknowledged) {
    return { ok: false, error: "Confirme d'abord que tu as compris les conséquences." };
  }

  const result: DeletionResult = await requestAccountDeletion(user.id, proof);
  if (!result.ok) return { ok: false, error: result.error };

  await deleteSession();
  return { ok: true, deletedUserId: result.deletedUserId };
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
