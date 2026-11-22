import { CheckCircle2 } from "lucide-react";
import { AuthForm } from "@/components/AuthForm";
import { StorageScope } from "@/components/StorageScope";
import { PurgeGoneAccount } from "@/components/account/PurgeGoneAccount";
import { prisma } from "@/lib/prisma";
import { verifyAccountGone } from "@/lib/session";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const deleted = sp.deleted === "1";

  // Compte supprimé depuis un autre appareil : le serveur l'a prouvé par un
  // jeton signé (app/api/auth/session-gone). On revérifie qu'il n'existe
  // vraiment plus avant de faire effacer quoi que ce soit sur cet appareil.
  let goneUserId = await verifyAccountGone(typeof sp.gone === "string" ? sp.gone : undefined);
  if (goneUserId) {
    const still = await prisma.user.findUnique({ where: { id: goneUserId }, select: { id: true } });
    if (still) goneUserId = null;
  }

  return (
    <main className="min-h-dvh flex items-center justify-center px-4 py-12">
      {/* Hors compte : aucune donnée locale n'est accessible ici. */}
      <StorageScope userId={null} />
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="font-serif text-3xl">Orbs</h1>
          <p className="text-muted mt-2">Ton carnet t’attend.</p>
        </div>

        {goneUserId && <PurgeGoneAccount userId={goneUserId} />}
        {goneUserId && !deleted && (
          <div
            className="card px-4 py-3 text-sm flex items-start gap-2 mb-4"
            style={{ background: "color-mix(in srgb, var(--green) 12%, var(--glass))" }}
            role="status"
          >
            <CheckCircle2 size={16} className="mt-0.5 shrink-0" style={{ color: "var(--green-ink)" }} aria-hidden />
            <span>
              Ce compte a été supprimé. Les données qu’il avait laissées sur cet appareil
              viennent d’être effacées.
            </span>
          </div>
        )}

        {deleted && (
          <div
            className="card px-4 py-3 text-sm flex items-start gap-2 mb-4"
            style={{ background: "color-mix(in srgb, var(--green) 12%, var(--glass))" }}
            role="status"
          >
            <CheckCircle2 size={16} className="mt-0.5 shrink-0" style={{ color: "var(--green-ink)" }} aria-hidden />
            <span>Ton compte a bien été supprimé. À bientôt, peut-être !</span>
          </div>
        )}

        <div className="card p-6">
          <AuthForm mode="login" />
        </div>
      </div>
    </main>
  );
}
