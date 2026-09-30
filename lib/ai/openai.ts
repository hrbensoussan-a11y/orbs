// Appel à l'API OpenAI (côté serveur uniquement).
//
// On utilise l'endpoint Chat Completions, compatible avec les modèles de
// raisonnement gpt-5.6 (Terra/Sol/Luna) :
//   - le nombre de tokens de sortie se règle avec `max_completion_tokens` ;
//   - `reasoning_effort` contrôle l'effort de raisonnement ;
//   - `temperature` / `top_p` ne sont PAS supportés par ces modèles → on ne
//     les envoie pas.
//
// La clé API reste ici, jamais renvoyée au client ni écrite dans les logs.

import { AI_CONFIG } from "./config";
import type { ChatMessage } from "./types";

/** Erreur IA normalisée, avec un message affichable en français. */
export class AiError extends Error {
  code: "timeout" | "upstream" | "bad_response" | "network";
  status: number; // code HTTP à renvoyer au client
  constructor(
    code: AiError["code"],
    message: string,
    status: number,
  ) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

type OpenAiMessage = { role: "system" | "user" | "assistant"; content: string };

export type AiResult = {
  reply: string;
  usage?: { inputTokens: number; outputTokens: number };
};

/**
 * Envoie la conversation à OpenAI et renvoie la réponse de l'assistant.
 * `system` = personnalité Orbs (+ contexte). `messages` = historique + message.
 */
export async function callOpenAI(
  system: string,
  messages: ChatMessage[],
): Promise<AiResult> {
  const payload: OpenAiMessage[] = [
    { role: "system", content: system },
    ...messages.map((m) => ({ role: m.role, content: m.content })),
  ];

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), AI_CONFIG.timeoutMs);

  let res: Response;
  try {
    res = await fetch(`${AI_CONFIG.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${AI_CONFIG.apiKey}`,
      },
      body: JSON.stringify({
        model: AI_CONFIG.model,
        messages: payload,
        max_completion_tokens: AI_CONFIG.maxCompletionTokens,
        reasoning_effort: AI_CONFIG.reasoningEffort,
      }),
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timer);
    if (err instanceof Error && err.name === "AbortError") {
      throw new AiError(
        "timeout",
        "L'IA met trop de temps à répondre. Réessaie dans un instant.",
        504,
      );
    }
    throw new AiError(
      "network",
      "Impossible de contacter l'IA pour le moment.",
      502,
    );
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    // On log un minimum côté serveur (statut seulement, jamais la clé) et on
    // renvoie un message générique au client.
    let detail = "";
    try {
      const j = (await res.json()) as { error?: { message?: string } };
      detail = j?.error?.message ? ` (${j.error.message})` : "";
    } catch {
      /* ignore */
    }
    console.error(`[ai] OpenAI a répondu ${res.status}${detail}`);
    throw new AiError(
      "upstream",
      "L'IA est momentanément indisponible. Réessaie dans un instant.",
      502,
    );
  }

  let data: {
    choices?: { message?: { content?: string } }[];
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };
  try {
    data = await res.json();
  } catch {
    throw new AiError("bad_response", "Réponse de l'IA illisible.", 502);
  }

  const reply = data.choices?.[0]?.message?.content?.trim();
  if (!reply) {
    throw new AiError("bad_response", "L'IA n'a renvoyé aucune réponse.", 502);
  }

  return {
    reply,
    usage: data.usage
      ? {
          inputTokens: data.usage.prompt_tokens ?? 0,
          outputTokens: data.usage.completion_tokens ?? 0,
        }
      : undefined,
  };
}
