// Côté élève : encouragements reçus et défis lancés par la famille.
import { prisma } from "@/lib/prisma";
import { daysAgo, displayName, loadChallenges, readSummary } from "@/lib/family";
import { markCheersSeen } from "@/app/actions/family";
import { ChallengeCard } from "./Bits";

export async function FamilyCorner({ userId }: { userId: string }) {
  const linked = await prisma.familyLink.count({ where: { childId: userId } });
  if (!linked) return null;

  const me = await prisma.user.findUnique({ where: { id: userId }, select: { learnSnapshot: true } });
  const [cheers, all] = await Promise.all([
    prisma.cheer.findMany({
      where: { toId: userId, seenAt: null },
      orderBy: { createdAt: "desc" },
      take: 6,
      include: { from: { select: { name: true, firstName: true, email: true } } },
    }),
    loadChallenges(userId, readSummary(me?.learnSnapshot ?? null)),
  ]);
  // Défis en cours + réussites récentes (pour la fête).
  const recent = daysAgo(3);
  const challenges = all.filter((c) => !c.completedAt || c.completedAt > recent);
  if (!cheers.length && !challenges.length) return null;

  return (
    <section className="card p-5 relative overflow-hidden">
      <h2 className="text-lg font-semibold mb-3">Ta famille 💌</h2>

      {cheers.length > 0 && (
        <div className="flex flex-col gap-2 mb-4">
          {cheers.map((c, i) => (
            <div key={c.id} className="flex items-center gap-3 rounded-[var(--r-inner)] bg-fill p-3">
              <span className="pop text-3xl leading-none" style={{ animationDelay: `${i * 120}ms` }} aria-hidden>
                {c.sticker}
              </span>
              <div className="min-w-0">
                <p className="text-sm text-ink-3">{displayName(c.from)} t’envoie</p>
                <p className="font-semibold leading-snug">{c.message || "un encouragement !"}</p>
              </div>
            </div>
          ))}
          <form action={markCheersSeen}>
            <button type="submit" className="btn-ghost w-full justify-center">Merci ! 🙌</button>
          </form>
        </div>
      )}

      {challenges.length > 0 && (
        <div className="flex flex-col gap-2.5">
          {challenges.map((c) => (
            <ChallengeCard
              key={c.id}
              c={c}
              celebrate
              footer={<p className="text-xs text-ink-3 mt-1.5">Défi lancé par {c.fromName}</p>}
            />
          ))}
        </div>
      )}
    </section>
  );
}
