// Client Stripe minimal — SERVEUR UNIQUEMENT (ne jamais importer côté client).
//
// Architecture de paiement sécurisée : la clé secrète Stripe reste ici, côté
// serveur, et n'est JAMAIS exposée au navigateur. Comme le reste du projet
// (OpenAI, Brevo), on parle à l'API par de simples requêtes HTTPS `fetch`
// plutôt qu'avec un SDK : aucune dépendance à installer et compatibilité avec
// le proxy HTTPS de l'environnement.
//
// On s'appuie sur les primitives hébergées par Stripe (PCI à la charge de
// Stripe) :
//   - Checkout  : page de paiement hébergée (aucune donnée carte chez nous) ;
//   - Billing Portal : gestion du moyen de paiement / résiliation côté Stripe ;
//   - Webhooks  : source de vérité du cycle de vie (signés et vérifiés).
//
// Sans STRIPE_SECRET_KEY, le module se déclare « non configuré » et l'app
// continue de fonctionner (comme l'IA sans clé). Voir docs/abonnements.md pour
// les étapes de configuration externe et de validation humaine.

import crypto from "node:crypto";

const API_BASE = "https://api.stripe.com/v1";

function env(name: string): string | undefined {
  const v = process.env[name];
  return v == null || v === "" ? undefined : v.trim();
}

export const STRIPE = {
  secretKey: env("STRIPE_SECRET_KEY") ?? "",
  webhookSecret: env("STRIPE_WEBHOOK_SECRET") ?? "",
  // Version d'API épinglée (optionnelle) : si absente, Stripe utilise la
  // version par défaut du compte. La renseigner pour un comportement figé.
  apiVersion: env("STRIPE_API_VERSION"),
} as const;

/** Stripe est-il configuré côté serveur ? (clé secrète présente) */
export function stripeConfigured(): boolean {
  return STRIPE.secretKey.length > 0;
}

/** Le webhook peut-il être vérifié ? (secret de signature présent) */
export function webhookConfigured(): boolean {
  return STRIPE.webhookSecret.length > 0;
}

/** Erreur Stripe normalisée (message technique — à ne pas montrer brut). */
export class StripeError extends Error {
  status: number;
  type?: string;
  code?: string;
  constructor(message: string, status: number, type?: string, code?: string) {
    super(message);
    this.name = "StripeError";
    this.status = status;
    this.type = type;
    this.code = code;
  }
}

// --- Encodage des paramètres au format form-urlencoded « à la Stripe » ------
// Stripe attend des clés imbriquées : a[b][c]=v et des listes a[0][price]=v.
function encodeForm(
  params: Record<string, unknown>,
  prefix = "",
  out: string[] = [],
): string[] {
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;
    const field = prefix ? `${prefix}[${key}]` : key;
    if (Array.isArray(value)) {
      value.forEach((item, i) => {
        if (item !== null && typeof item === "object") {
          encodeForm(item as Record<string, unknown>, `${field}[${i}]`, out);
        } else {
          out.push(`${encodeURIComponent(`${field}[${i}]`)}=${encodeURIComponent(String(item))}`);
        }
      });
    } else if (typeof value === "object") {
      encodeForm(value as Record<string, unknown>, field, out);
    } else {
      out.push(`${encodeURIComponent(field)}=${encodeURIComponent(String(value))}`);
    }
  }
  return out;
}

async function stripeRequest<T>(
  method: "GET" | "POST",
  path: string,
  params?: Record<string, unknown>,
  opts?: { idempotencyKey?: string },
): Promise<T> {
  if (!stripeConfigured()) {
    throw new StripeError("Stripe non configuré (clé secrète absente).", 503, "not_configured");
  }

  const headers: Record<string, string> = {
    Authorization: `Bearer ${STRIPE.secretKey}`,
  };
  if (STRIPE.apiVersion) headers["Stripe-Version"] = STRIPE.apiVersion;
  if (opts?.idempotencyKey) headers["Idempotency-Key"] = opts.idempotencyKey;

  let url = `${API_BASE}${path}`;
  let body: string | undefined;
  if (method === "GET") {
    if (params) {
      const qs = encodeForm(params).join("&");
      if (qs) url += `?${qs}`;
    }
  } else {
    headers["Content-Type"] = "application/x-www-form-urlencoded";
    body = params ? encodeForm(params).join("&") : "";
  }

  let res: Response;
  try {
    res = await fetch(url, { method, headers, body });
  } catch {
    throw new StripeError("Impossible de contacter Stripe.", 502, "network");
  }

  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    /* réponse non-JSON */
  }

  if (!res.ok) {
    const err = (json as { error?: { message?: string; type?: string; code?: string } })?.error;
    // On journalise côté serveur sans jamais exposer la clé.
    console.error(`[stripe] ${method} ${path} → ${res.status} ${err?.code ?? ""} ${err?.message ?? text.slice(0, 200)}`);
    throw new StripeError(err?.message ?? `Stripe a répondu ${res.status}.`, res.status, err?.type, err?.code);
  }

  return json as T;
}

// --- Types partiels des objets Stripe qu'on manipule ------------------------
export type StripeCheckoutSession = {
  id: string;
  url: string | null;
  customer: string | null;
  subscription: string | null;
  client_reference_id: string | null;
  metadata?: Record<string, string>;
};

export type StripeSubscriptionItem = {
  id: string;
  price?: { id: string };
};

export type StripeSubscription = {
  id: string;
  status: string; // active | trialing | past_due | canceled | unpaid | incomplete | incomplete_expired
  customer: string;
  cancel_at_period_end: boolean;
  canceled_at: number | null;
  current_period_start: number | null;
  current_period_end: number | null;
  items: { data: StripeSubscriptionItem[] };
  metadata?: Record<string, string>;
};

export type StripeEvent = {
  id: string;
  type: string;
  created: number;
  data: { object: Record<string, unknown> };
};

// --- Opérations utilisées par l'app ----------------------------------------

/** Crée (ou réutilise) un client Stripe lié à l'utilisateur Orbs. */
export async function createCustomer(email: string, userId: string): Promise<{ id: string }> {
  return stripeRequest<{ id: string }>("POST", "/customers", {
    email,
    metadata: { userId },
  });
}

/** Ouvre une session Checkout d'abonnement (page de paiement hébergée). */
export async function createCheckoutSession(args: {
  priceId: string;
  userId: string;
  successUrl: string;
  cancelUrl: string;
  customerId?: string;
  customerEmail?: string;
}): Promise<StripeCheckoutSession> {
  const params: Record<string, unknown> = {
    mode: "subscription",
    line_items: [{ price: args.priceId, quantity: 1 }],
    success_url: args.successUrl,
    cancel_url: args.cancelUrl,
    client_reference_id: args.userId,
    metadata: { userId: args.userId },
    // Propage l'userId sur l'ABONNEMENT : les webhooks de cycle de vie le
    // reçoivent dans subscription.metadata.userId.
    subscription_data: { metadata: { userId: args.userId } },
    allow_promotion_codes: true,
  };
  // On lie au client existant si connu, sinon on pré-remplit l'e-mail.
  if (args.customerId) params.customer = args.customerId;
  else if (args.customerEmail) params.customer_email = args.customerEmail;

  return stripeRequest<StripeCheckoutSession>("POST", "/checkout/sessions", params);
}

/** Ouvre le portail de facturation Stripe (gestion carte / résiliation). */
export async function createBillingPortalSession(args: {
  customerId: string;
  returnUrl: string;
}): Promise<{ id: string; url: string }> {
  return stripeRequest<{ id: string; url: string }>("POST", "/billing_portal/sessions", {
    customer: args.customerId,
    return_url: args.returnUrl,
  });
}

export async function retrieveSubscription(subscriptionId: string): Promise<StripeSubscription> {
  return stripeRequest<StripeSubscription>("GET", `/subscriptions/${subscriptionId}`);
}

export async function retrieveCheckoutSession(sessionId: string): Promise<StripeCheckoutSession> {
  return stripeRequest<StripeCheckoutSession>("GET", `/checkout/sessions/${sessionId}`);
}

/**
 * Change l'offre d'un abonnement existant (montée ou rétrogradation) en
 * remplaçant le Price de sa ligne. `create_prorations` : Stripe calcule le
 * prorata équitablement dans les deux sens (différence facturée ou créditée au
 * prochain cycle). Le changement prend effet immédiatement et se reflète via le
 * webhook `customer.subscription.updated`.
 */
export async function updateSubscriptionPrice(
  subscriptionId: string,
  newPriceId: string,
): Promise<StripeSubscription> {
  const sub = await retrieveSubscription(subscriptionId);
  const itemId = sub.items?.data?.[0]?.id;
  if (!itemId) {
    throw new StripeError("Abonnement Stripe sans ligne de facturation.", 500, "no_item");
  }
  return stripeRequest<StripeSubscription>(
    "POST",
    `/subscriptions/${subscriptionId}`,
    {
      items: [{ id: itemId, price: newPriceId }],
      proration_behavior: "create_prorations",
      // Un changement d'offre lève une résiliation programmée éventuelle.
      cancel_at_period_end: false,
    },
    { idempotencyKey: `planchange_${subscriptionId}_${newPriceId}` },
  );
}

/** Programme (ou annule) la résiliation à la fin de la période en cours. */
export async function setCancelAtPeriodEnd(
  subscriptionId: string,
  cancel: boolean,
): Promise<StripeSubscription> {
  return stripeRequest<StripeSubscription>("POST", `/subscriptions/${subscriptionId}`, {
    cancel_at_period_end: cancel,
  });
}

// --- Vérification de signature des webhooks ---------------------------------
//
// Schéma Stripe : en-tête `Stripe-Signature: t=<ts>,v1=<hmac>` où
// hmac = HMAC-SHA256(secret, `${t}.${payloadBrut}`). On recalcule et on compare
// en temps constant, puis on vérifie la fraîcheur de l'horodatage (anti-rejeu).
export function verifyWebhookSignature(
  payload: string,
  signatureHeader: string | null,
  toleranceSec = 300,
): StripeEvent {
  if (!webhookConfigured()) {
    throw new StripeError("Webhook Stripe non configuré (secret absent).", 503, "not_configured");
  }
  if (!signatureHeader) {
    throw new StripeError("Signature de webhook absente.", 400, "no_signature");
  }

  // Parse « t=...,v1=...,v1=... » (plusieurs v1 possibles pendant une rotation).
  let timestamp = "";
  const v1: string[] = [];
  for (const part of signatureHeader.split(",")) {
    const [k, val] = part.split("=");
    if (k === "t") timestamp = val;
    else if (k === "v1" && val) v1.push(val);
  }
  if (!timestamp || v1.length === 0) {
    throw new StripeError("Signature de webhook mal formée.", 400, "bad_signature");
  }

  const expected = crypto
    .createHmac("sha256", STRIPE.webhookSecret)
    .update(`${timestamp}.${payload}`, "utf8")
    .digest("hex");

  const expectedBuf = Buffer.from(expected, "hex");
  const matches = v1.some((sig) => {
    const sigBuf = Buffer.from(sig, "hex");
    return sigBuf.length === expectedBuf.length && crypto.timingSafeEqual(sigBuf, expectedBuf);
  });
  if (!matches) {
    throw new StripeError("Signature de webhook invalide.", 400, "invalid_signature");
  }

  const age = Math.floor(Date.now() / 1000) - Number(timestamp);
  if (!Number.isFinite(age) || Math.abs(age) > toleranceSec) {
    throw new StripeError("Webhook expiré (horodatage hors tolérance).", 400, "timestamp");
  }

  let event: StripeEvent;
  try {
    event = JSON.parse(payload) as StripeEvent;
  } catch {
    throw new StripeError("Corps de webhook illisible.", 400, "bad_payload");
  }
  return event;
}

/** Secondes Stripe (epoch) → Date, ou null. */
export function stripeDate(sec: number | null | undefined): Date | null {
  return sec == null ? null : new Date(sec * 1000);
}
