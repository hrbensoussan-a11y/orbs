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
    };
  } catch {
    // Signature invalide ou token expiré.
    return null;
  }
}
