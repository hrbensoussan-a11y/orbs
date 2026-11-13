import type { ReactNode } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Bell,
  ChevronRight,
  Database,
  Download,
  Hash,
  LogOut,
  Palette,
  Sparkles,
  User,
} from "lucide-react";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { updateSettings } from "@/app/actions/settings";
import { logout } from "@/app/actions/auth";
import { AppearanceButton } from "@/components/AppearanceButton";
import { AppearanceExtras } from "@/components/appearance/AppearanceExtras";
import { AiOrbSettings } from "@/components/ai/AiOrbSettings";
import { AiTagsSettings } from "@/components/ai/AiTagsSettings";
import { NotificationSettings } from "@/components/agenda/NotificationSettings";
import { ConfirmSubmit } from "@/components/ConfirmSubmit";

export const dynamic = "force-dynamic";

type ChipColor = "green" | "amber" | "coral" | "sky" | "lilac";

/** En-tête de section : pastille d'icône pastel + titre + sous-titre. */
function Section({
  icon,
  color,
  title,
  subtitle,
  children,
}: {
  icon: ReactNode;
  color: ChipColor;
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <section className="card p-5">
      <header className="flex items-center gap-3 mb-4">
        <span className={`icon-chip ${color}`} aria-hidden>
          {icon}
        </span>
        <div className="min-w-0">
          <h2 className="font-semibold leading-tight">{title}</h2>
          {subtitle && (
            <p className="text-sm text-ink-3 leading-snug">{subtitle}</p>
          )}
        </div>
      </header>
      {children}
    </section>
  );
}

/** Ligne de réglage : libellé + explication à gauche, contrôle à droite. */
function Row({
  title,
  desc,
  children,
  divider,
}: {
  title: string;
  desc?: string;
  children: ReactNode;
  divider?: boolean;
}) {
  return (
    <div
      className={`flex items-center justify-between gap-4 ${
        divider ? "border-t border-line pt-4 mt-4" : ""
      }`}
    >
      <div className="min-w-0">
        <p>{title}</p>
        {desc && <p className="text-sm text-ink-2">{desc}</p>}
      </div>
      {children}
    </div>
  );
}

const TEXT_SIZES = [
  ["sm", "Petite"],
  ["base", "Normale"],
  ["lg", "Grande"],
] as const;

export default async function SettingsPage() {
  const user = await requireUser();
  const settings = await prisma.settings.findUnique({
    where: { userId: user.id },
  });
  const fontSize = settings?.fontSize ?? "base";

  return (
    <div className="mx-auto max-w-xl px-4 pt-[calc(env(safe-area-inset-top,0px)+18px)] pb-10 flex flex-col gap-4">
      {/* En-tête */}
      <div className="flex items-center gap-3 mb-1">
        <Link href="/accueil" className="btn-ghost !px-2.5" aria-label="Retour">
          <ArrowLeft size={18} aria-hidden />
        </Link>
        <div>
          <h1 className="text-2xl font-semibold leading-tight">Réglages</h1>
          <p className="text-sm text-ink-3">
            Personnalise Orbs et gère ton compte.
          </p>
        </div>
      </div>

      {/* Apparence */}
      <Section
        icon={<Palette size={20} />}
        color="green"
        title="Apparence"
        subtitle="Thème, fond, taille du texte et animations."
      >
        <Row
          title="Thème & fond"
          desc="Clair, anti-lumière bleue, sombre, luminosité, fonds."
        >
          <AppearanceButton variant="row" />
        </Row>

        {/* Taille du texte — contrôle segmenté + enregistrement */}
        <form action={updateSettings} className="border-t border-line pt-4 mt-4">
          <div className="flex items-center justify-between gap-4 mb-3">
            <div className="min-w-0">
              <p>Taille du texte</p>
              <p className="text-sm text-ink-2">Pour lire plus confortablement.</p>
            </div>
            <button type="submit" className="btn-primary flex-none">
              Enregistrer
            </button>
          </div>
          <div className="seg" role="radiogroup" aria-label="Taille du texte">
            {TEXT_SIZES.map(([value, label]) => (
              <label key={value}>
                <input
                  type="radio"
                  name="fontSize"
                  value={value}
                  defaultChecked={fontSize === value}
                />
                {label}
              </label>
            ))}
          </div>
        </form>

        {/* Réduire les animations + réinitialiser l'apparence */}
        <div className="border-t border-line pt-4 mt-4">
          <AppearanceExtras />
        </div>
      </Section>

      {/* Notifications — rappels sonores de l'agenda */}
      <Section
        icon={<Bell size={20} />}
        color="amber"
        title="Notifications"
        subtitle="Un rappel sonore quand un cours ou des devoirs approchent."
      >
        <p className="text-sm text-ink-2 mb-4">
          Choisis ta sonnerie et le moment où être prévenu·e.
        </p>
        <NotificationSettings />
      </Section>

      {/* Assistant IA — la bulle */}
      <Section
        icon={<Sparkles size={20} />}
        color="lilac"
        title="Assistant IA"
        subtitle="Le petit rond qui ouvre l’assistant sur toutes les pages."
      >
        <AiOrbSettings />
      </Section>

      {/* Commandes de l'IA */}
      <Section
        icon={<Hash size={20} />}
        color="sky"
        title="Commandes de l’IA"
        subtitle="Des raccourcis à taper dans le chat."
      >
        <p className="text-sm text-ink-2 mb-4">
          Dans le chat, tape <span className="text-ink">#</span> pour donner un
          contexte ou un mode à l’assistant (par ex.{" "}
          <span className="text-ink">#réviser</span>,{" "}
          <span className="text-ink">#agenda</span>).
        </p>
        <AiTagsSettings />
      </Section>

      {/* Données */}
      <Section
        icon={<Database size={20} />}
        color="coral"
        title="Tes données"
        subtitle="Ton journal t’appartient."
      >
        <p className="text-sm text-ink-2 mb-4">
          L’export est libre et complet — c’est aussi ta sauvegarde. Garde une
          copie en lieu sûr.
        </p>
        <div className="flex flex-wrap gap-3">
          <a href="/api/export?format=json" className="btn-ghost" download>
            <Download size={16} aria-hidden /> Exporter en JSON
          </a>
          <a href="/api/export?format=md" className="btn-ghost" download>
            <Download size={16} aria-hidden /> Exporter en Markdown
          </a>
        </div>
      </Section>

      {/* Compte */}
      <Section
        icon={<User size={20} />}
        color="green"
        title="Compte"
        subtitle={`Connecté·e en tant que ${user.email}.`}
      >
        <Link href="/compte" className="btn-ghost w-full justify-between">
          <span className="inline-flex items-center gap-2">
            <User size={16} aria-hidden /> Gérer mon profil
          </span>
          <ChevronRight size={16} aria-hidden />
        </Link>

        <form action={logout} className="mt-3">
          <ConfirmSubmit
            className="btn-ghost"
            tone="danger"
            icon={<LogOut size={20} />}
            title="Se déconnecter ?"
            message="Tu devras te reconnecter avec ton e-mail et ton mot de passe. Tes données restent sur ton compte."
            confirmLabel="Oui, me déconnecter"
            cancelLabel="Non, rester"
          >
            <LogOut size={16} aria-hidden /> Se déconnecter
          </ConfirmSubmit>
        </form>
      </Section>
    </div>
  );
}
