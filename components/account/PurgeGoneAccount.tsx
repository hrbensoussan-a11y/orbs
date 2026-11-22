"use client";

// Efface, sur cet appareil, les données locales d'un compte que le SERVEUR a
// déclaré disparu (jeton signé vérifié par app/login/page.tsx). Rendu
// uniquement après cette vérification : une URL fabriquée à la main ne peut
// rien faire effacer. Ne touche qu'à l'espace de CE compte.

import { useEffect } from "react";
import { purgeOnThisDevice } from "@/lib/localAccountData";

export function PurgeGoneAccount({ userId }: { userId: string }) {
  useEffect(() => {
    purgeOnThisDevice(userId);
  }, [userId]);
  return null;
}
