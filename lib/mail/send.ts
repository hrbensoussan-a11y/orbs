// Point d'entrée de l'envoi d'e-mails, avec dégradation propre.
//
// - Configuré (clé API présente)  -> envoi réel via le service choisi.
// - Non configuré, en DÉVELOPPEMENT -> on n'envoie rien, mais on AFFICHE
//   l'e-mail (code compris) dans la console serveur. Tout le flux reste
//   testable en local sans aucun service externe.
// - Non configuré, en PRODUCTION -> erreur claire (pas d'envoi silencieux).
//
// Même esprit que le module IA : l'absence de clé ne casse pas l'app.

import { MAIL_CONFIG, isMailConfigured } from "./config";
import { sendViaBrevo, type SendInput, type SendResult } from "./brevo";
import { buildCodeEmail } from "./templates";
import type { CodePurpose } from "../codes";

export type { SendResult } from "./brevo";

const isDev = process.env.NODE_ENV !== "production";

export async function sendMail(input: SendInput): Promise<SendResult> {
  if (!isMailConfigured()) {
    if (isDev) {
      // Dégradation de développement : on « livre » dans la console.
      console.info(
        [
          "",
          "┌─────────────────────────────────────────────────────────────",
          "│ [mail] Aucune clé e-mail configurée (BREVO_API_KEY).",
          "│ En développement, l'e-mail n'est pas envoyé mais affiché ici :",
          `│  → à        : ${input.to}`,
          `│  → objet    : ${input.subject}`,
          "│  ─ contenu (texte) ─",
          ...input.text.split("\n").map((l) => `│   ${l}`),
          "└─────────────────────────────────────────────────────────────",
          "",
        ].join("\n"),
      );
      return { ok: true };
    }
    return { ok: false, error: "mail_not_configured" };
  }

  switch (MAIL_CONFIG.provider) {
    case "brevo":
      return sendViaBrevo(input);
    default:
      return { ok: false, error: `fournisseur inconnu: ${MAIL_CONFIG.provider}` };
  }
}

/** Construit et envoie l'e-mail portant un code à usage unique. */
export async function sendCodeEmail(params: {
  to: string;
  purpose: CodePurpose;
  code: string;
}): Promise<SendResult> {
  const { subject, html, text } = buildCodeEmail(params.purpose, params.code);
  return sendMail({ to: params.to, subject, html, text });
}
