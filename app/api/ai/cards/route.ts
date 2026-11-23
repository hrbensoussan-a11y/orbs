// POST /api/ai/cards — génère des cartes de révision à partir d'un cours.
//
// Même chaîne sécurisée que /api/ai/chat : auth → IA configurée ? → validation
// → débit → appel OpenAI (non streamé) → cartes en JSON. La clé reste serveur.

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { AI_CONFIG, aiConfigured } from "@/lib/ai/config";
import { checkRateLimit } from "@/lib/ai/ratelimit";
import { generateCards, generateCardsFromImage, AiError } from "@/lib/ai/openai";
import { getBillingState, reserve, settle, release } from "@/lib/billing/store";
import {
  creditsForTokens,
  estimateInputTokens,
  estimateOutputTokens,
} from "@/lib/billing/pricing";
import { insufficientCreditsResponse, featureLockedResponse } from "@/lib/billing/http";

export const runtime = "nodejs";
export const maxDuration = 60;

// Soit du texte collé, soit une photo (data-URL image). Au moins l'un des deux.
const bodySchema = z
  .object({
    text: z.string().trim().min(20, "Colle un peu plus de texte.").max(8000).optional(),
    image: z
      .string()
      .regex(/^data:image\/(png|jpe?g|webp|gif);base64,/, "Image invalide.")
      .max(7_000_000, "Photo trop lourde.")
      .optional(),
    kind: z.enum(["definitions", "questions"]).default("definitions"),
    subject: z.string().max(60).optional(),
  })
  .refine((d) => !!d.text || !!d.image, {
    message: "Donne du texte ou une photo.",
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
  const { text, image, kind, subject } = parsed.data;

  // Abonnement + crédits : droits de l'offre, débit selon le plan, solde.
  const billing = await getBillingState(user.id);

  const rate = checkRateLimit(user.id, {
    perMin: billing.entitlements.rateMaxPerMin,
    perDay: billing.entitlements.rateMaxPerDay,
  });
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

  // Fonctionnalité « fiches par IA » réservée aux offres qui l'accordent.
  if (!billing.entitlements.cards) {
    return featureLockedResponse(
      "La génération de fiches par IA est réservée à une offre supérieure.",
    );
  }

  // Les fiches utilisent le modèle « poussé » → moteur Ultra, même portefeuille.
  // RÉSERVE une estimation (entrée estimée + sortie max) ; le coût réel sera
  // réglé d'après la consommation renvoyée par le fournisseur.
  const estInputTokens = estimateInputTokens(text?.length ?? 0) + (image ? 1500 : 0);
  const estimated = creditsForTokens("ultra", estInputTokens, AI_CONFIG.maxCompletionTokens);
  const reservation = await reserve(user.id, "cards", {
    estimated,
    engine: "ultra",
    hasPaidAccess: billing.hasPaidAccess,
    meta: { model: AI_CONFIG.model, kind, viaImage: !!image },
  });
  if (!reservation.ok) {
    return insufficientCreditsResponse(reservation.needed, reservation.balance);
  }

  try {
    const sys = systemFor(kind, subject);
    const { cards, usage } = image
      ? await generateCardsFromImage(sys, image)
      : await generateCards(sys, text as string);
    // Réconciliation au coût réel (usage fournisseur si dispo, sinon estimation).
    const inTok = usage?.prompt_tokens ?? estInputTokens;
    const outTok = usage?.completion_tokens ?? estimateOutputTokens(JSON.stringify(cards).length);
    await settle(reservation.reservationId, creditsForTokens("ultra", inTok, outTok));
    return NextResponse.json({ cards, model: AI_CONFIG.model });
  } catch (err) {
    await release(reservation.reservationId).catch(() => {});
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
