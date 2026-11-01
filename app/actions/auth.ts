"use server";

import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { createSession, deleteSession } from "@/lib/auth";
import {
  SignupSchema,
  LoginSchema,
  EmailSchema,
  VerifyCodeSchema,
  ResetPasswordSchema,
  fieldErrorsFrom,
} from "@/lib/definitions";
import {
  createEmailCode,
  verifyEmailCode,
  type CodePurpose,
} from "@/lib/codes";
import { sendCodeEmail } from "@/lib/mail/send";

// Instruction de transition renvoyée au client : « passe à l'écran de saisie
// du code pour cet e-mail et cet usage ». L'écran affiche un champ mot de passe
// en plus lorsque `purpose === "reset"`.
export type AuthNext = {
  purpose: CodePurpose;
  email: string;
  notice?: string;
};

export type AuthState =
  | {
      error?: string;
      fieldErrors?: Record<string, string[]>;
      values?: { name?: string; email?: string; role?: string };
      next?: AuthNext;
      notice?: string;
    }
  | undefined;

const PATHS = { student: "/timeline", parent: "/parent" } as const;
const homeFor = (role: string) =>
  role === "parent" ? PATHS.parent : PATHS.student;

const str = (fd: FormData, k: string) => (fd.get(k) as string | null) ?? "";

// ---------------------------------------------------------------------------
// Envoi d'un code (création + e-mail), avec messages normalisés.
// ---------------------------------------------------------------------------

type DispatchResult =
  | { ok: true }
  | { ok: false; kind: "cooldown" | "quota" | "config" | "send"; error: string };

async function dispatchCode(
  email: string,
  purpose: CodePurpose,
  payload?: string | null,
): Promise<DispatchResult> {
  const created = await createEmailCode({ email, purpose, payload });
  if (!created.ok) {
    if (created.reason === "cooldown")
      return {
        ok: false,
        kind: "cooldown",
        error: `Un code vient d'être envoyé. Patiente ${created.retryAfter}s avant d'en redemander un.`,
      };
    return {
      ok: false,
      kind: "quota",
      error: "Trop de demandes de code. Réessaie dans un moment.",
    };
  }

  const sent = await sendCodeEmail({ to: email, purpose, code: created.code });
  if (!sent.ok) {
    if (sent.error === "mail_not_configured")
      return {
        ok: false,
        kind: "config",
        error: "L'envoi d'e-mails n'est pas encore configuré côté serveur.",
      };
    console.error("[auth] échec d'envoi d'e-mail:", sent.error);
    return {
      ok: false,
      kind: "send",
      error: "Impossible d'envoyer l'e-mail pour l'instant. Réessaie.",
    };
  }
  return { ok: true };
}

type PendingSignup = { name: string | null; role: string; passwordHash: string };

function parsePending(payload: string | null): PendingSignup | null {
  if (!payload) return null;
  try {
    const p = JSON.parse(payload) as Partial<PendingSignup>;
    if (typeof p.passwordHash !== "string") return null;
    return {
      name: typeof p.name === "string" ? p.name : null,
      role: p.role === "parent" ? "parent" : "student",
      passwordHash: p.passwordHash,
    };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Inscription : on NE crée PAS le compte tout de suite. On met les données en
// attente dans le code de vérification ; le compte naît à la validation du code
// (pas de comptes fantômes, pas de « squat » d'adresse).
// ---------------------------------------------------------------------------

export async function signup(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const raw = {
    name: str(formData, "name").trim() || undefined,
    role: str(formData, "role") || undefined,
    email: str(formData, "email"),
    password: str(formData, "password"),
  };
  const values = { name: raw.name, email: String(raw.email), role: raw.role };

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
  const payload = JSON.stringify({
    name: parsed.data.name ?? null,
    role: parsed.data.role,
    passwordHash,
  } satisfies PendingSignup);

  const dispatched = await dispatchCode(email, "verify", payload);
  if (!dispatched.ok) return { error: dispatched.error, values };

  return {
    values,
    next: {
      purpose: "verify",
      email,
      notice: `Code envoyé à ${email}. Regarde ta boîte de réception.`,
    },
  };
}

export async function verifyEmail(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const email = str(formData, "email").trim().toLowerCase();
  const parsed = VerifyCodeSchema.safeParse({
    email,
    code: str(formData, "code"),
  });
  const keep = (error: string): AuthState => ({
    error,
    next: { purpose: "verify", email },
    values: { email },
  });

  if (!parsed.success) {
    const fe = fieldErrorsFrom(parsed.error);
    return {
      fieldErrors: fe,
      next: { purpose: "verify", email },
      values: { email },
    };
  }

  const result = await verifyEmailCode({
    email,
    purpose: "verify",
    code: parsed.data.code,
  });
  if (!result.ok) return keep(messageFor(result.reason));

  const pending = parsePending(result.payload);
  if (!pending) {
    return {
      error: "Inscription expirée. Recommence la création de compte.",
      values: { email },
    };
  }

  // Course possible : quelqu'un a pu créer ce compte entre-temps.
  const already = await prisma.user.findUnique({ where: { email } });
  const user =
    already ??
    (await prisma.user.create({
      data: {
        email,
        name: pending.name,
        passwordHash: pending.passwordHash,
        role: pending.role,
        emailVerified: new Date(),
        settings: { create: {} },
      },
    }));

  await createSession(user.id);
  redirect(homeFor(user.role));
}

// ---------------------------------------------------------------------------
// Connexion classique (mot de passe) — inchangée, conservée en parallèle.
// ---------------------------------------------------------------------------

export async function login(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const raw = { email: str(formData, "email"), password: str(formData, "password") };
  const values = { email: String(raw.email) };

  const parsed = LoginSchema.safeParse(raw);
  if (!parsed.success) {
    return { fieldErrors: fieldErrorsFrom(parsed.error), values };
  }

  const email = parsed.data.email.trim().toLowerCase();
  const user = await prisma.user.findUnique({ where: { email } });

  const genericError = "E-mail ou mot de passe incorrect.";
  if (!user) {
    await bcrypt.compare(
      parsed.data.password,
      "$2a$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinva",
    );
    return { error: genericError, values };
  }

  const ok = await bcrypt.compare(parsed.data.password, user.passwordHash);
  if (!ok) return { error: genericError, values };

  await createSession(user.id);
  redirect(homeFor(user.role));
}

// ---------------------------------------------------------------------------
// Connexion par code (sans mot de passe).
// ---------------------------------------------------------------------------

export async function requestLoginCode(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const email = str(formData, "email").trim().toLowerCase();
  const parsed = EmailSchema.safeParse({ email });
  if (!parsed.success) return { fieldErrors: fieldErrorsFrom(parsed.error) };

  const config = await issueIfUserExists(email, "login");
  if (config) return { error: config, values: { email } };

  // Réponse uniforme, qu'un compte existe ou non (anti-énumération).
  return {
    next: {
      purpose: "login",
      email,
      notice: `Si un compte existe pour ${email}, un code vient d'être envoyé.`,
    },
    values: { email },
  };
}

export async function loginWithCode(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const email = str(formData, "email").trim().toLowerCase();
  const parsed = VerifyCodeSchema.safeParse({ email, code: str(formData, "code") });
  const keep = (error: string): AuthState => ({
    error,
    next: { purpose: "login", email },
    values: { email },
  });
  if (!parsed.success) {
    return {
      fieldErrors: fieldErrorsFrom(parsed.error),
      next: { purpose: "login", email },
      values: { email },
    };
  }

  const result = await verifyEmailCode({ email, purpose: "login", code: parsed.data.code });
  if (!result.ok) return keep(messageFor(result.reason));

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) return keep("Code invalide.");

  // La connexion par code prouve l'accès à la boîte : on en profite pour
  // marquer l'e-mail comme vérifié s'il ne l'était pas (comptes hérités).
  if (!user.emailVerified) {
    await prisma.user.update({
      where: { id: user.id },
      data: { emailVerified: new Date() },
    });
  }

  await createSession(user.id);
  redirect(homeFor(user.role));
}

// ---------------------------------------------------------------------------
// Mot de passe oublié : code par e-mail, puis nouveau mot de passe.
// ---------------------------------------------------------------------------

export async function requestPasswordReset(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const email = str(formData, "email").trim().toLowerCase();
  const parsed = EmailSchema.safeParse({ email });
  if (!parsed.success) return { fieldErrors: fieldErrorsFrom(parsed.error) };

  const config = await issueIfUserExists(email, "reset");
  if (config) return { error: config, values: { email } };

  return {
    next: {
      purpose: "reset",
      email,
      notice: `Si un compte existe pour ${email}, un code vient d'être envoyé.`,
    },
    values: { email },
  };
}

export async function resetPassword(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const email = str(formData, "email").trim().toLowerCase();
  const parsed = ResetPasswordSchema.safeParse({
    email,
    code: str(formData, "code"),
    password: str(formData, "password"),
  });
  const keep = (error?: string, fieldErrors?: Record<string, string[]>): AuthState => ({
    error,
    fieldErrors,
    next: { purpose: "reset", email },
    values: { email },
  });
  if (!parsed.success) return keep(undefined, fieldErrorsFrom(parsed.error));

  const result = await verifyEmailCode({ email, purpose: "reset", code: parsed.data.code });
  if (!result.ok) return keep(messageFor(result.reason));

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) return keep("Code invalide.");

  const passwordHash = await bcrypt.hash(parsed.data.password, 10);
  await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordHash,
      emailVerified: user.emailVerified ?? new Date(),
    },
  });

  await createSession(user.id);
  redirect(homeFor(user.role));
}

// ---------------------------------------------------------------------------
// Renvoi de code (bouton « Renvoyer » sur l'écran de saisie).
// ---------------------------------------------------------------------------

export async function resendCode(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const email = str(formData, "email").trim().toLowerCase();
  const purposeRaw = str(formData, "purpose");
  const purpose: CodePurpose =
    purposeRaw === "login" || purposeRaw === "reset" ? purposeRaw : "verify";

  const parsed = EmailSchema.safeParse({ email });
  if (!parsed.success) {
    return { fieldErrors: fieldErrorsFrom(parsed.error), next: { purpose, email } };
  }

  const back = (extra: Partial<NonNullable<AuthState>>): AuthState => ({
    next: { purpose, email },
    values: { email },
    ...extra,
  });

  if (purpose === "verify") {
    // On doit réutiliser les données d'inscription en attente.
    const last = await prisma.emailCode.findFirst({
      where: { email, purpose: "verify" },
      orderBy: { createdAt: "desc" },
      select: { payload: true },
    });
    if (!last?.payload) {
      return { error: "Inscription expirée. Recommence la création de compte.", values: { email } };
    }
    const d = await dispatchCode(email, "verify", last.payload);
    return d.ok
      ? back({ notice: `Nouveau code envoyé à ${email}.` })
      : back({ error: d.error });
  }

  // login / reset : seulement si un compte existe (sinon, réponse uniforme).
  // Sur un renvoi explicite, on affiche le feedback (y compris cooldown) :
  // l'utilisateur est déjà sur l'écran de saisie pour SON adresse.
  const user = await prisma.user.findUnique({ where: { email } });
  if (user) {
    const d = await dispatchCode(email, purpose);
    if (!d.ok) return back({ error: d.error });
  }
  return back({
    notice: `Si un compte existe pour ${email}, un nouveau code a été envoyé.`,
  });
}

// ---------------------------------------------------------------------------

export async function logout(): Promise<void> {
  await deleteSession();
  redirect("/login");
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Envoie un code uniquement si un compte existe, pour garder une réponse
 * uniforme côté client. Renvoie un message d'ERREUR seulement pour un défaut
 * de configuration (global, non lié à l'existence du compte) ; les limites de
 * débit et erreurs transitoires sont volontairement silencieuses ici.
 */
async function issueIfUserExists(
  email: string,
  purpose: CodePurpose,
): Promise<string | null> {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) return null;
  const d = await dispatchCode(email, purpose);
  if (!d.ok && d.kind === "config") return d.error;
  return null;
}

function messageFor(reason: "invalid" | "expired" | "too_many_attempts"): string {
  switch (reason) {
    case "expired":
      return "Ce code a expiré. Demande-en un nouveau.";
    case "too_many_attempts":
      return "Trop d'essais. Demande un nouveau code.";
    default:
      return "Code incorrect. Vérifie et réessaie.";
  }
}
