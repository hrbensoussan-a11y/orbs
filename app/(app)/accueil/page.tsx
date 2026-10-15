import Link from "next/link";
import {
  Settings,
  CreditCard,
  UtensilsCrossed,
  UserRoundX,
  MessagesSquare,
  ChevronDown,
} from "lucide-react";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AppearanceButton } from "@/components/AppearanceButton";
import { Avatar } from "@/components/avatar/Avatar";
import { FamilyCorner } from "@/components/family/StudentFamily";
import { MoyenneCard } from "@/components/notes/MoyenneCard";
import { RappelsCard } from "@/components/home/RappelsCard";
import { ProchainsCours } from "@/components/home/ProchainsCours";

export const dynamic = "force-dynamic";

// Tuiles de la scolarité : rien d'affiché tant que le compte de l'école
// (Pronote) n'est pas connecté.
const TILES = [
  { key: "cartes", label: "Cartes", Icon: CreditCard, tone: "amber" },
  { key: "menu", label: "Menu", Icon: UtensilsCrossed, tone: "green" },
  { key: "absences", label: "Absences", Icon: UserRoundX, tone: "coral" },
  { key: "messages", label: "Messages", Icon: MessagesSquare, tone: "sky" },
] as const;

export default async function AccueilPage() {
  const user = await requireUser();
  const name = user.name?.trim() || user.email.split("@")[0];

  // A-t-on écrit une page de journal aujourd'hui ? (pour le rappel)
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const wroteToday =
    (await prisma.entry.count({
      where: { userId: user.id, createdAt: { gte: startOfDay } },
    })) > 0;

  return (
    <div className="mx-auto max-w-xl px-4 pt-[calc(env(safe-area-inset-top,0px)+18px)]">
      {/* Barre profil */}
      <div className="flex items-center gap-2 mb-5">
        <Link
          href="/compte"
          className="glass-strong flex items-center gap-2.5 rounded-full pl-1.5 pr-3 py-1.5"
          aria-label="Mon compte"
        >
          <Avatar config={user.avatar} size={38} className="shrink-0" />
          <span className="font-semibold leading-none">{name}</span>
          <ChevronDown size={16} className="text-ink-3" aria-hidden />
        </Link>
        <div className="ml-auto flex items-center gap-2">
          <AppearanceButton />
          <Link href="/settings" className="glass-strong grid place-items-center h-11 w-11 rounded-full text-ink-2" title="Réglages" aria-label="Réglages">
            <Settings size={19} strokeWidth={1.8} aria-hidden />
          </Link>
        </div>
      </div>

      <div className="stagger flex flex-col gap-4">
        <FamilyCorner userId={user.id} />

        {/* Rappels du jour (révisions + devoirs + journal) */}
        <RappelsCard wroteToday={wroteToday} />

        {/* Tuiles scolarité (pas encore connectées) */}
        <div className="grid grid-cols-2 gap-3.5">
          {TILES.map((t) => (
            <div key={t.key} className="card p-3.5 flex items-center gap-3">
              <span className={`icon-chip ${t.tone}`}>
                <t.Icon size={22} strokeWidth={1.9} aria-hidden />
              </span>
              <span className="min-w-0">
                <span className="block font-semibold leading-tight truncate">{t.label}</span>
                <span className="block text-sm text-ink-3 leading-snug">Pas encore connecté</span>
              </span>
            </div>
          ))}
        </div>

        {/* Prochains cours (lus dans l'agenda) */}
        <ProchainsCours />

        {/* Mes notes (réel — saisies à la main) */}
        <MoyenneCard />

        <p className="text-center text-xs text-ink-3 px-6">
          Les cartes, le menu, les absences et les messages s’afficheront quand
          ton compte de l’école (Pronote) sera connecté.
        </p>
      </div>
    </div>
  );
}
