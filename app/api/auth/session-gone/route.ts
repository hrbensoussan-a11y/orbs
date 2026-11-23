import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionPayload } from "@/lib/auth";
import { SESSION_COOKIE, signAccountGone } from "@/lib/session";

// Session signée pour un compte qui n'existe plus (supprimé depuis un autre
// appareil). Appelée par requireUser au lieu d'une redirection directe vers
// /login, qui bouclerait avec le proxy.
//
//   - compte toujours existant (course, erreur passagère) : retour à l'app ;
//   - compte disparu : on supprime le cookie et on transmet à l'écran de
//     connexion un jeton SIGNÉ qui prouve la disparition, pour que cet
//     appareil efface les données locales de CE compte, et seulement de lui.
//
// Effet de bord limité au cookie du visiteur lui-même et seulement si son
// compte n'existe plus : sans danger même déclenché par un lien externe.
export async function GET(request: NextRequest) {
  const payload = await getSessionPayload();
  if (!payload?.userId) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const exists = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: { id: true },
  });
  if (exists) return NextResponse.redirect(new URL("/", request.url));

  const url = new URL("/login", request.url);
  url.searchParams.set("gone", await signAccountGone(payload.userId));
  const res = NextResponse.redirect(url);
  res.cookies.delete(SESSION_COOKIE);
  return res;
}
