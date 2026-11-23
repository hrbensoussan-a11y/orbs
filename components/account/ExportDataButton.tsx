"use client";

// « Télécharger mes données » : archive COMPLÈTE = données du serveur +
// données enregistrées dans le navigateur de CET appareil.
//
// Le serveur ne peut pas lire le stockage local : le navigateur récupère
// donc l'export du serveur (session vérifiée côté serveur), y ajoute les
// données locales du compte connecté (lib/localAccountData), puis télécharge
// le fichier. Les données locales ne quittent jamais l'appareil.

import { useState } from "react";
import { Download } from "lucide-react";
import { getActiveUser } from "@/lib/userStorage";
import { buildFullExport, type ServerExport } from "@/lib/localAccountData";

function download(name: string, content: string): void {
  const blob = new Blob([content], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function ExportDataButton() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onClick() {
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/account/export", { cache: "no-store", credentials: "same-origin" });
      if (res.status === 401) {
        setError("Ta session a expiré. Reconnecte-toi, puis réessaie.");
        return;
      }
      if (!res.ok) {
        setError("Le téléchargement n’a pas pu être préparé. Réessaie dans un instant.");
        return;
      }
      const server = (await res.json()) as ServerExport;
      const built = buildFullExport(server, window.localStorage, getActiveUser());
      if (!built.ok) {
        setError(built.error);
        return;
      }
      const stamp = new Date().toISOString().slice(0, 10);
      download(`orbs-mon-compte-${stamp}.json`, JSON.stringify(built.archive, null, 2));
    } catch {
      setError("La connexion a échoué. Vérifie ta connexion internet et réessaie.");
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <button type="button" className="btn-ghost" onClick={onClick} disabled={pending}>
        <Download size={16} aria-hidden /> {pending ? "Préparation…" : "Télécharger mes données"}
      </button>
      {error && (
        <p className="text-sm text-coral mt-2" role="alert">
          {error}
        </p>
      )}
    </>
  );
}
