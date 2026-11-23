import { Clock, Info, KeyRound, Mail, ShieldCheck, Smartphone } from "lucide-react";
import { formatLongDate } from "@/lib/format";
import { PasswordForm } from "./PasswordForm";

export function SecuritySection({
  email,
  isPro,
  createdAt,
}: {
  email: string;
  isPro: boolean;
  createdAt: Date;
}) {
  return (
    <section id="securite" className="card p-5 flex flex-col gap-5 scroll-mt-20">
      <header className="flex items-center gap-3">
        <span className="icon-chip sky">
          <ShieldCheck size={20} aria-hidden />
        </span>
        <div>
          <h2 className="font-semibold leading-tight">Sécurité & connexion</h2>
          <p className="text-sm text-ink-3 leading-snug">
            Ton mot de passe et les informations de connexion à ton compte.
          </p>
        </div>
      </header>

      {/* Mot de passe */}
      <div className="border-t border-line pt-4">
        {isPro ? (
          <div className="rounded-[var(--r-inner)] bg-fill p-4 flex items-start gap-3">
            <Info size={18} className="shrink-0 mt-0.5 text-ink-3" aria-hidden />
            <p className="text-sm text-ink-2">
              Ce compte professionnel se connecte uniquement avec le code à 8 chiffres
              qui t’a été transmis : il n’a pas de mot de passe personnel à modifier.
            </p>
          </div>
        ) : (
          <PasswordForm />
        )}
      </div>

      {/* Informations de connexion */}
      <div className="border-t border-line pt-4 flex flex-col gap-3">
        <h3 className="text-sm font-semibold text-ink-2">Informations de connexion</h3>
        <div className="flex items-start gap-2.5 text-sm">
          {isPro ? (
            <>
              <KeyRound size={16} className="shrink-0 mt-0.5 text-ink-3" aria-hidden />
              <span>Connexion par code professionnel, sans adresse e-mail.</span>
            </>
          ) : (
            <>
              <Mail size={16} className="shrink-0 mt-0.5 text-ink-3" aria-hidden />
              <span>
                Adresse de connexion : <strong>{email}</strong>
              </span>
            </>
          )}
        </div>
        <div className="flex items-start gap-2.5 text-sm">
          <Clock size={16} className="shrink-0 mt-0.5 text-ink-3" aria-hidden />
          <span>Compte créé le {formatLongDate(createdAt)}.</span>
        </div>
      </div>

      {/* Appareils connectés — honnêteté sur ce qui n'est pas (encore) possible */}
      <div className="border-t border-line pt-4">
        <h3 className="text-sm font-semibold text-ink-2 mb-2 flex items-center gap-2">
          <Smartphone size={16} aria-hidden className="text-ink-3" /> Appareils connectés
        </h3>
        {isPro ? (
          <p className="text-sm text-ink-2">
            L’accès à ce compte dépend uniquement du code professionnel : il n’est pas
            lié à un appareil ou à un mot de passe personnel.
          </p>
        ) : (
          <p className="text-sm text-ink-2">
            Ta connexion reste valable 30 jours sur chaque appareil, dans un cookie
            sécurisé que seul le serveur peut lire. Orbs ne propose pas encore de liste
            de tes appareils connectés ni de déconnexion à distance : changer ton mot de
            passe empêche une nouvelle connexion avec l’ancien, mais ne coupe pas une
            connexion déjà ouverte ailleurs. Cette fonctionnalité arrivera avec un futur
            suivi des sessions actives.
          </p>
        )}
      </div>
    </section>
  );
}
