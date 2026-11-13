import Link from "next/link";
import { ChevronRight, KeyRound } from "lucide-react";
import { requireParent } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { displayName, levelInfo, liveStreak, readSummary } from "@/lib/family";
import { LevelRing } from "@/components/family/Bits";
import { LinkChildForm } from "@/components/family/Forms";

export const dynamic = "force-dynamic";

export default async function ParentHome() {
  const parent = await requireParent();
  const links = await prisma.familyLink.findMany({
    where: { parentId: parent.id },
    orderBy: { createdAt: "asc" },
    include: {
      child: {
        select: {
          id: true, email: true, name: true, firstName: true, avatar: true,
          schoolClass: true, learnSnapshot: true,
          challengesToDo: {
            where: { fromId: parent.id, cancelled: false, completedAt: null },
            select: { id: true },
          },
        },
      },
    },
  });

  return (
    <div className="stagger flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold display">Bonjour {displayName(parent)} 👋</h1>
        <p className="text-ink-2 mt-1">
          Suis les progrès de tes enfants, encourage-les et lance-leur des défis.
        </p>
      </div>

      {links.map(({ child }) => {
        const s = readSummary(child.learnSnapshot);
        const { level, progress } = levelInfo(s);
        const streak = liveStreak(s);
        return (
          <Link key={child.id} href={`/parent/${child.id}`} className="card p-5 flex items-center gap-4 hover:shadow-[var(--shadow-float)] transition-shadow">
            <LevelRing avatar={child.avatar} level={level} progress={progress} size={78} />
            <div className="min-w-0 flex-1">
              <p className="text-lg font-semibold display leading-tight">{displayName(child)}</p>
              {child.schoolClass && <p className="text-sm text-ink-3">{child.schoolClass}</p>}
              <div className="flex flex-wrap gap-1.5 mt-2">
                <span className="chip"><span className={streak ? "flame" : ""}>🔥</span> {streak} j</span>
                <span className="chip">⭐ {s.xp} XP</span>
                <span className="chip">🏅 {s.badges.length}</span>
                {child.challengesToDo.length > 0 && (
                  <span className="chip">🎯 {child.challengesToDo.length} défi{child.challengesToDo.length > 1 ? "s" : ""}</span>
                )}
              </div>
            </div>
            <ChevronRight className="text-ink-3 shrink-0" aria-hidden />
          </Link>
        );
      })}

      <section className="card p-5">
        <div className="flex items-center gap-3 mb-3">
          <span className="icon-chip lilac"><KeyRound size={20} aria-hidden /></span>
          <div>
            <h2 className="font-semibold">{links.length ? "Ajouter un enfant" : "Relie le compte de ton enfant"}</h2>
            <p className="text-sm text-ink-3">
              Sur son appli : <b>Mon compte → Espace famille → Générer un code</b>.
            </p>
          </div>
        </div>
        <LinkChildForm />
      </section>

      <p className="text-center text-xs text-ink-3 px-6">
        🔒 Le contenu du journal reste privé : tu vois seulement combien de pages
        ont été écrites, et l’humeur si ton enfant l’a autorisé.
      </p>
    </div>
  );
}
