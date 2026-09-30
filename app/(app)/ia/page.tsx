import { requireUser } from "@/lib/auth";
import { aiConfigured } from "@/lib/ai/config";
import { AiChat } from "@/components/ai/AiChat";

export default async function IaPage() {
  const user = await requireUser();
  // `aiConfigured()` ne lit que la présence de la clé côté serveur : la clé
  // elle-même n'est jamais transmise au navigateur.
  return <AiChat firstName={user.firstName} configured={aiConfigured()} />;
}
