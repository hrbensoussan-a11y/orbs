import Link from "next/link";
import { ArrowLeft, LogOut, GraduationCap, Gem, ChevronRight, Coins, User } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logout } from "@/app/actions/auth";
import { parseAvatar } from "@/lib/avatar/config";
import { isProAccountEmail } from "@/lib/proAccess";
import { AvatarCard } from "@/components/avatar/AvatarCard";
import { AccountForm } from "@/components/AccountForm";
import { ConfirmSubmit } from "@/components/ConfirmSubmit";
import { FamilySettings } from "@/components/family/FamilySettings";
import { SecuritySection } from "@/components/account/SecuritySection";
import { DataSection } from "@/components/account/DataSection";
import { getBillingState } from "@/lib/billing/store";
import { PLANS } from "@/lib/billing/plans";
import { formatInt } from "@/lib/format";

export const dynamic = "force-dynamic";

const NAV = [
  { href: "#profil", label: "Profil" },
  { href: "#securite", label: "Sécurité" },
  { href: "#donnees", label: "Données" },
  { href: "#abonnement", label: "Abonnement" },
] as const;

export default async function ComptePage() {
  const user = await requireUser();
  const avatar = parseAvatar(user.avatar);
  const displayName = user.name?.trim() || user.email.split("@")[0];
  const meta = [user.schoolClass, user.school].filter(Boolean).join(" · ");
  const billing = await getBillingState(user.id);
  const planName = PLANS[billing.plan].name;
  const isPro = isProAccountEmail(user.email);

  // Un seul champ (createdAt) absent de `CurrentUser` : lu directement ici
  // plutôt que d'élargir la sélection partagée de lib/auth.ts.
  const account = await prisma.user.findUnique({
    where: { id: user.id },
    select: { createdAt: true },
  });

  return (
    <div className="mx-auto max-w-xl px-4 pt-[calc(env(safe-area-inset-top,0px)+18px)] pb-10 flex flex-col gap-4">
      <div className="flex items-center gap-3 mb-1">
        <Link href="/accueil" className="btn-ghost !px-2.5" aria-label="Retour">
          <ArrowLeft size={18} aria-hidden />
        </Link>
        <h1 className="text-2xl font-semibold">Mon compte</h1>
      </div>

      {/* Navigation rapide entre les sections */}
      <nav
        aria-label="Sections de Mon compte"
        className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1"
      >
        {NAV.map((n) => (
          <a key={n.href} href={n.href} className="chip shrink-0 hover:bg-fill2">
            {n.label}
          </a>
        ))}
      </nav>

      {/* En-tête profil + avatar */}
      <section id="profil" className="card p-6 flex flex-col items-center gap-3 text-center scroll-mt-20">
        <AvatarCard initial={avatar} />
        <div>
          <p className="text-xl font-semibold display leading-tight">{displayName}</p>
          {!isPro && <p className="text-sm text-ink-3">{user.email}</p>}
          {isPro && <p className="text-sm text-ink-3">Compte professionnel par code</p>}
          {meta && (
            <p className="mt-1 inline-flex items-center gap-1.5 text-sm text-ink-2">
              <GraduationCap size={15} aria-hidden /> {meta}
            </p>
          )}
        </div>
      </section>

      {/* Informations */}
      <section className="card p-5">
        <div className="flex items-center gap-3 mb-4">
          <span className="icon-chip green">
            <User size={20} aria-hidden />
          </span>
          <h2 className="font-semibold">Mes informations</h2>
        </div>
        <AccountForm
          isPro={isPro}
          initial={{
            firstName: user.firstName ?? "",
            lastName: user.lastName ?? "",
            schoolClass: user.schoolClass ?? "",
            school: user.school ?? "",
            email: user.email,
          }}
        />
      </section>

      {/* Sécurité & connexion */}
      <SecuritySection
        email={user.email}
        isPro={isPro}
        createdAt={account?.createdAt ?? new Date()}
      />

      {/* Mes données */}
      <DataSection />

      {/* Abonnement & crédits */}
      <Link
        id="abonnement"
        href="/abonnement"
        className="card p-5 flex items-center gap-3.5 transition-transform hover:-translate-y-px scroll-mt-20"
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
          <ConfirmSubmit
            className="btn-ghost"
            tone="danger"
            icon={<LogOut size={20} />}
            title="Se déconnecter ?"
            message={
              isPro
                ? "Tu devras ressaisir ton code professionnel pour te reconnecter. Tes données restent sur ton compte."
                : "Tu devras te reconnecter avec ton e-mail et ton mot de passe. Tes données restent sur ton compte."
            }
            confirmLabel="Oui, me déconnecter"
            cancelLabel="Non, rester"
          >
            <LogOut size={16} aria-hidden /> Se déconnecter
          </ConfirmSubmit>
        </form>
      </section>
    </div>
  );
}
