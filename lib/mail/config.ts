// Configuration de l'envoi d'e-mails — tout vient de l'environnement, aucun
// secret dans le code ni dans Git. Même philosophie que le module IA : sans
// configuration, l'app continue de fonctionner (voir `lib/mail/send.ts`).

export type MailProvider = "brevo";

function env(name: string): string | undefined {
  const v = process.env[name];
  return v && v.trim() ? v.trim() : undefined;
}

export const MAIL_CONFIG = {
  provider: (env("MAIL_PROVIDER") ?? "brevo") as MailProvider,

  // Clé API du service transactionnel (SECRÈTE — côté serveur uniquement).
  brevoApiKey: env("BREVO_API_KEY"),

  // Expéditeur affiché. Par défaut l'adresse de support d'Orbs.
  fromEmail: env("MAIL_FROM_EMAIL") ?? "orbs.support@gmail.com",
  fromName: env("MAIL_FROM_NAME") ?? "Orbs",

  // Adresse de réponse (par défaut = expéditeur). Utile si on envoie depuis un
  // domaine dédié mais qu'on veut recevoir les réponses sur le Gmail de support.
  replyTo: env("MAIL_REPLY_TO"),

  // Nom de l'app affiché dans les e-mails.
  appName: env("APP_NAME") ?? "Orbs",
} as const;

/** Vrai si l'envoi réel d'e-mails est configuré (clé présente). */
export function isMailConfigured(): boolean {
  return Boolean(MAIL_CONFIG.brevoApiKey);
}
