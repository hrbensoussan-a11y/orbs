"use server";

import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { createSession, deleteSession } from "@/lib/auth";
import { SignupSchema, LoginSchema, fieldErrorsFrom } from "@/lib/definitions";

export type AuthState =
  | {
      error?: string;
      fieldErrors?: Record<string, string[]>;
      values?: { name?: string; email?: string };
    }
  | undefined;

export async function signup(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const raw = {
    name: (formData.get("name") as string | null)?.trim() || undefined,
    email: (formData.get("email") as string | null) ?? "",
    password: (formData.get("password") as string | null) ?? "",
  };
  const values = { name: raw.name, email: String(raw.email) };

  const parsed = SignupSchema.safeParse(raw);
  if (!parsed.success) {
    return { fieldErrors: fieldErrorsFrom(parsed.error), values };
  }

  const email = parsed.data.email.trim().toLowerCase();
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return { error: "Un compte existe déjà avec cette adresse.", values };
  }

  const passwordHash = await bcrypt.hash(parsed.data.password, 10);
  const user = await prisma.user.create({
    data: {
      email,
      name: parsed.data.name ?? null,
      passwordHash,
      settings: { create: {} },
    },
  });

  await createSession(user.id);
  redirect("/timeline");
}

export async function login(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const raw = {
    email: (formData.get("email") as string | null) ?? "",
    password: (formData.get("password") as string | null) ?? "",
  };
  const values = { email: String(raw.email) };

  const parsed = LoginSchema.safeParse(raw);
  if (!parsed.success) {
    return { fieldErrors: fieldErrorsFrom(parsed.error), values };
  }

  const email = parsed.data.email.trim().toLowerCase();
  const user = await prisma.user.findUnique({ where: { email } });

  // Message générique : on n'indique pas si c'est l'e-mail ou le mot de
  // passe qui est faux (évite l'énumération de comptes).
  const genericError = "E-mail ou mot de passe incorrect.";
  if (!user) {
    // Compare quand même pour limiter les différences de timing.
    await bcrypt.compare(parsed.data.password, "$2a$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinva");
    return { error: genericError, values };
  }

  const ok = await bcrypt.compare(parsed.data.password, user.passwordHash);
  if (!ok) return { error: genericError, values };

  await createSession(user.id);
  redirect("/timeline");
}

export async function logout(): Promise<void> {
  await deleteSession();
  redirect("/login");
}
