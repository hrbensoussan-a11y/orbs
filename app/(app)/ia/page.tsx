import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { aiConfigured } from "@/lib/ai/config";
import { toAiRetention } from "@/lib/ai/retention";
import { AiChat } from "@/components/ai/AiChat";

export default async function IaPage() {
  const user = await requireUser();
  // Règle de conservation des conversations du compte (Réglages → Assistant
  // IA), appliquée par l'assistant sur l'historique de cet appareil.
  const settings = await prisma.settings.findUnique({
    where: { userId: user.id },
    select: { aiRetention: true, aiHistoryClearedAt: true },
  });
  // `aiConfigured()` ne lit que la présence de la clé côté serveur : la clé
  // elle-même n'est jamais transmise au navigateur.
  // Le prénom du compte, sinon le prénom/pseudo saisi à l'inscription.
  return (
    <AiChat
      firstName={user.firstName || user.name}
      configured={aiConfigured()}
      retention={toAiRetention(settings?.aiRetention)}
      historyClearedAt={settings?.aiHistoryClearedAt?.getTime() ?? null}
    />
  );
}
