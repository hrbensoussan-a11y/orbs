"use client";

import { useActionState } from "react";
import Link from "next/link";
import { signup, login, type AuthState } from "@/app/actions/auth";

export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const isRegister = mode === "register";
  const action = isRegister ? signup : login;
  const [state, formAction, pending] = useActionState<AuthState, FormData>(
    action,
    undefined,
  );

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      {isRegister && (
        <fieldset className="flex flex-col gap-1.5">
          <legend className="text-sm text-muted mb-1.5">Je suis…</legend>
          <div className="grid grid-cols-2 gap-2.5">
            <label className="role-tile">
              <input
                type="radio"
                name="role"
                value="student"
                defaultChecked={state?.values?.role !== "parent"}
                className="sr-only"
              />
              <span className="text-2xl" aria-hidden>🎒</span>
              <span className="font-semibold">Élève</span>
            </label>
            <label className="role-tile">
              <input
                type="radio"
                name="role"
                value="parent"
                defaultChecked={state?.values?.role === "parent"}
                className="sr-only"
              />
              <span className="text-2xl" aria-hidden>🏡</span>
              <span className="font-semibold">Parent</span>
            </label>
          </div>
        </fieldset>
      )}
      {isRegister && (
        <Field label="Prénom ou pseudo (optionnel)">
          <input
            name="name"
            type="text"
            autoComplete="nickname"
            defaultValue={state?.values?.name}
            className="input"
          />
          <FieldError messages={state?.fieldErrors?.name} />
        </Field>
      )}

      <Field label="Adresse e-mail">
        <input
          name="email"
          type="email"
          autoComplete="email"
          required
          defaultValue={state?.values?.email}
          className="input"
        />
        <FieldError messages={state?.fieldErrors?.email} />
      </Field>

      <Field label="Mot de passe">
        <input
          name="password"
          type="password"
          autoComplete={isRegister ? "new-password" : "current-password"}
          required
          className="input"
        />
        <FieldError messages={state?.fieldErrors?.password} />
      </Field>

      {state?.error && (
        <p className="text-sm text-red-600 dark:text-red-400">{state.error}</p>
      )}

      <button type="submit" disabled={pending} className="btn-primary mt-1">
        {pending
          ? "Un instant…"
          : isRegister
            ? "Créer mon carnet"
            : "Se connecter"}
      </button>

      <p className="text-sm text-muted text-center mt-2">
        {isRegister ? (
          <>
            Déjà un compte ?{" "}
            <Link href="/login" className="text-accent underline">
              Se connecter
            </Link>
          </>
        ) : (
          <>
            Pas encore de carnet ?{" "}
            <Link href="/register" className="text-accent underline">
              En créer un
            </Link>
          </>
        )}
      </p>
    </form>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm text-muted">{label}</span>
      {children}
    </label>
  );
}

function FieldError({ messages }: { messages?: string[] }) {
  if (!messages?.length) return null;
  return (
    <span className="text-xs text-red-600 dark:text-red-400">
      {messages[0]}
    </span>
  );
}
