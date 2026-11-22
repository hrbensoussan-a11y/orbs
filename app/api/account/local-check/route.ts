import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { findGoneUserIds } from "@/lib/account";
import { checkRateLimit } from "@/lib/ai/ratelimit";
import { LOCAL_CHECK_LIMITS, LOCAL_CHECK_MAX_BODY_BYTES } from "@/lib/accountConstants";

// Nettoyage des AUTRES comptes d'un appareil partagé.
//
// Un appareil peut garder les données locales d'un compte supprimé ailleurs,
// alors que sa session a déjà expiré (l'autre mécanisme, /api/auth/
// session-gone, ne se déclenche que si la session est encore valide). Quand
// quelqu'un se connecte sur cet appareil, son navigateur envoie ici les
// IDENTIFIANTS des autres espaces locaux (jamais leurs données) ; on répond
// lesquels n'existent plus, et le navigateur n'efface que ceux-là.
//
// Protections :
//   - sessions valides uniquement (401 sinon, avant toute lecture du corps) ;
//   - débit limité PAR COMPTE (limiteur déjà utilisé par l'IA, compteur
//     séparé) : un navigateur normal interroge au plus toutes les 12 h, la
//     limite ne gêne donc jamais l'usage réel mais rend tout sondage massif
//     inutile ;
//   - corps de 4 Ko au plus, 20 identifiants au plus, au format attendu ;
//   - réponse limitée aux identifiants DEMANDÉS, jamais celui de l'appelant,
//     jamais mise en cache ;
//   - erreur de base de données → 503 : jamais « disparu » par défaut.
// Toute réponse autre que 200 (401, 413, 429, 503…) n'efface RIEN sur
// l'appareil (lib/localAccountData → sweepOtherDeviceAccounts).
const MAX_IDS = 20;
const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const NO_STORE = { "Cache-Control": "no-store" };

function reply(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return NextResponse.json(body, { status, headers: { ...NO_STORE, ...headers } });
}

/** Lit le corps sans jamais en garder plus que `max` octets en mémoire. */
async function readBodyCapped(request: NextRequest, max: number): Promise<string | null> {
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > max) return null;
  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      await reader.cancel().catch(() => {});
      return null;
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const c of chunks) {
    bytes.set(c, offset);
    offset += c.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return reply({ error: "unauthorized" }, 401);

  const rate = checkRateLimit(`account-local-check:${user.id}`, LOCAL_CHECK_LIMITS);
  if (!rate.ok) {
    return reply({ error: "rate_limited" }, 429, { "Retry-After": String(rate.retryAfter) });
  }

  const text = await readBodyCapped(request, LOCAL_CHECK_MAX_BODY_BYTES);
  if (text === null) return reply({ error: "payload_too_large" }, 413);

  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return reply({ error: "bad_request" }, 400);
  }
  const raw = (body as { ids?: unknown })?.ids;
  if (!Array.isArray(raw) || raw.length > MAX_IDS) return reply({ error: "bad_request" }, 400);
  const ids = [...new Set(raw.filter((id): id is string => typeof id === "string" && ID_RE.test(id)))]
    .filter((id) => id !== user.id);

  try {
    return reply({ gone: await findGoneUserIds(ids) });
  } catch {
    return reply({ error: "unavailable" }, 503);
  }
}
