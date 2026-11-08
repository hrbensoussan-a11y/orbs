import Link from "next/link";
import { ArrowLeft, LogOut, GraduationCap, Gem, ChevronRight, Coins } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { logout } from "@/app/actions/auth";
import { parseAvatar } from "@/lib/avatar/config";
import { AvatarCard } from "@/components/avatar/AvatarCard";
import { AccountForm } from "@/components/AccountForm";
import { FamilySettings } from "@/components/family/FamilySettings";
import { getBillingState } from "@/lib/billing/store";
import { PLANS } from "@/lib/billing/plans";
import { formatInt } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function ComptePage() {
  const user = await requireUser();
  const avatar = parseAvatar(user.avatar);
  const displayName = user.name?.trim() || user.email.split("@")[0];
  const meta = [user.schoolClass, user.school].filter(Boolean).join(" · ");
  const billing = await getBillingState(user.id);
  const planName = PLANS[billing.plan].name;

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

      {/* Abonnement & crédits */}
      <Link
        href="/abonnement"
        className="card p-5 flex items-center gap-3.5 transition-transform hover:-translate-y-px"
      >
        <span className="icon-chip lilac">
          <Gem size={22} strokeWidth={1.9} aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-semibold leading-tight">{planName}</span>
          <span className="flex items-center gap-1.5 text-sm text-ink-2">
            <Coins size={14} aria-hidden style={{ color: "var(--amber)" }} />
            {billing.hasPaidAccess
              ? `${formatInt(billing.wallet.balance)} crédits · gérer mon abonnement`
              : "Voir les offres Plus & Ultimate"}
          </span>
        </span>
        <ChevronRight size={18} className="text-ink-3 shrink-0" aria-hidden />
      </Link>

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
