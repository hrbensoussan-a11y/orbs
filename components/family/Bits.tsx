// Petits éléments visuels (serveur) de l'espace famille.
import { Avatar } from "@/components/avatar/Avatar";
import { BADGES } from "@/lib/learn/progress";
import type { ChallengeView } from "@/lib/family";
import { dayKey } from "@/lib/family";

const TONE_VAR: Record<string, string> = {
  green: "var(--green)",
  amber: "var(--amber)",
  coral: "var(--coral)",
  sky: "var(--sky)",
  lilac: "var(--lilac)",
};
export const toneVar = (t: string) => TONE_VAR[t] ?? "var(--green)";

/** Avatar entouré d'un anneau d'XP, avec le niveau en pastille. */
export function LevelRing({
  avatar,
  level,
  progress,
  size = 96,
}: {
  avatar: string | null;
  level: number;
  progress: number;
  size?: number;
}) {
  const stroke = 6;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <div className="level-ring shrink-0" style={{ width: size, height: size }}>
      <svg className="ring-track" width={size} height={size} aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--fill-2)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--green)"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - Math.max(0.02, progress))}
        />
      </svg>
      <Avatar config={avatar} size={size - stroke * 2 - 6} anim />
      <span className="level-pill">Niv. {level}</span>
    </div>
  );
}

export function Meter({ value, tone = "green", label }: { value: number; tone?: string; label: string }) {
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100);
  return (
    <div
      className="meter"
      role="progressbar"
      aria-label={label}
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
      style={{ ["--tone" as string]: toneVar(tone) }}
    >
      <span style={{ width: `${pct}%` }} />
    </div>
  );
}

const BADGE_MEDAL: Record<string, string> = {
  "first-deck": "📦",
  "streak-3": "🔥",
  "streak-7": "☄️",
  "streak-30": "🌋",
  goal: "🎯",
  "mastered-20": "🧠",
  "focus-5": "⏱️",
};

export function BadgeShelf({ earned }: { earned: string[] }) {
  const set = new Set(earned);
  return (
    <div className="grid grid-cols-4 gap-2">
      {BADGES.map((b) => {
        const ok = set.has(b.id);
        return (
          <div key={b.id} className={`badge-slot${ok ? "" : " locked"}`} title={ok ? "Obtenu" : "Pas encore"}>
            <span className="medal" aria-hidden>{BADGE_MEDAL[b.id] ?? "🏅"}</span>
            <span>{b.label}</span>
          </div>
        );
      })}
    </div>
  );
}

/** Jardin des 14 derniers jours : plus l'élève révise, plus ça pousse. */
export function Garden({ days }: { days: Record<string, number> }) {
  const cells: { key: string; n: number; label: string; today: boolean }[] = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = dayKey(d);
    cells.push({
      key,
      n: days[key] ?? 0,
      label: d.toLocaleDateString("fr-FR", { weekday: "narrow" }),
      today: i === 0,
    });
  }
  const plant = (n: number) =>
    n === 0 ? { e: "·", s: 0.9 } : n < 10 ? { e: "🌱", s: 1 } : n < 30 ? { e: "🌿", s: 1.25 } : n < 60 ? { e: "🌷", s: 1.4 } : { e: "🌳", s: 1.6 };
  return (
    <div className="garden" role="img" aria-label="Activité des 14 derniers jours">
      {cells.map((c, i) => {
        const p = plant(c.n);
        return (
          <div key={c.key} className={`garden-day${c.today ? " today" : ""}`} title={`${c.key} : ${c.n} action(s)`}>
            <span className="plant" style={{ fontSize: `${p.s}rem`, animationDelay: `${(i % 5) * 0.4}s` }}>{p.e}</span>
            <span>{c.label}</span>
          </div>
        );
      })}
    </div>
  );
}

const CONFETTI_COLORS = ["var(--green)", "var(--amber)", "var(--coral)", "var(--sky)", "var(--lilac)"];

export function Confetti() {
  return (
    <div className="confetti" aria-hidden>
      {Array.from({ length: 18 }, (_, i) => (
        <i
          key={i}
          style={{
            left: `${(i * 37) % 100}%`,
            background: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
            animationDelay: `${(i % 6) * 0.12}s`,
          }}
        />
      ))}
    </div>
  );
}

/** Carte d'un défi : progression, récompense, fête quand c'est réussi. */
export function ChallengeCard({
  c,
  footer,
  celebrate = false,
}: {
  c: ChallengeView;
  footer?: React.ReactNode;
  celebrate?: boolean;
}) {
  const done = !!c.completedAt;
  return (
    <div
      className="relative rounded-[var(--r-inner)] p-3.5"
      style={{ background: `color-mix(in srgb, ${toneVar(c.tone)} ${done ? 18 : 10}%, transparent)` }}
    >
      {done && celebrate && <Confetti />}
      <div className="flex items-start gap-3">
        <span className={`text-2xl leading-none${done ? " pop" : ""}`} aria-hidden>
          {done ? "🏆" : c.emoji}
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold leading-snug">{c.title}</p>
          {c.reward && (
            <p className="text-sm text-ink-2 mt-0.5">
              <span aria-hidden className="mr-1">🎁</span>{done ? "Récompense gagnée : " : "À la clé : "}
              <span className="font-semibold">{c.reward}</span>
            </p>
          )}
          <div className="mt-2.5 flex items-center gap-2.5">
            <div className="flex-1">
              <Meter value={c.current / c.target} tone={c.tone} label={c.title} />
            </div>
            <span className="text-xs font-semibold text-ink-2 tabular-nums">
              {done ? "Réussi !" : `${c.current}/${c.target}`}
            </span>
          </div>
          {footer}
        </div>
      </div>
    </div>
  );
}
