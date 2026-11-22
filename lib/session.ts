// Cœur de session : signature/vérification JWT avec `jose`.
//
// Ce module n'importe PAS `next/headers` afin de rester utilisable dans
// le runtime edge (le proxy s'en sert pour un contrôle optimiste). La
// gestion des cookies est dans `lib/auth.ts` (runtime Node).
import { SignJWT, jwtVerify } from "jose";

export const SESSION_COOKIE = "orbs_session";
export const SESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1000; // 30 jours

export type SessionPayload = {
  userId: string;
  expiresAt: string; // ISO
  /**
   * `true` pour une session ouverte depuis que les données locales sont
   * cloisonnées par compte. Absent : la session date d'avant — l'élève était
   * déjà connecté au moment de la mise à jour (voir lib/legacyStorage).
   */
  scoped?: boolean;
};

const secret = process.env.SESSION_SECRET;
if (!secret) {
  // Échoue tôt et clairement plutôt que d'émettre des sessions non signées.
  throw new Error(
    "SESSION_SECRET manquant. Copier .env.example vers .env (voir README).",
  );
}
const encodedKey = new TextEncoder().encode(secret);

export async function encrypt(payload: SessionPayload): Promise<string> {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(encodedKey);
}

export async function decrypt(
  token: string | undefined,
): Promise<SessionPayload | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, encodedKey, {
      algorithms: ["HS256"],
    });
    if (typeof payload.userId !== "string") return null;
    return {
      userId: payload.userId,
      expiresAt: String(payload.expiresAt ?? ""),
      scoped: payload.scoped === true,
    };
  } catch {
    // Signature invalide ou token expiré.
    return null;
  }
}

// ---------------------------------------------------------------------------
// Jeton « compte disparu »
//
// Quand un navigateur présente une session valide pour un compte qui n'existe
// plus (supprimé depuis un autre appareil), le serveur le prouve avec ce
// jeton signé, transmis à l'écran de connexion : seul un jeton émis par le
// serveur peut faire effacer les données locales d'un compte. Une simple URL
// fabriquée à la main (`?gone=<id>`) n'efface donc jamais rien.
//
// Le jeton porte `goneUserId` (et non `userId`) : `decrypt` le refuse comme
// session, et `verifyAccountGone` refuse une session comme preuve.
// ---------------------------------------------------------------------------

const GONE_PURPOSE = "account-gone";
const GONE_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

export async function signAccountGone(userId: string): Promise<string> {
  return new SignJWT({ purpose: GONE_PURPOSE, goneUserId: userId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("15m")
    .sign(encodedKey);
}

/** Identifiant du compte disparu prouvé par le jeton, ou null. */
export async function verifyAccountGone(token: string | undefined): Promise<string | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, encodedKey, { algorithms: ["HS256"] });
    if (payload.purpose !== GONE_PURPOSE) return null;
    const id = payload.goneUserId;
    return typeof id === "string" && GONE_ID_RE.test(id) ? id : null;
  } catch {
    return null;
  }
}
