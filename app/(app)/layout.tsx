import type { CSSProperties } from "react";
import { getSessionPayload, requireStudent } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { BottomNav } from "@/components/BottomNav";
import { AiOrb } from "@/components/ai/AiOrb";
import { FocusTimer } from "@/components/learn/FocusTimer";
import { NotificationScheduler } from "@/components/agenda/NotificationScheduler";
import { AiHistoryKeeper } from "@/components/ai/AiHistoryKeeper";
import { toAiRetention } from "@/lib/ai/retention";
import { StorageScope } from "@/components/StorageScope";
import { readingStyle } from "@/lib/reading";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireStudent();
  const session = await getSessionPayload();
  const settings = await prisma.settings.findUnique({
    where: { userId: user.id },
  });

  // Confort de lecture (taille + espacement), appliqué aux zones de lecture.
  const style: CSSProperties = readingStyle(settings?.fontSize, settings?.lineSpacing);

  return (
    // Données locales (agenda, notes, paquets, IA…) : celles de CE compte
    // uniquement. `key` remonte tout si le compte change sans rechargement.
    <StorageScope
      key={user.id}
      userId={user.id}
      expiresAt={session?.expiresAt ?? null}
      // Session antérieure au cloisonnement : l'élève voyait déjà les données
      // locales de cet appareil, elles le suivent. Sinon, on lui demande.
      legacy={session?.scoped === false ? "continuity" : "ask"}
    >
      <div style={style} className="app-shell min-h-dvh">
        {/* Le fond vivant est global (body::before/::after). */}
        <main className="app-main w-full pb-28">{children}</main>
        <BottomNav />
        <AiOrb />
        <FocusTimer />
        <NotificationScheduler />
        <AiHistoryKeeper
          retention={toAiRetention(settings?.aiRetention)}
          clearedAt={settings?.aiHistoryClearedAt?.getTime() ?? null}
        />
      </div>
    </StorageScope>
  );
}
