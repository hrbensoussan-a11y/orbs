// POST /api/ai/voice/speak — texte → voix (proxy sécurisé).
//
// Reçoit le texte d'une réponse et la voix choisie, renvoie le flux audio MP3
// lu par le navigateur. La clé reste côté serveur. Mêmes garde-fous que le
// chat : auth, config, débit.

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { AI_CONFIG, aiConfigured } from "@/lib/ai/config";
import { checkRateLimit } from "@/lib/ai/ratelimit";
import { synthesizeSpeech } from "@/lib/ai/audio";
import { AiError } from "@/lib/ai/openai";
import { toVoiceId } from "@/lib/ai/voices";
import { getBillingState, reserve, settle, release } from "@/lib/billing/store";
import { creditCost } from "@/lib/billing/pricing";
import { insufficientCreditsResponse, featureLockedResponse } from "@/lib/billing/http";

// Runtime Node (Prisma via getCurrentUser + fetch sortant + flux).
export const runtime = "nodejs";
export const maxDuration = 60;

const bodySchema = z.object({
  text: z.string().trim().min(1).max(AI_CONFIG.maxSpeakChars),
  voice: z.string().max(40).optional(),
});

export async function POST(request: NextRequest) {
  // 1) Authentification.
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { error: "unauthorized", message: "Connecte-toi pour utiliser la voix." },
      { status: 401 },
    );
  }

  // 2) IA configurée côté serveur ?
  if (!aiConfigured()) {
    return NextResponse.json(
      { error: "not_configured", message: "IA non configurée — ajoutez votre clé API côté serveur." },
      { status: 503 },
    );
  }

  // 3) Validation.
  const raw = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_request", message: "Texte à lire invalide ou trop long." },
      { status: 400 },
    );
  }
  // Voix inconnue → voix par défaut (jamais d'erreur pour ça).
  const voice = toVoiceId(parsed.data.voice);

  // 4) Abonnement + crédits.
  const billing = await getBillingState(user.id);

  const rate = checkRateLimit(user.id, {
    perMin: billing.entitlements.rateMaxPerMin,
    perDay: billing.entitlements.rateMaxPerDay,
  });
  if (!rate.ok) {
    const msg =
      rate.scope === "minute"
        ? "Trop de lectures d'affilée. Patiente quelques secondes."
        : "Limite quotidienne atteinte. Reviens demain 🙂";
    return NextResponse.json(
      { error: "rate_limited", message: msg, retryAfter: rate.retryAfter },
      { status: 429, headers: { "Retry-After": String(rate.retryAfter) } },
    );
  }

  if (!billing.entitlements.voice) {
    return featureLockedResponse("L'assistant vocal est réservé à une offre supérieure.");
  }

  // La voix n'expose pas de tokens : coût forfaitaire. On réserve puis on règle
  // le même montant (rend 0) en cas de succès, ou on libère en cas d'échec.
  const ttsCost = creditCost("voice_tts");
  const reservation = await reserve(user.id, "voice_tts", {
    estimated: ttsCost,
    hasPaidAccess: billing.hasPaidAccess,
    meta: { model: AI_CONFIG.ttsModel, voice },
  });
  if (!reservation.ok) {
    return insufficientCreditsResponse(reservation.needed, reservation.balance);
  }

  // 5) Synthèse → flux audio MP3.
  try {
    const stream = await synthesizeSpeech(parsed.data.text, voice);
    await settle(reservation.reservationId, ttsCost); // coût forfaitaire confirmé
    return new Response(stream, {
      status: 200,
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "no-store",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (err) {
    await release(reservation.reservationId).catch(() => {});
    if (err instanceof AiError) {
      return NextResponse.json({ error: err.code, message: err.message }, { status: err.status });
    }
    console.error("[ai] speak: erreur inattendue", err);
    return NextResponse.json(
      { error: "server_error", message: "Une erreur est survenue côté serveur." },
      { status: 500 },
    );
  }
}
