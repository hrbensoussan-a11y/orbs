// POST /api/billing/webhook — réception des événements Stripe.
//
// Cette route N'EST PAS authentifiée par session (c'est Stripe qui appelle) :
// l'authenticité est garantie par la SIGNATURE du webhook (secret partagé). On
// lit le corps BRUT (nécessaire au calcul de la signature), on vérifie, puis on
// réconcilie l'état de l'abonnement et des crédits.
//
// La route est exclue de la redirection d'auth par le proxy (préfixe /api/).

import { type NextRequest, NextResponse } from "next/server";
import {
  stripeConfigured,
  webhookConfigured,
  verifyWebhookSignature,
  StripeError,
} from "@/lib/billing/stripe";
import { handleStripeEvent } from "@/lib/billing/webhook";
import { markWebhookProcessed } from "@/lib/billing/store";

export const runtime = "nodejs";
// Les webhooks ne doivent jamais être mis en cache.
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  if (!stripeConfigured() || !webhookConfigured()) {
    // Non configuré : aucun webhook ne devrait arriver. On répond 503 sans
    // tenter de vérifier quoi que ce soit.
    return NextResponse.json(
      { error: "not_configured", message: "Webhooks Stripe non configurés." },
      { status: 503 },
    );
  }

  // Corps BRUT (ne pas parser avant la vérification de signature).
  const payload = await request.text();
  const signature = request.headers.get("stripe-signature");

  let event;
  try {
    event = verifyWebhookSignature(payload, signature);
  } catch (err) {
    const message = err instanceof StripeError ? err.message : "Signature invalide.";
    // 400 : Stripe considère l'événement comme non livré (pas de nouvelle tentative utile).
    return NextResponse.json({ error: "invalid_signature", message }, { status: 400 });
  }

  try {
    const result = await handleStripeEvent(event);
    // Marqué traité SEULEMENT après succès (sinon Stripe réessaie).
    await markWebhookProcessed(event.id, event.type);
    return NextResponse.json({ received: true, ...result });
  } catch (err) {
    // 500 : Stripe réessaiera la livraison (le traitement est idempotent).
    console.error(`[stripe] webhook ${event.type} (${event.id}) a échoué`, err);
    return NextResponse.json(
      { error: "processing_error", message: "Traitement du webhook échoué." },
      { status: 500 },
    );
  }
}
