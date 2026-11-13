// Transport Brevo via son API HTTPS (https://api.brevo.com/v3/smtp/email).
//
// On utilise l'API HTTPS plutôt que le SMTP : c'est la voie recommandée en
// production ET la seule qui passe depuis un environnement cloud restreint au
// HTTPS (le port SMTP y est souvent bloqué). Aucune dépendance npm requise :
// un simple `fetch`.

import { MAIL_CONFIG } from "./config";

const BREVO_ENDPOINT = "https://api.brevo.com/v3/smtp/email";
const TIMEOUT_MS = 15_000;

export type SendInput = {
  to: string;
  subject: string;
  html: string;
  text: string;
};

export type SendResult =
  | { ok: true; id?: string }
  | { ok: false; error: string };

/** Envoie un e-mail transactionnel via Brevo. Suppose la clé API présente. */
export async function sendViaBrevo(input: SendInput): Promise<SendResult> {
  const apiKey = MAIL_CONFIG.brevoApiKey;
  if (!apiKey) return { ok: false, error: "BREVO_API_KEY manquant" };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(BREVO_ENDPOINT, {
      method: "POST",
      headers: {
        "api-key": apiKey,
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify({
        sender: { name: MAIL_CONFIG.fromName, email: MAIL_CONFIG.fromEmail },
        to: [{ email: input.to }],
        subject: input.subject,
        htmlContent: input.html,
        textContent: input.text,
        ...(MAIL_CONFIG.replyTo
          ? { replyTo: { email: MAIL_CONFIG.replyTo } }
          : {}),
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      // Brevo renvoie un corps JSON décrivant l'erreur (clé invalide,
      // expéditeur non vérifié, quota dépassé…). On le remonte sans le détailler
      // à l'utilisateur final (voir send.ts).
      let detail = "";
      try {
        detail = JSON.stringify(await res.json());
      } catch {
        detail = await res.text().catch(() => "");
      }
      return { ok: false, error: `Brevo HTTP ${res.status} — ${detail}` };
    }

    const data = (await res.json().catch(() => ({}))) as { messageId?: string };
    return { ok: true, id: data.messageId };
  } catch (err) {
    const msg =
      err instanceof Error && err.name === "AbortError"
        ? "délai dépassé"
        : err instanceof Error
          ? err.message
          : "erreur réseau";
    return { ok: false, error: `Brevo: ${msg}` };
  } finally {
    clearTimeout(timer);
  }
}
