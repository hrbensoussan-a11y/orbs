// Proxy (ex-middleware, renommé en Next.js 16). Contrôle d'accès
// *optimiste* : redirige vite selon la présence d'une session valide.
// La vraie vérification a lieu dans les layouts/handlers serveur.
import { NextResponse, type NextRequest } from "next/server";
import { decrypt, SESSION_COOKIE } from "@/lib/session";

const AUTH_PAGES = new Set(["/login", "/register"]);

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Les routes API gèrent elles-mêmes leur authentification.
  if (pathname.startsWith("/api/")) return NextResponse.next();

  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const session = await decrypt(token);
  const isAuthPage = AUTH_PAGES.has(pathname);

  if (!session && !isAuthPage) {
    const url = new URL("/login", request.url);
    if (pathname !== "/") url.searchParams.set("from", pathname);
    return NextResponse.redirect(url);
  }

  if (session && (isAuthPage || pathname === "/")) {
    return NextResponse.redirect(new URL("/timeline", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    // Tout sauf les assets statiques et les fichiers d'image.
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt|xml)$).*)",
  ],
};
