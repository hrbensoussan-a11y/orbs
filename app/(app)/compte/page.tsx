import Link from "next/link";
import { ArrowLeft, LogOut, GraduationCap } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { logout } from "@/app/actions/auth";
import { parseAvatar } from "@/lib/avatar/config";
import { AvatarCard } from "@/components/avatar/AvatarCard";
import { AccountForm } from "@/components/AccountForm";
import { FamilySettings } from "@/components/family/FamilySettings";

export const dynamic = "force-dynamic";

export default async function ComptePage() {
  const user = await requireUser();
  const avatar = parseAvatar(user.avatar);
  const displayName = user.name?.trim() || user.email.split("@")[0];
  const meta = [user.schoolClass, user.school].filter(Boolean).join(" · ");

  return (
    <div className="mx-auto max-w-xl px-4 pt-[calc(env(safe-area-inset-top,0px)+18px)] flex flex-col gap-4">
      <div className="flex items-center gap-3 mb-1">
        <Link href="/accueil" className="btn-ghost !px-2.5" aria-label="Retour">
          <ArrowLeft size={18} aria-hidden />
        </Link>
        <h1 className="text-2xl font-semibold">Mon compte</h1>
      </div>

      {/* En-tête profil + avatar */}
      <section className="card p-6 flex flex-col items-center gap-3 text-center">
        <AvatarCard initial={avatar} />
        <div>
          <p className="text-xl font-semibold display leading-tight">{displayName}</p>
          <p className="text-sm text-ink-3">{user.email}</p>
          {meta && (
            <p className="mt-1 inline-flex items-center gap-1.5 text-sm text-ink-2">
              <GraduationCap size={15} aria-hidden /> {meta}
            </p>
          )}
        </div>
      </section>

      {/* Informations */}
      <section className="card p-5">
        <h2 className="font-semibold mb-4">Mes informations</h2>
        <AccountForm
          initial={{
            firstName: user.firstName ?? "",
            lastName: user.lastName ?? "",
            schoolClass: user.schoolClass ?? "",
            school: user.school ?? "",
            email: user.email,
          }}
        />
      </section>

      <FamilySettings userId={user.id} />

      {/* Compte */}
      <section className="card p-5">
        <h2 className="font-semibold mb-1">Session</h2>
        <p className="text-sm text-ink-2 mb-4">
          Tu peux te déconnecter à tout moment. Tes données restent sur ton compte.
        </p>
        <form action={logout}>
          <button type="submit" className="btn-ghost">
            <LogOut size={16} aria-hidden /> Se déconnecter
          </button>
        </form>
      </section>
    </div>
  );
}
