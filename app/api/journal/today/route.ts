// GET /api/journal/today?since=<ISO> — « ai-je déjà écrit aujourd'hui ? »
//
// Utilisé par le rappel d'écriture du journal (lib/agenda/notifications) :
// `since` est minuit à l'heure LOCALE de l'appareil, pour respecter le jour
// de l'élève. Ne renvoie qu'un booléen pour le compte de la session — jamais
// le contenu des pages — et ne crée ni ne modifie rien.

import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const NO_STORE = { "Cache-Control": "no-store" };
// Un « début de journée » plausible : au plus 36 h en arrière (fuseaux
// extrêmes, changement d'heure), jamais dans le futur.
const MAX_PAST_MS = 36 * 60 * 60 * 1000;
const MAX_FUTURE_MS = 60 * 1000;

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401, headers: NO_STORE });

  const raw = request.nextUrl.searchParams.get("since") ?? "";
  const since = new Date(raw);
  const now = Date.now();
  if (!raw || Number.isNaN(since.getTime()) || since.getTime() < now - MAX_PAST_MS || since.getTime() > now + MAX_FUTURE_MS) {
    return NextResponse.json({ error: "invalid_since" }, { status: 400, headers: NO_STORE });
  }

  const count = await prisma.entry.count({ where: { userId: user.id, createdAt: { gte: since } } });
  return NextResponse.json({ wrote: count > 0 }, { headers: NO_STORE });
}
