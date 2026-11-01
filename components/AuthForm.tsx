"use client";

import { useActionState, useEffect, useState } from "react";
import Link from "next/link";
import {
  signup,
  login,
  verifyEmail,
  requestLoginCode,
  loginWithCode,
  requestPasswordReset,
  resetPassword,
  resendCode,
  type AuthNext,
  type AuthState,
} from "@/app/actions/auth";

// En phase avec CODE_POLICY.resendCooldownMs (lib/codes.ts). Valeur « client »
// pour le minuteur : on n'importe pas lib/codes ici (code serveur).
const RESEND_COOLDOWN_SECONDS = 45;

type Screen =
  | { kind: "credentials" }
  | { kind: "email"; purpose: "login" | "reset" }
  | { kind: "code"; next: AuthNext };

/** Formulaire d'authentification : mot de passe + connexion/vérification par code. */
export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const [screen, setScreen] = useState<Screen>({ kind: "credentials" });
  const [email, setEmail] = useState("");

  const goCode = (next: AuthNext) => {
    setEmail(next.email);
    setScreen({ kind: "code", next });
  };
  const toCredentials = () => setScreen({ kind: "credentials" });

  if (screen.kind === "code") {
    return <CodeForm next={screen.next} onBack={toCredentials} />;
  }
  if (screen.kind === "email") {
    return (
      <EmailRequestForm
        purpose={screen.purpose}
        defaultEmail={email}
        onCode={goCode}
        onBack={toCredentials}
      />
    );
  }
  return (
    <CredentialsForm
      mode={mode}
      defaultEmail={email}
      onCode={goCode}
      onSwitch={(purpose) => setScreen({ kind: "email", purpose })}
    />
  );
}

// ---------------------------------------------------------------------------
// Écran 1 : identifiants (connexion par mot de passe, ou inscription).
// ---------------------------------------------------------------------------

function CredentialsForm({
  mode,
  defaultEmail,
  onCode,
  onSwitch,
}: {
  mode: "login" | "register";
  defaultEmail: string;
  onCode: (next: AuthNext) => void;
  onSwitch: (purpose: "login" | "reset") => void;
}) {
  const isRegister = mode === "register";
  const [state, formAction, pending] = useActionState<AuthState, FormData>(
    isRegister ? signup : login,
    undefined,
  );

  // L'inscription ne redirige pas : elle demande la saisie d'un code.
  useEffect(() => {
    if (state?.next) onCode(state.next);
  }, [state, onCode]);

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
          defaultValue={state?.values?.email ?? defaultEmail}
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

      {state?.error && <ErrorText>{state.error}</ErrorText>}

      <button type="submit" disabled={pending} className="btn-primary mt-1">
        {pending
          ? "Un instant…"
          : isRegister
            ? "Créer mon carnet"
            : "Se connecter"}
      </button>

      {!isRegister && (
        <div className="flex flex-col gap-1.5 text-sm text-center mt-1">
          <button
            type="button"
            onClick={() => onSwitch("login")}
            className="text-accent underline"
          >
            Recevoir un code par e-mail
          </button>
          <button
            type="button"
            onClick={() => onSwitch("reset")}
            className="text-muted underline"
          >
            Mot de passe oublié ?
          </button>
        </div>
      )}

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

// ---------------------------------------------------------------------------
// Écran 2 : demande d'un code (e-mail seul) — connexion par code ou oubli.
// ---------------------------------------------------------------------------

function EmailRequestForm({
  purpose,
  defaultEmail,
  onCode,
  onBack,
}: {
  purpose: "login" | "reset";
  defaultEmail: string;
  onCode: (next: AuthNext) => void;
  onBack: () => void;
}) {
  const action = purpose === "login" ? requestLoginCode : requestPasswordReset;
  const [state, formAction, pending] = useActionState<AuthState, FormData>(
    action,
    undefined,
  );

  useEffect(() => {
    if (state?.next) onCode(state.next);
  }, [state, onCode]);

  const title =
    purpose === "login" ? "Se connecter par code" : "Mot de passe oublié";
  const help =
    purpose === "login"
      ? "Entre ton e-mail : on t'envoie un code pour te connecter, sans mot de passe."
      : "Entre ton e-mail : on t'envoie un code pour choisir un nouveau mot de passe.";

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      <div>
        <h2 className="font-serif text-xl">{title}</h2>
        <p className="text-sm text-muted mt-1">{help}</p>
      </div>

      <Field label="Adresse e-mail">
        <input
          name="email"
          type="email"
          autoComplete="email"
          required
          defaultValue={state?.values?.email ?? defaultEmail}
          className="input"
        />
        <FieldError messages={state?.fieldErrors?.email} />
      </Field>

      {state?.error && <ErrorText>{state.error}</ErrorText>}

      <button type="submit" disabled={pending} className="btn-primary mt-1">
        {pending ? "Envoi…" : "Recevoir un code"}
      </button>

      <BackLink onBack={onBack} />
    </form>
  );
}

// ---------------------------------------------------------------------------
// Écran 3 : saisie du code (+ nouveau mot de passe si réinitialisation).
// ---------------------------------------------------------------------------

function CodeForm({ next, onBack }: { next: AuthNext; onBack: () => void }) {
  const { purpose, email } = next;
  const action =
    purpose === "verify"
      ? verifyEmail
      : purpose === "login"
        ? loginWithCode
        : resetPassword;

  const [state, formAction, pending] = useActionState<AuthState, FormData>(
    action,
    undefined,
  );
  const [resendState, resendAction, resendPending] = useActionState<
    AuthState,
    FormData
  >(resendCode, undefined);

  // Minuteur de renvoi : un code vient d'être envoyé en arrivant ici, et à
  // chaque renvoi réussi.
  const [left, setLeft] = useState(RESEND_COOLDOWN_SECONDS);
  useEffect(() => {
    if (left <= 0) return;
    const t = setTimeout(() => setLeft((l) => l - 1), 1000);
    return () => clearTimeout(t);
  }, [left]);

  // Relance le minuteur quand un renvoi réussit — ajustement en phase de rendu
  // (motif React recommandé) plutôt qu'un setState dans un effet.
  const [seenResend, setSeenResend] = useState(resendState);
  if (resendState !== seenResend) {
    setSeenResend(resendState);
    if (resendState?.notice) setLeft(RESEND_COOLDOWN_SECONDS);
  }

  const title =
    purpose === "verify"
      ? "Confirme ton adresse"
      : purpose === "login"
        ? "Entre ton code"
        : "Nouveau mot de passe";
  const cta =
    purpose === "verify"
      ? "Valider mon carnet"
      : purpose === "login"
        ? "Se connecter"
        : "Changer le mot de passe";

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="font-serif text-xl">{title}</h2>
        <p className="text-sm text-muted mt-1">
          Code à 6 chiffres envoyé à <strong>{email}</strong>.
        </p>
        {next.notice && (
          <p className="text-sm text-accent mt-1">{next.notice}</p>
        )}
      </div>

      <form action={formAction} className="flex flex-col gap-4" noValidate>
        <input type="hidden" name="email" value={email} />

        <Field label="Code reçu par e-mail">
          <input
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="\d{6}"
            maxLength={6}
            required
            autoFocus
            placeholder="123456"
            className="input tracking-[0.4em] text-center text-lg"
          />
          <FieldError messages={state?.fieldErrors?.code} />
        </Field>

        {purpose === "reset" && (
          <Field label="Nouveau mot de passe">
            <input
              name="password"
              type="password"
              autoComplete="new-password"
              required
              className="input"
            />
            <FieldError messages={state?.fieldErrors?.password} />
          </Field>
        )}

        {state?.error && <ErrorText>{state.error}</ErrorText>}

        <button type="submit" disabled={pending} className="btn-primary mt-1">
          {pending ? "Un instant…" : cta}
        </button>
      </form>

      <form action={resendAction} className="text-center text-sm">
        <input type="hidden" name="email" value={email} />
        <input type="hidden" name="purpose" value={purpose} />
        {resendState?.notice && (
          <p className="text-accent mb-1">{resendState.notice}</p>
        )}
        {resendState?.error && (
          <p className="text-muted mb-1">{resendState.error}</p>
        )}
        <button
          type="submit"
          disabled={left > 0 || resendPending}
          className="text-accent underline disabled:no-underline disabled:text-muted"
        >
          {left > 0
            ? `Renvoyer le code (${left}s)`
            : resendPending
              ? "Envoi…"
              : "Renvoyer le code"}
        </button>
      </form>

      <BackLink onBack={onBack} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Petits éléments partagés.
// ---------------------------------------------------------------------------

function BackLink({ onBack }: { onBack: () => void }) {
  return (
    <button
      type="button"
      onClick={onBack}
      className="text-sm text-muted underline text-center mt-1"
    >
      ← Retour
    </button>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
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
    <span className="text-xs text-red-600 dark:text-red-400">{messages[0]}</span>
  );
}

function ErrorText({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-red-600 dark:text-red-400">{children}</p>;
}
