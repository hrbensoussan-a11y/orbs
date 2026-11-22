import Link from "next/link";
import { AlertTriangle, ArrowLeft, Ban } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { isProAccountEmail } from "@/lib/proAccess";
import { canDeleteAccount } from "@/lib/account";
import { stripeBlockMessage, type StripeBlockReason } from "@/lib/accountStripeCheck";
import { DeleteAccountFlow } from "@/components/account/DeleteAccountFlow";

export const dynamic = "force-dynamic";

const BLOCK_TITLE: Record<StripeBlockReason, (plan: string) => string> = {
  subscription_active: (plan) => `Abonnement ${plan} actif`,
  payment_pending: () => "Paiement en attente",
  stripe_unavailable: () => "Vérification momentanément impossible",
  stripe_unverifiable: () => "Abonnement à vérifier",
};

export default async function SupprimerComptePage() {
  const user = await requireUser();
  const isPro = isProAccountEmail(user.email);
  const block = await canDeleteAccount(user.id);

  return (
    <div className="mx-auto max-w-xl px-4 pt-[calc(env(safe-area-inset-top,0px)+18px)] pb-10 flex flex-col gap-4">
      <div className="flex items-center gap-3 mb-1">
        <Link href="/compte" className="btn-ghost !px-2.5" aria-label="Retour">
          <ArrowLeft size={18} aria-hidden />
        </Link>
        <h1 className="text-2xl font-semibold">Supprimer mon compte</h1>
      </div>

      <section className="card p-5">
        <div className="flex items-center gap-3 mb-3">
          <span className="icon-chip coral">
            <AlertTriangle size={20} aria-hidden />
          </span>
          <h2 className="font-semibold">Ce qui va disparaître</h2>
        </div>
        <ul className="text-sm text-ink-2 flex flex-col gap-1.5 list-disc pl-5">
          <li>Ton journal et toutes tes pages écrites</li>
          <li>Tes notes et moyennes</li>
          <li>Ta progression Apprendre (paquets, cartes, séries, badges)</li>
          <li>Ton avatar et tes préférences</li>
          <li>Ton abonnement et ton portefeuille de crédits</li>
          <li>Tes liens avec ta famille (parents ou enfants), encouragements et défis</li>
        </ul>
        <p className="text-sm text-ink-3 mt-3">
          Cette action est <strong>définitive</strong>. Si tu veux d’abord garder une
          copie, télécharge tes données depuis la page{" "}
          <Link href="/compte#donnees" className="underline">
            Mon compte
          </Link>
          .
        </p>
        <p className="text-sm text-ink-3 mt-2">
          Sur cet appareil, tout est effacé dès la confirmation. Sur tes autres
          appareils, les données gardées par le navigateur (agenda, notes, Apprendre,
          conversations IA…) sont effacées la prochaine fois qu’Orbs s’y ouvre avec une
          connexion internet. Un appareil qui n’ouvre plus Orbs les conserve : vide
          alors les données du site dans les réglages de son navigateur.
        </p>
      </section>

      {block.blocked ? (
        <section
          className="card p-5 flex items-start gap-3"
          style={{ background: "color-mix(in srgb, var(--amber) 10%, var(--glass))" }}
        >
          <Ban size={20} className="shrink-0 mt-0.5" style={{ color: "var(--amber)" }} aria-hidden />
          <div>
            <p className="font-semibold mb-1">{BLOCK_TITLE[block.reason](block.planName)}</p>
            <p className="text-sm text-ink-2">{stripeBlockMessage(block.reason, block.planName)}</p>
            {block.reason === "stripe_unavailable" ? (
              <Link href="/compte/supprimer" className="btn-primary mt-3 inline-flex">
                Réessayer
              </Link>
            ) : (
              <Link href="/abonnement" className="btn-primary mt-3 inline-flex">
                Gérer mon abonnement
              </Link>
            )}
          </div>
        </section>
      ) : (
        <section className="card p-5">
          <h2 className="font-semibold mb-4">Confirmer la suppression</h2>
          <DeleteAccountFlow isPro={isPro} />
        </section>
      )}
    </div>
  );
}
