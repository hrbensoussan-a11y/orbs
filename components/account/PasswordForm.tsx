"use client";

// Formulaire de changement de mot de passe (compte avec mot de passe réel).
// La preuve d'identité est le mot de passe ACTUEL, vérifié côté serveur
// (lib/account.ts → changeUserPassword) ; rien n'est jamais confirmé côté
// client seul.

import { useActionState, useState } from "react";
import { Check, Eye, EyeOff, KeyRound } from "lucide-react";
import { changePassword, type PasswordState } from "@/app/actions/account";

function PasswordField({
  name,
  label,
  autoComplete,
}: {
  name: string;
  label: string;
  autoComplete: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm text-ink-2">{label}</span>
      <div className="relative">
        <input
          name={name}
          type={show ? "text" : "password"}
          autoComplete={autoComplete}
          required
          minLength={8}
          className="input w-full pr-10"
        />
        <button
          type="button"
          onClick={() => setShow((v) => !v)}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-3 hover:text-ink-2"
          aria-label={show ? "Masquer le mot de passe" : "Afficher le mot de passe"}
          tabIndex={-1}
        >
          {show ? <EyeOff size={16} aria-hidden /> : <Eye size={16} aria-hidden />}
        </button>
      </div>
    </label>
  );
}

export function PasswordForm() {
  const [state, action, pending] = useActionState<PasswordState, FormData>(
    changePassword,
    undefined,
  );

  return (
    <form
      action={action}
      className="flex flex-col gap-4"
      // Après un succès, on repart d'un formulaire vide (les mots de passe
      // affichés resteraient sinon visibles dans le DOM sans raison).
      key={state?.ok ? "done" : "form"}
    >
      <PasswordField name="currentPassword" label="Mot de passe actuel" autoComplete="current-password" />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <PasswordField name="newPassword" label="Nouveau mot de passe" autoComplete="new-password" />
        <PasswordField name="confirmPassword" label="Confirmer le nouveau" autoComplete="new-password" />
      </div>

      {state?.error && <p className="text-sm text-coral">{state.error}</p>}

      <div className="flex items-center gap-3">
        <button type="submit" className="btn-primary" disabled={pending}>
          <KeyRound size={16} aria-hidden />
          {pending ? "Enregistrement…" : "Mettre à jour le mot de passe"}
        </button>
        {state?.ok && (
          <span className="inline-flex items-center gap-1 text-sm text-green-ink">
            <Check size={16} aria-hidden /> Mot de passe changé
          </span>
        )}
      </div>
    </form>
  );
}
