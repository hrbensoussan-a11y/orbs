// POST /api/ai/cards — génère des cartes de révision à partir d'un cours.
//
// Même chaîne sécurisée que /api/ai/chat : auth → IA configurée ? → validation
// → débit → appel OpenAI (non streamé) → cartes en JSON. La clé reste serveur.

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { AI_CONFIG, aiConfigured } from "@/lib/ai/config";
import { checkRateLimit } from "@/lib/ai/ratelimit";
import { generateCards, AiError } from "@/lib/ai/openai";

export const runtime = "nodejs";
export const maxDuration = 60;

const bodySchema = z.object({
  text: z.string().trim().min(20, "Colle un peu plus de texte.").max(8000),
  kind: z.enum(["definitions", "questions"]).default("definitions"),
  subject: z.string().max(60).optional(),
});

function systemFor(kind: "definitions" | "questions", subject?: string): string {
  const role =
    kind === "questions"
      ? "- t = une QUESTION de cours claire ; d = la RÉPONSE modèle, courte et exacte."
      : "- t = le TERME ou mot-clé important ; d = sa DÉFINITION, claire et concise (1 à 2 phrases).";
  return [
    "Tu génères des cartes de révision pour un élève, à partir du cours qu'il te donne.",
    "Réponds UNIQUEMENT avec un tableau JSON valide, sans aucun texte autour, au format :",
    '[{"t":"...","d":"..."}]',
    role,
    subject ? `Matière : ${subject}.` : "",
    "Règles : entre 5 et 15 cartes, en français, fidèles au cours (n'invente rien),",
    "pas de doublons, formulations courtes et faciles à mémoriser.",
  ]
    .filter(Boolean)
    .join("\n");
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { error: "unauthorized", message: "Connecte-toi pour utiliser l'IA." },
      { status: 401 },
    );
  }

  if (!aiConfigured()) {
    return NextResponse.json(
      {
        error: "not_configured",
        message: "IA non configurée — ajoutez votre clé API côté serveur.",
      },
      { status: 503 },
    );
  }

  const raw = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "invalid_request",
        message: "Texte de cours invalide ou trop long. Vérifie ta saisie.",
      },
      { status: 400 },
    );
  }
  const { text, kind, subject } = parsed.data;

  const rate = checkRateLimit(user.id);
  if (!rate.ok) {
    const msg =
      rate.scope === "minute"
        ? "Tu génères des fiches trop vite. Patiente quelques secondes."
        : "Limite quotidienne atteinte. Reviens demain 🙂";
    return NextResponse.json(
      { error: "rate_limited", message: msg, retryAfter: rate.retryAfter },
      { status: 429, headers: { "Retry-After": String(rate.retryAfter) } },
    );
  }

  try {
    const cards = await generateCards(systemFor(kind, subject), text);
    return NextResponse.json({ cards, model: AI_CONFIG.model });
  } catch (err) {
    if (err instanceof AiError) {
      return NextResponse.json(
        { error: err.code, message: err.message },
        { status: err.status },
      );
    }
    console.error("[ai] /cards erreur inattendue", err);
    return NextResponse.json(
      { error: "server_error", message: "Une erreur est survenue côté serveur." },
      { status: 500 },
    );
  }
}
