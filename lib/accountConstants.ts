// Constantes du centre de compte partagées entre serveur et navigateur.
// Module SANS dépendance serveur : importable par les composants client.

/** Phrase à saisir pour confirmer la suppression d'un compte professionnel. */
export const PRO_DELETE_CONFIRM_PHRASE = "SUPPRIMER";

/**
 * /api/account/local-check : débit maximal PAR COMPTE et taille maximale du
 * corps. Un navigateur normal n'interroge qu'au plus toutes les 12 h par
 * appareil (lib/localAccountData) : ces limites ne gênent jamais l'usage réel.
 */
export const LOCAL_CHECK_LIMITS = { perMin: 6, perDay: 40 } as const;
export const LOCAL_CHECK_MAX_BODY_BYTES = 4096;
