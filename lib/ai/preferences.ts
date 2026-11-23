// Préférences de l'assistant enregistrées sur le compte (serveur uniquement).
//
// Lues par /api/ai/chat à CHAQUE message, pour l'utilisateur de la session :
// le navigateur n'envoie jamais le style ni le profil avec la question, il ne
// peut donc ni les falsifier ni lire ceux d'un autre compte.

import { prisma } from "@/lib/prisma";
import { toAiStyle, type AiStyleId } from "./style";
import { parseLearningProfile, type LearningProfile } from "./learningProfile";

export type AiPreferences = { style: AiStyleId; learning: LearningProfile };

export async function loadAiPreferences(userId: string): Promise<AiPreferences> {
  const row = await prisma.settings.findUnique({
    where: { userId },
    select: { aiStyle: true, learningProfile: true },
  });
  return {
    style: toAiStyle(row?.aiStyle),
    learning: parseLearningProfile(row?.learningProfile),
  };
}
