// Gabarits d'e-mails (HTML + texte), aux couleurs d'Orbs. Volontairement
// « compatibles clients mail » : styles en ligne, mise en page simple, pas de
// `backdrop-filter` (non supporté par Gmail). On garde le vert signature.

import type { CodePurpose } from "../codes";
import { MAIL_CONFIG } from "./config";

// Gardé en phase avec CODE_POLICY.ttlMs (lib/codes.ts) — affichage seulement.
const EXPIRES_MINUTES = 10;

const ACCENT = "#38C172"; // vert signature d'Orbs
const INK = "#1f2a24";
const MUTED = "#6b7b72";

type Copy = { subject: string; heading: string; intro: string };

function copyFor(purpose: CodePurpose, code: string): Copy {
  const app = MAIL_CONFIG.appName;
  switch (purpose) {
    case "verify":
      return {
        subject: `${code} — confirme ton adresse ${app}`,
        heading: "Bienvenue 👋",
        intro: `Voici ton code pour confirmer ton adresse e-mail et activer ton carnet ${app}.`,
      };
    case "login":
      return {
        subject: `${code} — ton code de connexion ${app}`,
        heading: "Connexion",
        intro: `Voici ton code pour te connecter à ${app}.`,
      };
    case "reset":
      return {
        subject: `${code} — réinitialise ton mot de passe ${app}`,
        heading: "Mot de passe oublié",
        intro: `Tu as demandé à réinitialiser ton mot de passe ${app}. Voici ton code.`,
      };
  }
}

export type BuiltEmail = { subject: string; html: string; text: string };

/** Construit l'e-mail (sujet + HTML + texte) qui porte un code à usage unique. */
export function buildCodeEmail(purpose: CodePurpose, code: string): BuiltEmail {
  const { subject, heading, intro } = copyFor(purpose, code);
  const app = MAIL_CONFIG.appName;
  const spaced = code.split("").join(" "); // fine space entre les chiffres

  const html = `<!doctype html>
<html lang="fr">
  <body style="margin:0;padding:0;background:#f3f6f4;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f6f4;padding:32px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:460px;background:#ffffff;border:1px solid #e4ece7;border-radius:20px;overflow:hidden;">
            <tr>
              <td style="padding:28px 32px 8px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
                <div style="font-size:22px;font-weight:700;color:${ACCENT};letter-spacing:-0.02em;">${app}</div>
              </td>
            </tr>
            <tr>
              <td style="padding:8px 32px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
                <h1 style="margin:0 0 8px;font-size:20px;color:${INK};font-weight:600;">${heading}</h1>
                <p style="margin:0;font-size:15px;line-height:1.5;color:${MUTED};">${intro}</p>
              </td>
            </tr>
            <tr>
              <td style="padding:24px 32px;">
                <div style="background:#f0f8f3;border:1px solid #d7ebdf;border-radius:14px;padding:18px;text-align:center;">
                  <div style="font-family:'SFMono-Regular',Consolas,'Liberation Mono',Menlo,monospace;font-size:34px;font-weight:700;letter-spacing:6px;color:${INK};">${spaced}</div>
                </div>
                <p style="margin:14px 0 0;font-size:13px;line-height:1.5;color:${MUTED};text-align:center;">
                  Ce code expire dans ${EXPIRES_MINUTES} minutes.
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:0 32px 28px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
                <p style="margin:0;font-size:12px;line-height:1.5;color:${MUTED};border-top:1px solid #eef3f0;padding-top:16px;">
                  Si tu n'es pas à l'origine de cette demande, ignore simplement cet e-mail : ton compte reste en sécurité.
                </p>
              </td>
            </tr>
          </table>
          <p style="max-width:460px;margin:16px auto 0;font-size:11px;color:#9aa8a0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
            ${app} — assistant scolaire. Cet e-mail t'a été envoyé automatiquement.
          </p>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  const text = [
    `${app} — ${heading}`,
    "",
    intro,
    "",
    `Ton code : ${code}`,
    `Ce code expire dans ${EXPIRES_MINUTES} minutes.`,
    "",
    "Si tu n'es pas à l'origine de cette demande, ignore cet e-mail : ton compte reste en sécurité.",
  ].join("\n");

  return { subject, html, text };
}
