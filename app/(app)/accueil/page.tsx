import Link from "next/link";
import {
  Settings,
  CreditCard,
  UtensilsCrossed,
  UserRoundX,
  MessagesSquare,
  ChevronDown,
  MapPin,
  User,
  Clock,
} from "lucide-react";
import { requireUser } from "@/lib/auth";
import { AppearanceButton } from "@/components/AppearanceButton";
import { Avatar } from "@/components/avatar/Avatar";
import { FamilyCorner } from "@/components/family/StudentFamily";

export const dynamic = "force-dynamic";

const TILES = [
  { key: "cartes", label: "Cartes", sub: "2 cartes", Icon: CreditCard, tone: "amber" },
  { key: "menu", label: "Menu", sub: "Menu du jour", Icon: UtensilsCrossed, tone: "green" },
  { key: "absences", label: "Absences", sub: "3 absences", Icon: UserRoundX, tone: "coral" },
  { key: "messages", label: "Messages", sub: "67 messages", Icon: MessagesSquare, tone: "sky" },
] as const;

const COURSES = [
  {
    start: "08:55",
    end: "09:55",
    title: "Numérique & Sciences Inf.",
    room: "Salle 206",
    teacher: "Baptiste V.",
    tag: "Travail dirigé",
    duration: "2 heures",
    tone: "sky",
  },
  {
    start: "10:10",
    end: "12:00",
    title: "Sciences de l’ingénieur",
    room: "Labo B5",
    teacher: "Hélière E.",
    tag: "Travail pratique",
    duration: "2 heures",
    tone: "amber",
  },
] as const;

const TONE: Record<string, string> = {
  green: "var(--green)",
  amber: "var(--amber)",
  coral: "var(--coral)",
  sky: "var(--sky)",
  lilac: "var(--lilac)",
};

function Sparkline() {
  // Petit graphe de démonstration (moyenne dans le temps).
  const pts = [8, 12, 9, 14, 11, 13, 10, 12, 11, 9, 12, 14, 13, 15, 14, 16, 15, 17];
  const w = 150, h = 56, max = 20, min = 6;
  const step = w / (pts.length - 1);
  const y = (v: number) => h - ((v - min) / (max - min)) * h;
  const line = pts.map((v, i) => `${i * step},${y(v).toFixed(1)}`).join(" ");
  const area = `0,${h} ${line} ${w},${h}`;
  const lastX = (pts.length - 1) * step;
  const lastY = y(pts[pts.length - 1]);
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="150" height="56" aria-hidden>
      <defs>
        <linearGradient id="spark" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--green)" stopOpacity="0.28" />
          <stop offset="100%" stopColor="var(--green)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={area} fill="url(#spark)" />
      <polyline points={line} fill="none" stroke="var(--green)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={lastX} cy={lastY} r="4.5" fill="var(--green)" />
      <circle cx={lastX} cy={lastY} r="9" fill="var(--green)" fillOpacity="0.18" />
    </svg>
  );
}

export default async function AccueilPage() {
  const user = await requireUser();
  const name = user.name?.trim() || user.email.split("@")[0];

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

        {/* Tuiles scolarité (aperçu) */}
        <div className="grid grid-cols-2 gap-3.5">
          {TILES.map((t) => (
            <div key={t.key} className="card p-3.5 flex items-center gap-3">
              <span className={`icon-chip ${t.tone}`}>
                <t.Icon size={22} strokeWidth={1.9} aria-hidden />
              </span>
              <span className="min-w-0">
                <span className="block font-semibold leading-tight truncate">{t.label}</span>
                <span className="block text-sm text-ink-3 truncate">{t.sub}</span>
              </span>
            </div>
          ))}
        </div>

        {/* Prochains cours */}
        <section className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">Prochains cours</h2>
            <span className="chip">Afficher plus</span>
          </div>
          <div className="flex flex-col gap-3">
            {COURSES.map((c, i) => (
              <div
                key={i}
                className="flex gap-3.5 items-stretch rounded-[var(--r-inner)] p-3.5"
                style={{ background: `color-mix(in srgb, ${TONE[c.tone]} 12%, transparent)` }}
              >
                <div className="flex flex-col justify-center text-sm shrink-0 w-14">
                  <span className="font-semibold display">{c.start}</span>
                  <span className="text-ink-3">{c.end}</span>
                </div>
                <span className="w-1 rounded-full" style={{ background: TONE[c.tone] }} aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="font-semibold leading-snug" style={{ color: TONE[c.tone] }}>
                    {c.title}
                  </p>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1 text-sm text-ink-2">
                    <span className="inline-flex items-center gap-1"><MapPin size={14} aria-hidden /> {c.room}</span>
                    <span className="inline-flex items-center gap-1"><User size={14} aria-hidden /> {c.teacher}</span>
                  </div>
                  <div className="flex items-center gap-3 mt-2">
                    <span
                      className="rounded-full bg-fill2 px-2.5 py-0.5 text-xs font-semibold"
                      style={{ color: TONE[c.tone] }}
                    >
                      {c.tag}
                    </span>
                    <span className="inline-flex items-center gap-1 text-sm text-ink-3">
                      <Clock size={13} aria-hidden /> {c.duration}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Moyenne */}
        <section className="card p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold">Moyenne</h2>
            <span className="chip">Afficher plus</span>
          </div>
          <div className="flex items-center justify-between gap-4">
            <Sparkline />
            <div className="text-right">
              <p className="leading-none">
                <span className="display text-4xl font-semibold text-green-ink">15,53</span>
                <span className="text-ink-3 text-lg"> /20</span>
              </p>
              <p className="font-semibold mt-1 flex items-center justify-end gap-1">
                Moyenne des matières <ChevronDown size={16} className="text-ink-3" aria-hidden />
              </p>
              <p className="text-sm text-ink-3">par l’établissement</p>
            </div>
          </div>
        </section>

        {/* Note honnête */}
        <p className="text-center text-xs text-ink-3 px-6">
          Aperçu de l’accueil. La scolarité (Pronote / École Directe) sera branchée
          par l’équipe. Le journal, lui, fonctionne déjà.
        </p>
      </div>
    </div>
  );
}
