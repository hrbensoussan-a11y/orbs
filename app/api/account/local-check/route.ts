import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { findGoneUserIds } from "@/lib/account";

// Nettoyage des AUTRES comptes d'un appareil partagé.
//
// Un appareil peut garder les données locales d'un compte supprimé ailleurs,
// alors que sa session a déjà expiré (l'autre mécanisme, /api/auth/
// session-gone, ne se déclenche que si la session est encore valide). Quand
// quelqu'un se connecte sur cet appareil, son navigateur envoie ici les
// IDENTIFIANTS des autres espaces locaux (jamais leurs données) ; on répond
// lesquels n'existent plus, et le navigateur n'efface que ceux-là.
//
// Réservé aux sessions valides ; 20 identifiants au plus, au format attendu.
// Une erreur de base de données renvoie 503 : jamais « disparu » par défaut.
const MAX_IDS = 20;
const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  const raw = (body as { ids?: unknown })?.ids;
  if (!Array.isArray(raw) || raw.length > MAX_IDS) {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  const ids = [...new Set(raw.filter((id): id is string => typeof id === "string" && ID_RE.test(id)))]
    .filter((id) => id !== user.id);

  try {
    return NextResponse.json({ gone: await findGoneUserIds(ids) });
  } catch {
    return NextResponse.json({ error: "unavailable" }, { status: 503 });
  }
}
