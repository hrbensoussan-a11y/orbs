"use client";

// Parcours de suppression définitive du compte.
//
// Deux garanties : une confirmation EXPLICITE (case à cocher, lue avant
// d'activer le reste du formulaire) et une vérification d'IDENTITÉ adaptée
// au type de compte (mot de passe actuel, ou phrase de confirmation pour un
// compte professionnel sans mot de passe connu). Tout est revérifié côté
// serveur (app/actions/account.ts → lib/account.ts).
//
// Ordre imposé (lib/localAccountData → runAccountDeletion) : le serveur
// supprime d'abord ; SEULEMENT s'il le confirme, on efface les données de ce
// compte sur l'appareil, puis on quitte la page. En cas d'erreur ou de
// coupure réseau, rien n'est effacé localement.

import { useState, useTransition, type FormEvent } from "react";
import { AlertTriangle, Trash2 } from "lucide-react";
import { deleteAccount } from "@/app/actions/account";
import { PRO_DELETE_CONFIRM_PHRASE } from "@/lib/accountConstants";
import { purgeOnThisDevice, runAccountDeletion } from "@/lib/localAccountData";

export function DeleteAccountFlow({ isPro }: { isPro: boolean }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [acknowledged, setAcknowledged] = useState(false);
  const [proof, setProof] = useState("");

  const proofReady = isPro ? proof.trim() === PRO_DELETE_CONFIRM_PHRASE : proof.length > 0;
  const canSubmit = acknowledged && proofReady && !pending;

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!canSubmit) return;
    const data = new FormData(e.currentTarget);
    setError(null);
    startTransition(async () => {
      const result = await runAccountDeletion({
        submit: () => deleteAccount(undefined, data),
        purge: (userId) => purgeOnThisDevice(userId),
        // Rechargement complet : plus rien du compte ne reste en mémoire.
        leave: () => window.location.replace("/login?deleted=1"),
      });
      if (!result.ok) setError(result.error);
    });
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <label className="flex items-start gap-3 cursor-pointer">
        <input
          type="checkbox"
          name="acknowledged"
          checked={acknowledged}
          onChange={(e) => setAcknowledged(e.target.checked)}
          className="h-5 w-5 mt-0.5 accent-[var(--coral)]"
        />
        <span className="text-sm">
          J’ai compris que mon journal, mes notes, ma progression, mon avatar, mon
          abonnement et mes liens famille seront effacés définitivement, sans
          possibilité de les récupérer.
        </span>
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm text-ink-2">
          {isPro
            ? `Tape « ${PRO_DELETE_CONFIRM_PHRASE} » pour confirmer`
            : "Ton mot de passe actuel, pour confirmer que c’est bien toi"}
        </span>
        <input
          name="proof"
          type={isPro ? "text" : "password"}
          autoComplete={isPro ? "off" : "current-password"}
          value={proof}
          onChange={(e) => setProof(e.target.value)}
          disabled={!acknowledged}
          className="input disabled:opacity-50"
          placeholder={isPro ? PRO_DELETE_CONFIRM_PHRASE : undefined}
        />
      </label>

      {error && (
        <p className="text-sm text-coral flex items-start gap-2" role="alert">
          <AlertTriangle size={15} className="shrink-0 mt-0.5" aria-hidden />
          {error}
        </p>
      )}

      <button type="submit" className="btn-danger" disabled={!canSubmit}>
        <Trash2 size={16} aria-hidden />
        {pending ? "Suppression…" : "Supprimer définitivement mon compte"}
      </button>
    </form>
  );
}
