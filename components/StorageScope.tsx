"use client";

// Relie les données locales au compte connecté.
//
// Rendu par les layouts protégés avec l'identifiant vérifié par le serveur
// (et par les écrans de connexion avec `userId={null}`). Tout ce qui est
// affiché en dessous lit et écrit dans l'espace local de CE compte — voir
// lib/userStorage. Les layouts lui donnent `key={userId}` : si le compte
// change, tout le sous-arbre est remonté, sans rien garder en mémoire de
// l'ancien.
//
// Ne rend rien de visible.

import { useEffect, useLayoutEffect, type ReactNode } from "react";
import { LegacyDataPrompt } from "@/components/LegacyDataPrompt";
import { applyStoredAppearance } from "@/lib/appearance";
import { resolveLegacy, type LegacyMode } from "@/lib/legacyStorage";
import { lockScope, watchScope } from "@/lib/storageScope";
import { commitDeviceUser, setActiveUser } from "@/lib/userStorage";
import { purgeTombstoned, sweepOtherDeviceAccounts } from "@/lib/localAccountData";

/**
 * Autres comptes de l'appareil supprimés depuis ailleurs, alors que leur
 * session avait déjà expiré ici : on demande au serveur lesquels n'existent
 * plus (identifiants seulement, jamais de données) et on n'efface qu'eux.
 * Au plus toutes les 12 h ; un échec (réseau, serveur, trop de demandes)
 * n'efface rien — voir lib/localAccountData → sweepOtherDeviceAccounts.
 */
function sweepOtherAccounts(currentUserId: string): void {
  let storage: Storage;
  try {
    storage = window.localStorage;
  } catch {
    return;
  }
  sweepOtherDeviceAccounts(storage, currentUserId, (ids) =>
    fetch("/api/account/local-check", {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ ids }),
    }),
  ).catch(() => {
    /* stockage devenu indisponible : on réessaiera au prochain chargement */
  });
}

/** Prévient le service worker : vider son cache et/ou noter l'échéance. */
function notifyServiceWorker(message: {
  userId: string | null;
  exp: number | null;
  purge: boolean;
}): void {
  try {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.ready
      .then((reg) => reg.active?.postMessage({ type: "orbs:session", ...message }))
      .catch(() => {});
  } catch {
    /* pas de service worker : rien à vider */
  }
}

export function StorageScope({
  userId,
  expiresAt = null,
  legacy = "ask",
  children,
}: {
  /** Compte de la session vérifiée par le serveur ; `null` hors compte. */
  userId: string | null;
  /** Fin de validité de la session (ISO), pour verrouiller l'onglet à l'heure. */
  expiresAt?: string | null;
  /**
   * Sort des données locales d'avant le cloisonnement (lib/legacyStorage) :
   * "continuity" si la session date d'avant la mise à jour, "ask" sinon,
   * "ignore" pour un compte sans données locales.
   */
  legacy?: LegacyMode;
  children?: ReactNode;
}) {
  // Dès le rendu (navigateur uniquement) : les composants enfants peuvent lire
  // leurs données locales pendant leur propre rendu ou dans leurs effets, qui
  // s'exécutent AVANT ceux de ce composant. Les deux appels sont idempotents ;
  // le second ne fait quelque chose qu'une seule fois par appareil.
  if (typeof window !== "undefined") {
    setActiveUser(userId);
    resolveLegacy(userId, legacy);
  }

  // Avant la première peinture : apparence du compte (ou par défaut hors
  // compte) quand on arrive sans rechargement, après connexion/déconnexion.
  useLayoutEffect(() => {
    setActiveUser(userId);
    applyStoredAppearance();
  }, [userId]);

  useEffect(() => {
    setActiveUser(userId);
    // Restes d'un compte supprimé (écriture tardive d'un onglet périmé).
    try {
      purgeTombstoned(window.localStorage);
    } catch {
      /* stockage indisponible */
    }
    if (userId) sweepOtherAccounts(userId);
    const exp = expiresAt ? Date.parse(expiresAt) : NaN;
    const expMs = Number.isFinite(exp) ? exp : null;

    // Marqueur d'appareil : si le compte a changé (connexion, déconnexion,
    // autre compte, session expirée), le cache hors ligne du précédent part.
    const { changed, persisted } = commitDeviceUser(userId);
    notifyServiceWorker({ userId, exp: expMs, purge: changed });

    return watchScope({
      userId,
      expiresAt: expMs,
      markerReliable: persisted,
      onStale: () => lockScope(),
    });
  }, [userId, expiresAt]);

  return (
    <>
      {children}
      {userId !== null && legacy !== "ignore" && <LegacyDataPrompt userId={userId} />}
    </>
  );
}
