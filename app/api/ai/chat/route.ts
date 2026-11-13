// POST /api/ai/chat — proxy sécurisé vers l'IA.
//
// Chaîne : frontend Orbs → CE backend → OpenAI → réponse → frontend.
// La clé OpenAI reste côté serveur (lib/ai/config.ts) et n'est jamais
// exposée au navigateur.
//
// Étapes : 1) auth  2) IA configurée ?  3) validation  4) débit
//          5) construction du contexte  6) appel OpenAI  7) réponse minimale.

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { AI_CONFIG, aiConfigured, resolveMode } from "@/lib/ai/config";
import { buildSystemPrompt, buildContextBlock } from "@/lib/ai/persona";
import { checkRateLimit } from "@/lib/ai/ratelimit";
import { streamChatCompletion, AiError } from "@/lib/ai/openai";
import { AUDIO_MODE_ID, toModeId } from "@/lib/ai/modes";
import type { ChatMessage } from "@/lib/ai/types";
import { getBillingState, reserve, settle, release } from "@/lib/billing/store";
import {
  engineForMode,
  chatOpForEngine,
  ENGINE_LABEL,
  creditsForTokens,
  estimateInputTokens,
  estimateOutputTokens,
} from "@/lib/billing/pricing";
import { insufficientCreditsResponse, engineLockedResponse } from "@/lib/billing/http";

// Runtime Node (nécessaire pour Prisma via getCurrentUser + fetch sortant).
export const runtime = "nodejs";
// La réponse est un flux : on autorise jusqu'à 60 s de génération.
export const maxDuration = 60;

const messageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().max(AI_CONFIG.maxMessageChars),
});

const cardSchema = z.object({
  q: z.string().max(500),
  a: z.string().max(500),
});

const bodySchema = z.object({
  message: z.string().trim().min(1).max(AI_CONFIG.maxMessageChars),
  history: z.array(messageSchema).max(AI_CONFIG.maxHistoryMessages).optional(),
  action: z
    .enum(["explain", "summarize", "flashcards", "questions", "revise", "mistake"])
    .optional(),
  // Mode de réflexion choisi dans le chat (Luna = moyen, Terra = poussé).
  // Absent/inconnu → mode par défaut. Les messages vocaux forcent Luna.
  mode: z.enum(["luna", "terra"]).optional(),
  tags: z.array(z.string().max(40)).max(20).optional(),
  // `true` si le message a été dicté à l'oral : la réponse sera alors formulée
  // pour être lue à voix haute (phrases naturelles, sans Markdown).
  voice: z.boolean().optional(),
  context: z
    .object({
      subject: z.string().max(200).optional(),
      chapter: z.string().max(200).optional(),
      question: z.string().max(2000).optional(),
      cards: z.array(cardSchema).max(50).optional(),
      homework: z.string().max(4000).optional(),
      lesson: z.string().max(6000).optional(),
      mistake: z.string().max(2000).optional(),
    })
    .optional(),
});

export async function POST(request: NextRequest) {
  // 1) Authentification : réservé aux utilisateurs connectés.
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { error: "unauthorized", message: "Connecte-toi pour utiliser l'IA." },
      { status: 401 },
    );
  }

  // 2) IA configurée côté serveur ?
  if (!aiConfigured()) {
    return NextResponse.json(
      {
        error: "not_configured",
        message: "IA non configurée — ajoutez votre clé API côté serveur.",
      },
      { status: 503 },
    );
  }

  // 3) Validation de la requête.
  const raw = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "invalid_request",
        message:
          "Message invalide ou trop long. Vérifie ta saisie et réessaie.",
      },
      { status: 400 },
    );
  }
  const { message, history, context, action, tags, voice, mode } = parsed.data;

  // Mode effectif : les interactions VOCALES utilisent toujours Luna (réponse
  // concise, lue à voix haute), même si Terra est sélectionné dans le chat.
  // Sinon, le mode choisi par l'élève (défaut si absent).
  const effectiveMode = voice ? AUDIO_MODE_ID : toModeId(mode);
  const { model, reasoningEffort } = resolveMode(effectiveMode);

  // Moteur de facturation (Core = Luna, Ultra = Terra) → portefeuille unique.
  const engine = engineForMode(effectiveMode);
  const op = chatOpForEngine(engine);

  // 4) Abonnement + crédits : droits de l'offre, moteur autorisé, solde.
  const billing = await getBillingState(user.id);

  // 4a) Limitation du débit (selon l'offre de l'utilisateur).
  const rate = checkRateLimit(user.id, {
    perMin: billing.entitlements.rateMaxPerMin,
    perDay: billing.entitlements.rateMaxPerDay,
  });
  if (!rate.ok) {
    const msg =
      rate.scope === "minute"
        ? "Tu envoies des messages trop vite. Patiente quelques secondes."
        : "Limite quotidienne atteinte. Reviens demain 🙂";
    return NextResponse.json(
      { error: "rate_limited", message: msg, retryAfter: rate.retryAfter },
      { status: 429, headers: { "Retry-After": String(rate.retryAfter) } },
    );
  }

  // 4b) Moteur Ultra réservé aux offres payantes (les réponses vocales, forcées
  //     sur Core, ne sont jamais bloquées).
  if (!billing.entitlements.engines.includes(engine)) {
    return engineLockedResponse(ENGINE_LABEL[engine]);
  }

  // 5) Construction du contexte (nécessaire pour estimer la taille d'entrée).
  const system = buildSystemPrompt(
    { firstName: user.firstName || user.name, schoolClass: user.schoolClass },
    action,
    tags,
    { voice },
  );
  const contextBlock = buildContextBlock(context);

  const messages: ChatMessage[] = [];
  if (history) messages.push(...history);
  const userContent = contextBlock ? `${contextBlock}\n\n---\n\n${message}` : message;
  messages.push({ role: "user", content: userContent });

  // 4c) RÉSERVE une estimation de crédits (couvre le pire cas : entrée estimée +
  //     sortie maximale). Le coût RÉEL sera réglé à la fin du flux (onSettle).
  const inputChars = system.length + messages.reduce((a, m) => a + m.content.length, 0);
  const estimated = creditsForTokens(
    engine,
    estimateInputTokens(inputChars),
    AI_CONFIG.maxCompletionTokens,
  );
  const reservation = await reserve(user.id, op, {
    estimated,
    engine,
    hasPaidAccess: billing.hasPaidAccess,
    meta: { model, mode: effectiveMode, voice: !!voice },
  });
  if (!reservation.ok) {
    return insufficientCreditsResponse(reservation.needed, reservation.balance);
  }

  // 6) Appel OpenAI en streaming. Les erreurs AVANT le flux (auth upstream,
  //    réseau, timeout) reviennent en JSON ; une fois le flux commencé (200), le
  //    texte arrive au fur et à mesure et les crédits sont réglés à la clôture.
  try {
    const stream = await streamChatCompletion(system, messages, {
      model,
      reasoningEffort,
      // Réconciliation : on règle au coût réel (usage fournisseur si dispo,
      // sinon estimation d'après le texte produit) et on rend le reste réservé.
      onSettle: async ({ usage, outputChars }) => {
        const inTok = usage?.prompt_tokens ?? estimateInputTokens(inputChars);
        const outTok = usage?.completion_tokens ?? estimateOutputTokens(outputChars);
        const actual = creditsForTokens(engine, inTok, outTok);
        await settle(reservation.reservationId, actual);
      },
    });
    // Le flux a bien démarré (HTTP 200) : la réservation sera réglée à la clôture.
    return new Response(stream, {
      status: 200,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        "X-Accel-Buffering": "no", // pas de mise en tampon (nginx & co)
      },
    });
  } catch (err) {
    // Échec AVANT le flux : on LIBÈRE la réservation (l'élève n'a rien reçu).
    await release(reservation.reservationId).catch(() => {});
    if (err instanceof AiError) {
      return NextResponse.json(
        { error: err.code, message: err.message },
        { status: err.status },
      );
    }
    console.error("[ai] erreur inattendue", err);
    return NextResponse.json(
      { error: "server_error", message: "Une erreur est survenue côté serveur." },
      { status: 500 },
    );
  }
}
