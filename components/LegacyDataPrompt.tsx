"use client";

// « Ces données sont-elles à toi ? »
//
// Sur un appareil utilisé avant le cloisonnement par compte, il peut rester
// des données locales sans propriétaire connu (voir lib/legacyStorage). Quand
// personne n'était connecté au moment de la mise à jour, on ne les rattache
// à un compte que si son titulaire le confirme ici.
//
// La fenêtre n'affiche que des quantités, jamais de contenu : la question
// peut être posée à quelqu'un à qui ces données n'appartiennent pas.
//   - Oui  : elles rejoignent son compte, puis la page se recharge ;
//   - Non  : elles restent en attente, on ne lui redemandera pas ici ;
//   - Échap / clic à côté : aucune décision, la question reviendra.

import { useEffect, useState } from "react";
import { ArchiveRestore } from "lucide-react";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { acceptLegacy, declineLegacy, legacyOffer } from "@/lib/legacyStorage";
import { lockScope } from "@/lib/storageScope";

export function LegacyDataPrompt({ userId }: { userId: string }) {
  const [items, setItems] = useState<string[] | null>(null);

  // Lecture du stockage local : après le montage seulement.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setItems(legacyOffer(userId));
  }, [userId]);

  if (!items) return null;

  return (
    <ConfirmDialog
      open
      title="Ces données sont-elles à toi ?"
      icon={<ArchiveRestore size={20} />}
      message={
        <>
          Orbs a trouvé sur cet appareil des données enregistrées avant que
          chaque compte ait son propre espace : {items.join(", ")}. Si elles
          sont à toi, récupère-les dans ton compte. Sinon, réponds non : elles
          resteront en attente pour leur propriétaire, sans être visibles.
        </>
      }
      confirmLabel="Oui, c'est à moi"
      cancelLabel="Non"
      onConfirm={() => {
        acceptLegacy(userId);
        // Les écrans déjà affichés ont chargé un espace vide : on ferme
        // l'accès (pour qu'ils n'écrasent rien en se fermant) et on recharge.
        lockScope();
      }}
      onCancel={() => {
        declineLegacy();
        setItems(null);
      }}
      onDismiss={() => setItems(null)}
    />
  );
}
