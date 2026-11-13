// Appels audio OpenAI (SERVEUR uniquement) : transcription (voix → texte) et
// synthèse (texte → voix). La clé API reste ici, jamais renvoyée au client.
//
// On réutilise `AiError` (lib/ai/openai.ts) pour des messages d'erreur
// homogènes et affichables en français, et le même garde-fou de timeout que
// le chat (AI_CONFIG.timeoutMs).

import { AI_CONFIG } from "./config";
import { AiError } from "./openai";
import type { VoiceId } from "./voices";

/**
 * Transcrit un extrait audio en texte. `whisper-1` détecte seul la langue
 * (français ou anglais) : on n'impose donc aucune langue. Lève une `AiError`
 * en cas d'échec (timeout, réseau, upstream, réponse illisible).
 *
 * @param audio    Le son enregistré par le navigateur (Blob/File).
 * @param filename Nom de fichier avec une extension correcte (.webm/.mp4/…),
 *                 nécessaire pour qu'OpenAI reconnaisse le format.
 */
export async function transcribeAudio(
  audio: Blob,
  filename: string,
): Promise<string> {
  const form = new FormData();
  form.append("file", audio, filename);
  form.append("model", AI_CONFIG.sttModel);
  // Pas de `language` : détection automatique FR/EN.
  form.append("response_format", "json");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), AI_CONFIG.timeoutMs);

  let res: Response;
  try {
    res = await fetch(`${AI_CONFIG.baseUrl}/audio/transcriptions`, {
      method: "POST",
      // On NE fixe PAS Content-Type : fetch pose la frontière multipart.
      headers: { Authorization: `Bearer ${AI_CONFIG.apiKey}` },
      body: form,
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timer);
    if (err instanceof Error && err.name === "AbortError") {
      throw new AiError(
        "timeout",
        "La transcription a mis trop de temps. Réessaie.",
        504,
      );
    }
    throw new AiError("network", "Impossible de contacter l'IA pour le moment.", 502);
  }
  clearTimeout(timer);

  if (!res.ok) {
    let detail = "";
    try {
      const j = (await res.json()) as { error?: { message?: string } };
      detail = j?.error?.message ? ` (${j.error.message})` : "";
    } catch {
      /* ignore */
    }
    console.error(`[ai] transcription: OpenAI a répondu ${res.status}${detail}`);
    throw new AiError(
      "upstream",
      "La reconnaissance vocale est momentanément indisponible. Réessaie.",
      502,
    );
  }

  let json: { text?: string };
  try {
    json = (await res.json()) as typeof json;
  } catch {
    throw new AiError("bad_response", "Réponse de transcription illisible.", 502);
  }

  return (json.text ?? "").trim();
}

/**
 * Synthétise `text` en audio MP3 avec la `voice` choisie. La langue (FR/EN)
 * est détectée depuis le texte par le modèle. Renvoie le flux audio brut
 * (à relayer tel quel au navigateur). Lève une `AiError` en cas d'échec.
 */
export async function synthesizeSpeech(
  text: string,
  voice: VoiceId,
): Promise<ReadableStream<Uint8Array>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), AI_CONFIG.timeoutMs);

  let res: Response;
  try {
    res = await fetch(`${AI_CONFIG.baseUrl}/audio/speech`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${AI_CONFIG.apiKey}`,
      },
      body: JSON.stringify({
        model: AI_CONFIG.ttsModel,
        voice,
        input: text,
        response_format: "mp3",
      }),
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timer);
    if (err instanceof Error && err.name === "AbortError") {
      throw new AiError("timeout", "La lecture vocale a mis trop de temps. Réessaie.", 504);
    }
    throw new AiError("network", "Impossible de contacter l'IA pour le moment.", 502);
  }
  clearTimeout(timer);

  if (!res.ok) {
    let detail = "";
    try {
      const j = (await res.json()) as { error?: { message?: string } };
      detail = j?.error?.message ? ` (${j.error.message})` : "";
    } catch {
      /* ignore */
    }
    console.error(`[ai] synthèse: OpenAI a répondu ${res.status}${detail}`);
    throw new AiError(
      "upstream",
      "La voix de l'assistant est momentanément indisponible. Réessaie.",
      502,
    );
  }
  if (!res.body) {
    throw new AiError("bad_response", "Réponse audio illisible.", 502);
  }

  // Le timeout ne s'applique qu'à l'ouverture de la connexion : une fois le
  // flux obtenu, on le relaie tel quel.
  return res.body;
}
