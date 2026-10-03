// Appel à l'API OpenAI en STREAMING (côté serveur uniquement).
//
// On utilise l'endpoint Chat Completions en flux (`stream: true`), compatible
// avec les modèles de raisonnement gpt-5.6 (Terra/Sol/Luna) :
//   - le nombre de tokens de sortie se règle avec `max_completion_tokens` ;
//   - `reasoning_effort` contrôle l'effort de raisonnement ;
//   - `temperature` / `top_p` ne sont PAS supportés → on ne les envoie pas.
//
// Le streaming renvoie la réponse au fur et à mesure : l'élève voit les
// premiers mots en ~1 s au lieu d'attendre toute la réponse.
//
// La clé API reste ici, jamais renvoyée au client ni écrite dans les logs.

import { AI_CONFIG } from "./config";
import type { ChatMessage } from "./types";

/** Erreur IA normalisée, avec un message affichable en français. */
export class AiError extends Error {
  code: "timeout" | "upstream" | "bad_response" | "network";
  status: number; // code HTTP à renvoyer au client
  constructor(code: AiError["code"], message: string, status: number) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

type OpenAiMessage = { role: "system" | "user" | "assistant"; content: string };

/**
 * Lance la conversation en streaming et renvoie un flux de TEXTE (les morceaux
 * de réponse au fur et à mesure). Lève une `AiError` si l'appel échoue AVANT
 * le début du flux (auth upstream, réseau, timeout de connexion…).
 *
 * `system` = personnalité Orbs (+ contexte). `messages` = historique + message.
 */
export async function streamChatCompletion(
  system: string,
  messages: ChatMessage[],
): Promise<ReadableStream<Uint8Array>> {
  const payload: OpenAiMessage[] = [
    { role: "system", content: system },
    ...messages.map((m) => ({ role: m.role, content: m.content })),
  ];

  // Timeout « d'inactivité » : on abandonne seulement si RIEN n'arrive
  // pendant timeoutMs (connexion initiale ou flux figé). Une réponse longue
  // mais qui progresse n'est donc jamais coupée.
  const controller = new AbortController();
  let idle: ReturnType<typeof setTimeout> | null = null;
  const armIdle = () => {
    if (idle) clearTimeout(idle);
    idle = setTimeout(() => controller.abort(), AI_CONFIG.timeoutMs);
  };
  const clearIdle = () => {
    if (idle) clearTimeout(idle);
    idle = null;
  };
  armIdle();

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
        stream: true,
        stream_options: { include_usage: true },
      }),
      signal: controller.signal,
    });
  } catch (err) {
    clearIdle();
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
  }

  if (!res.ok) {
    clearIdle();
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
  if (!res.body) {
    clearIdle();
    throw new AiError("bad_response", "Réponse de l'IA illisible.", 502);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buffer = "";

  // On relit le flux SSE d'OpenAI, on extrait le texte de chaque `delta`
  // et on le renvoie tel quel au navigateur.
  return new ReadableStream<Uint8Array>({
    async pull(ctrl) {
      try {
        const { done, value } = await reader.read();
        if (done) {
          clearIdle();
          ctrl.close();
          return;
        }
        armIdle();
        buffer += decoder.decode(value, { stream: true });

        let nl: number;
        while ((nl = buffer.indexOf("\n")) >= 0) {
          const line = buffer.slice(0, nl).trim();
          buffer = buffer.slice(nl + 1);
          if (!line.startsWith("data:")) continue;
          const data = line.slice(5).trim();
          if (!data || data === "[DONE]") continue;
          try {
            const json = JSON.parse(data) as {
              choices?: { delta?: { content?: string } }[];
              usage?: { prompt_tokens?: number; completion_tokens?: number };
            };
            const delta = json.choices?.[0]?.delta?.content;
            if (delta) ctrl.enqueue(encoder.encode(delta));
            if (json.usage) {
              // Suivi de conso côté serveur (jamais de secret).
              console.log(
                `[ai] tokens ~ in:${json.usage.prompt_tokens ?? "?"} out:${json.usage.completion_tokens ?? "?"}`,
              );
            }
          } catch {
            /* ligne SSE incomplète : on attend la suite */
          }
        }
      } catch (err) {
        clearIdle();
        ctrl.error(err);
      }
    },
    cancel() {
      // Le client a fermé le flux (bouton « Arrêter ») : on coupe en amont
      // pour ne pas continuer à consommer des tokens.
      clearIdle();
      try {
        reader.cancel();
      } catch {
        /* ignore */
      }
      try {
        controller.abort();
      } catch {
        /* ignore */
      }
    },
  });
}

export type GeneratedCard = { t: string; d: string };

/**
 * Génère des cartes de révision à partir d'un cours (appel NON streamé : on
 * attend la réponse complète, puis on la parse en JSON). Lève une `AiError`
 * en cas d'échec. Réutilisé par la route /api/ai/cards.
 */
export async function generateCards(
  system: string,
  courseText: string,
): Promise<GeneratedCard[]> {
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
        messages: [
          { role: "system", content: system },
          { role: "user", content: courseText },
        ],
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
  }
  clearTimeout(timer);

  if (!res.ok) {
    console.error(`[ai] cards: OpenAI a répondu ${res.status}`);
    throw new AiError(
      "upstream",
      "L'IA est momentanément indisponible. Réessaie dans un instant.",
      502,
    );
  }

  let json: { choices?: { message?: { content?: string } }[] };
  try {
    json = (await res.json()) as typeof json;
  } catch {
    throw new AiError("bad_response", "Réponse de l'IA illisible.", 502);
  }

  const content = json.choices?.[0]?.message?.content ?? "";
  const cards = parseCards(content);
  if (!cards.length) {
    throw new AiError(
      "bad_response",
      "L'IA n'a pas réussi à créer de cartes. Colle un texte de cours plus clair et réessaie.",
      502,
    );
  }
  return cards;
}

/** Extrait un tableau [{t,d}] même si l'IA l'entoure de texte ou de ```json. */
function parseCards(raw: string): GeneratedCard[] {
  let s = raw.trim();
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) s = fence[1].trim();
  const start = s.indexOf("[");
  const end = s.lastIndexOf("]");
  if (start >= 0 && end > start) s = s.slice(start, end + 1);

  let arr: unknown;
  try {
    arr = JSON.parse(s);
  } catch {
    return [];
  }
  if (!Array.isArray(arr)) return [];

  const out: GeneratedCard[] = [];
  for (const item of arr) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const t = String(o.t ?? o.question ?? o.terme ?? o.term ?? "").trim();
    const d = String(
      o.d ?? o.reponse ?? o["réponse"] ?? o.definition ?? o["définition"] ?? o.answer ?? "",
    ).trim();
    if (t && d) out.push({ t: t.slice(0, 500), d: d.slice(0, 500) });
    if (out.length >= 30) break;
  }
  return out;
}
