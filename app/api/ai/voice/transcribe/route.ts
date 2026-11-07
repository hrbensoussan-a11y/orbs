// POST /api/ai/voice/transcribe — voix → texte (proxy sécurisé).
//
// L'élève parle ; le navigateur envoie l'extrait audio ici (multipart) ; on le
// relaie à OpenAI (Whisper) et on renvoie le texte transcrit. La clé reste
// côté serveur. Mêmes garde-fous que le chat : auth, config, débit.

import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { AI_CONFIG, aiConfigured } from "@/lib/ai/config";
import { checkRateLimit } from "@/lib/ai/ratelimit";
import { transcribeAudio } from "@/lib/ai/audio";
import { AiError } from "@/lib/ai/openai";
import { getBillingState, spendCredits, refundCredits } from "@/lib/billing/store";
import { insufficientCreditsResponse, featureLockedResponse } from "@/lib/billing/http";

// Runtime Node (Prisma via getCurrentUser + fetch sortant + FormData).
export const runtime = "nodejs";
export const maxDuration = 60;

// Types audio acceptés depuis le navigateur (MediaRecorder) → extension pour
// qu'OpenAI reconnaisse le format. On teste le préfixe du type MIME, car il
// peut porter un suffixe de codec (ex. "audio/webm;codecs=opus").
const AUDIO_EXT: { prefix: string; ext: string }[] = [
  { prefix: "audio/webm", ext: "webm" },
  { prefix: "audio/mp4", ext: "mp4" },
  { prefix: "audio/mpeg", ext: "mp3" },
  { prefix: "audio/ogg", ext: "ogg" },
  { prefix: "audio/wav", ext: "wav" },
  { prefix: "audio/x-m4a", ext: "m4a" },
  { prefix: "audio/aac", ext: "aac" },
];

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

  // 3) Abonnement + débit (selon l'offre de l'utilisateur).
  const billing = await getBillingState(user.id);
  const rate = checkRateLimit(user.id, {
    perMin: billing.entitlements.rateMaxPerMin,
    perDay: billing.entitlements.rateMaxPerDay,
  });
  if (!rate.ok) {
    const msg =
      rate.scope === "minute"
        ? "Tu parles trop vite 🙂 Patiente quelques secondes."
        : "Limite quotidienne atteinte. Reviens demain 🙂";
    return NextResponse.json(
      { error: "rate_limited", message: msg, retryAfter: rate.retryAfter },
      { status: 429, headers: { "Retry-After": String(rate.retryAfter) } },
    );
  }
  if (!billing.entitlements.voice) {
    return featureLockedResponse("L'assistant vocal est réservé à une offre supérieure.");
  }

  // 4) Récupération et validation de l'audio.
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json(
      { error: "invalid_request", message: "Audio invalide. Réessaie." },
      { status: 400 },
    );
  }
  const audio = form.get("audio");
  if (!(audio instanceof Blob) || audio.size === 0) {
    return NextResponse.json(
      { error: "invalid_request", message: "Aucun son reçu. Réessaie." },
      { status: 400 },
    );
  }
  if (audio.size > AI_CONFIG.maxAudioBytes) {
    return NextResponse.json(
      { error: "too_large", message: "Enregistrement trop long. Fais plus court et réessaie." },
      { status: 413 },
    );
  }

  const type = (audio.type || "").toLowerCase();
  const match = AUDIO_EXT.find((a) => type.startsWith(a.prefix));
  const ext = match?.ext ?? "webm";

  // Réservation des crédits avant la transcription ; remboursement si rien n'a
  // été transcrit ou en cas d'échec (l'élève n'obtient alors aucun texte).
  const spend = await spendCredits(user.id, "voice_stt", {
    hasPaidAccess: billing.hasPaidAccess,
    meta: { model: AI_CONFIG.sttModel },
  });
  if (!spend.ok) {
    return insufficientCreditsResponse(spend.needed, spend.balance);
  }

  // 5) Transcription.
  try {
    const text = await transcribeAudio(audio, `voix.${ext}`);
    if (!text) {
      await refundCredits(user.id, spend.spent, { op: "voice_stt", reason: "stt_empty" }).catch(() => {});
      return NextResponse.json(
        { error: "empty", message: "Je n'ai rien entendu. Parle un peu plus près du micro." },
        { status: 422 },
      );
    }
    return NextResponse.json({ text });
  } catch (err) {
    await refundCredits(user.id, spend.spent, { op: "voice_stt", reason: "stt_failed" }).catch(() => {});
    if (err instanceof AiError) {
      return NextResponse.json({ error: err.code, message: err.message }, { status: err.status });
    }
    console.error("[ai] transcribe: erreur inattendue", err);
    return NextResponse.json(
      { error: "server_error", message: "Une erreur est survenue côté serveur." },
      { status: 500 },
    );
  }
}
