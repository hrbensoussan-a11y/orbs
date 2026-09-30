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
import { AI_CONFIG, aiConfigured } from "@/lib/ai/config";
import { buildSystemPrompt, buildContextBlock } from "@/lib/ai/persona";
import { checkRateLimit } from "@/lib/ai/ratelimit";
import { callOpenAI, AiError } from "@/lib/ai/openai";
import type { ChatMessage } from "@/lib/ai/types";

// Runtime Node (nécessaire pour Prisma via getCurrentUser + fetch sortant).
export const runtime = "nodejs";

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
  const { message, history, context, action } = parsed.data;

  // 4) Limitation du débit (par utilisateur).
  const rate = checkRateLimit(user.id);
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

  // 5) Construction du contexte.
  const system = buildSystemPrompt(
    { firstName: user.firstName, schoolClass: user.schoolClass },
    action,
  );
  const contextBlock = buildContextBlock(context);

  const messages: ChatMessage[] = [];
  if (history) messages.push(...history);
  const userContent = contextBlock ? `${contextBlock}\n\n---\n\n${message}` : message;
  messages.push({ role: "user", content: userContent });

  // 6) Appel OpenAI + gestion d'erreurs propre.
  try {
    const result = await callOpenAI(system, messages);
    // 7) On ne renvoie que le nécessaire (pas de secret).
    return NextResponse.json({
      reply: result.reply,
      model: AI_CONFIG.model,
      usage: result.usage,
    });
  } catch (err) {
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
