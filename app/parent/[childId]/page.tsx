import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, X } from "lucide-react";
import { requireParent } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  CHALLENGE_KINDS,
  STICKERS,
  daysAgo,
  displayName,
  isLinked,
  levelInfo,
  liveStreak,
  loadChallenges,
  readSummary,
  type ChallengeKind,
} from "@/lib/family";
import { xpForLevel } from "@/lib/learn/progress";
import { MOODS } from "@/lib/definitions";
import { SUBJECT_TONE } from "@/lib/learn/types";
import { BadgeShelf, ChallengeCard, Garden, LevelRing, Meter } from "@/components/family/Bits";
import { ChallengeComposer, CheerComposer } from "@/components/family/Forms";
import { cancelChallenge } from "@/app/actions/family";

export const dynamic = "force-dynamic";

const EXAMPLES: Record<ChallengeKind, string> = {
  streak: "Série",
  reviews: "Cartes révisées",
  mastered: "Cartes maîtrisées",
  focus: "Concentration",
  journal: "Journal",
};

function ago(d: Date | null): string {
  if (!d) return "jamais";
  const min = Math.round((Date.now() - d.getTime()) / 60000);
  if (min < 2) return "à l’instant";
  if (min < 60) return `il y a ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `il y a ${h} h`;
  return `il y a ${Math.round(h / 24)} j`;
}

export default async function ChildPage({ params }: PageProps<"/parent/[childId]">) {
  const parent = await requireParent();
  const { childId } = await params;
  if (!(await isLinked(parent.id, childId))) notFound();

  const child = await prisma.user.findUnique({
    where: { id: childId },
    select: {
      id: true, email: true, name: true, firstName: true, avatar: true,
      schoolClass: true, school: true, learnSnapshot: true, learnSyncedAt: true, shareMood: true,
    },
  });
  if (!child) notFound();

  const s = readSummary(child.learnSnapshot);
  const { level, progress } = levelInfo(s);
  const streak = liveStreak(s);
  const name = displayName(child);

  const weekAgo = daysAgo(7);
  const [pagesWeek, moods, challenges, cheers] = await Promise.all([
    prisma.entry.count({ where: { userId: child.id, createdAt: { gte: weekAgo }, content: { not: "" } } }),
    child.shareMood
      ? prisma.entry.findMany({
          where: { userId: child.id, entryDate: { gte: weekAgo }, mood: { not: null } },
          select: { mood: true, entryDate: true },
          orderBy: { entryDate: "asc" },
        })
      : Promise.resolve([]),
    loadChallenges(child.id, s, { fromId: parent.id }),
    prisma.cheer.findMany({
      where: { fromId: parent.id, toId: child.id },
      orderBy: { createdAt: "desc" },
      take: 5,
    }),
  ]);

  const weekActions = Object.entries(s.days)
    .filter(([k]) => new Date(k) >= weekAgo)
    .reduce((n, [, v]) => n + v, 0);
  const subjects = new Map<string, { cards: number; mastered: number }>();
  for (const d of s.decks) {
    const cur = subjects.get(d.subject) ?? { cards: 0, mastered: 0 };
    cur.cards += d.cards;
    cur.mastered += d.mastered;
    subjects.set(d.subject, cur);
  }

  const kinds = (Object.keys(CHALLENGE_KINDS) as ChallengeKind[]).map((k) => ({
    value: k,
    emoji: CHALLENGE_KINDS[k].emoji,
    example: EXAMPLES[k],
    presets: CHALLENGE_KINDS[k].presets,
  }));

  return (
    <div className="stagger flex flex-col gap-4">
      <Link href="/parent" className="btn-ghost self-start !px-3">
        <ArrowLeft size={16} aria-hidden /> Mes enfants
      </Link>

      {/* Fiche personnage */}
      <section className="card p-6 flex flex-col sm:flex-row items-center gap-5 text-center sm:text-left">
        <LevelRing avatar={child.avatar} level={level} progress={progress} size={120} />
        <div className="flex-1 min-w-0 w-full">
          <h1 className="text-2xl font-semibold display leading-tight">{name}</h1>
          {(child.schoolClass || child.school) && (
            <p className="text-sm text-ink-3">{[child.schoolClass, child.school].filter(Boolean).join(" · ")}</p>
          )}
          <div className="mt-3">
            <div className="flex justify-between text-xs text-ink-3 mb-1">
              <span>{s.xp} XP</span>
              <span>Niveau {level + 1} à {xpForLevel(level + 1)} XP</span>
            </div>
            <Meter value={progress} label="Progression vers le niveau suivant" />
          </div>
          <p className="text-xs text-ink-3 mt-2">Dernière synchro : {ago(child.learnSyncedAt)}</p>
        </div>
      </section>

      {/* Compteurs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { e: "🔥", v: `${streak} j`, l: "Série", cls: streak ? "flame" : "" },
          { e: "🃏", v: weekActions, l: "Actions (7 j)", cls: "" },
          { e: "🧠", v: s.mastered, l: "Cartes maîtrisées", cls: "" },
          { e: "📓", v: pagesWeek, l: "Pages de journal (7 j)", cls: "" },
        ].map((t) => (
          <div key={t.l} className="card p-4 text-center">
            <div className="text-2xl" aria-hidden><span className={t.cls}>{t.e}</span></div>
            <div className="text-xl font-semibold display mt-1 tabular-nums">{t.v}</div>
            <div className="text-xs text-ink-3">{t.l}</div>
          </div>
        ))}
      </div>

      {/* Jardin */}
      <section className="card p-5">
        <h2 className="font-semibold">Son jardin 🌿</h2>
        <p className="text-sm text-ink-3 mb-3">Chaque jour de révision fait pousser une plante.</p>
        <Garden days={s.days} />
      </section>

      {/* Défis */}
      <section className="card p-5">
        <h2 className="font-semibold mb-3">Défis 🎯</h2>
        <div className="flex flex-col gap-2.5 mb-3">
          {challenges.length === 0 && (
            <p className="text-sm text-ink-3">Aucun défi pour l’instant. Lance le premier, avec une petite récompense à la clé !</p>
          )}
          {challenges.map((c) => (
            <ChallengeCard
              key={c.id}
              c={c}
              footer={
                !c.completedAt && (
                  <form action={cancelChallenge} className="mt-2">
                    <input type="hidden" name="id" value={c.id} />
                    <button type="submit" className="text-xs text-ink-3 inline-flex items-center gap-1 hover:text-ink-2">
                      <X size={12} aria-hidden /> Retirer
                    </button>
                  </form>
                )
              }
            />
          ))}
        </div>
        <ChallengeComposer childId={child.id} kinds={kinds} />
      </section>

      {/* Encouragement */}
      <section className="card p-5">
        <h2 className="font-semibold">Envoyer un encouragement 💌</h2>
        <p className="text-sm text-ink-3 mb-3">Il apparaîtra sur son accueil.</p>
        <CheerComposer childId={child.id} stickers={STICKERS} />
        {cheers.length > 0 && (
          <ul className="mt-4 flex flex-col gap-1.5 text-sm">
            {cheers.map((c) => (
              <li key={c.id} className="flex items-center gap-2 text-ink-2">
                <span className="text-lg" aria-hidden>{c.sticker}</span>
                <span className="truncate flex-1">{c.message || "—"}</span>
                <span className="text-xs text-ink-3 shrink-0">{c.seenAt ? "👀 vu" : "envoyé"}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Matières */}
      <section className="card p-5">
        <h2 className="font-semibold mb-3">Matières révisées 📚</h2>
        {subjects.size === 0 ? (
          <p className="text-sm text-ink-3">Pas encore de fiches de révision.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {[...subjects.entries()].map(([subject, v]) => (
              <div key={subject}>
                <div className="flex justify-between text-sm mb-1">
                  <span className="font-semibold">{subject}</span>
                  <span className="text-ink-3 tabular-nums">{v.mastered}/{v.cards} maîtrisées</span>
                </div>
                <Meter value={v.cards ? v.mastered / v.cards : 0} tone={SUBJECT_TONE[subject] ?? "green"} label={subject} />
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Badges */}
      <section className="card p-5">
        <h2 className="font-semibold mb-3">Collection de badges 🏅</h2>
        <BadgeShelf earned={s.badges} />
      </section>

      {/* Humeur */}
      <section className="card p-5">
        <h2 className="font-semibold mb-1">Météo de la semaine</h2>
        {!child.shareMood ? (
          <p className="text-sm text-ink-3">🔒 {name} garde son humeur privée. C’est son choix.</p>
        ) : moods.length === 0 ? (
          <p className="text-sm text-ink-3">Pas d’humeur notée cette semaine.</p>
        ) : (
          <div className="flex gap-2 flex-wrap mt-2">
            {moods.map((m, i) => (
              <span key={i} className="flex flex-col items-center text-xs text-ink-3">
                <span className="text-2xl">{MOODS.find((x) => x.value === m.mood)?.emoji}</span>
                {m.entryDate.toLocaleDateString("fr-FR", { weekday: "short" })}
              </span>
            ))}
          </div>
        )}
        <p className="text-xs text-ink-3 mt-3">Le contenu du journal n’est jamais partagé.</p>
      </section>
    </div>
  );
}
