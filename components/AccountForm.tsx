"use client";

import { useActionState } from "react";
import { Check } from "lucide-react";
import { updateAccount, type AccountState } from "@/app/actions/account";

type Initial = {
  firstName: string;
  lastName: string;
  schoolClass: string;
  school: string;
  email: string;
};

export function AccountForm({ initial }: { initial: Initial }) {
  const [state, action, pending] = useActionState<AccountState, FormData>(
    updateAccount,
    undefined,
  );

  return (
    <form action={action} className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1.5">
          <span className="text-sm text-ink-2">Prénom</span>
          <input name="firstName" defaultValue={initial.firstName} className="input" placeholder="Tom" />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-sm text-ink-2">Nom</span>
          <input name="lastName" defaultValue={initial.lastName} className="input" placeholder="Hélière" />
        </label>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1.5">
          <span className="text-sm text-ink-2">Classe</span>
          <input name="schoolClass" defaultValue={initial.schoolClass} className="input" placeholder="Terminale" />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-sm text-ink-2">Établissement</span>
          <input name="school" defaultValue={initial.school} className="input" placeholder="Lycée…" />
        </label>
      </div>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm text-ink-2">E-mail</span>
        <input
          name="email"
          type="email"
          defaultValue={initial.email}
          className="input"
          aria-invalid={state?.fieldErrors?.email ? true : undefined}
        />
        {state?.fieldErrors?.email && (
          <span className="text-sm text-coral">{state.fieldErrors.email}</span>
        )}
      </label>

      {state?.error && <p className="text-sm text-coral">{state.error}</p>}

      <div className="flex items-center gap-3">
        <button type="submit" className="btn-primary" disabled={pending}>
          {pending ? "Enregistrement…" : "Enregistrer"}
        </button>
        {state?.ok && (
          <span className="inline-flex items-center gap-1 text-sm text-green-ink">
            <Check size={16} aria-hidden /> Enregistré
          </span>
        )}
      </div>
    </form>
  );
}
