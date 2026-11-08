"use client";

// Panneau interactif d'abonnement : comparaison des offres + gestion.
//
// Toutes les données (offres, prix, statut) arrivent en PROPS depuis le composant
// serveur (app/(app)/abonnement/page.tsx) : aucune lecture de configuration ni de
// secret côté client. Les boutons appellent les server actions ; pour Checkout /
// Portail, on suit simplement l'URL hébergée par Stripe.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Sparkles, Zap, Loader2, ExternalLink, AlertCircle } from "lucide-react";
import {
  startCheckout,
  changePlan,
  cancelSubscription,
  resumeSubscription,
  openBillingPortal,
  devExpireNow,
  type BillingActionResult,
} from "@/app/actions/billing";

export type PlanView = {
  id: "free" | "plus" | "ultimate";
  name: string;
  tagline: string;
  price: string;
  credits: number;
  features: string[];
  highlight: boolean;
  hasUltra: boolean;
};

type Props = {
  plans: PlanView[];
  currentPlan: "free" | "plus" | "ultimate";
  hasPaidAccess: boolean;
  cancelAtPeriodEnd: boolean;
  periodEndLabel: string | null;
  statusLabel: string | null;
  stripeConfigured: boolean;
  devSim: boolean;
};

const RANK: Record<string, number> = { free: 0, plus: 1, ultimate: 2 };

export function BillingPanel({
  plans,
  currentPlan,
  hasPaidAccess,
  cancelAtPeriodEnd,
  periodEndLabel,
  statusLabel,
  stripeConfigured,
  devSim,
}: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(key: string, fn: () => Promise<BillingActionResult | void>) {
    setError(null);
    setBusy(key);
    try {
      const r = await fn();
      if (r && !r.ok) {
        setError(r.error);
        setBusy(null);
        return;
      }
      if (r && r.ok && r.url) {
        window.location.assign(r.url); // redirection vers Stripe (Checkout / Portail)
        return;
      }
      router.refresh();
    } catch {
      setError("Une erreur est survenue. Réessaie dans un instant.");
    }
    setBusy(null);
  }

  // Libellé + action du bouton principal d'une carte d'offre (Plus / Ultimate).
  function cardAction(plan: PlanView): { label: string; onClick: () => void } | null {
    if (plan.id === currentPlan) return null; // offre actuelle : pas de bouton d'action
    if (!hasPaidAccess) {
      // Aucun abonnement → souscription (il n'y a pas d'offre gratuite).
      return { label: `Choisir ${plan.name}`, onClick: () => run(`to_${plan.id}`, () => startCheckout(plan.id)) };
    }
    // Déjà abonné à l'autre offre → changement d'offre (montée ou baisse).
    return { label: `Passer à ${plan.name}`, onClick: () => run(`to_${plan.id}`, () => changePlan(plan.id)) };
  }

  return (
    <>
      {error && (
        <div
          className="card px-4 py-3 text-sm flex items-start gap-2"
          style={{ background: "color-mix(in srgb, var(--coral) 12%, var(--glass))" }}
          role="alert"
        >
          <AlertCircle size={16} className="mt-0.5 shrink-0" style={{ color: "var(--coral)" }} aria-hidden />
          <span>{error}</span>
        </div>
      )}

      {/* Gestion de l'abonnement en cours (si payant) */}
      {hasPaidAccess && (
        <section className="card p-5">
          <h2 className="font-semibold mb-1">Mon abonnement</h2>
          <p className="text-sm text-ink-2 mb-4">
            {cancelAtPeriodEnd ? (
              <>
                Résilié — tu gardes l’accès jusqu’au{" "}
                <span className="text-ink">{periodEndLabel ?? "la fin de la période"}</span>, puis
                retour à l’offre gratuite.
              </>
            ) : (
              <>
                {statusLabel ? <>Statut : <span className="text-ink">{statusLabel}</span>. </> : null}
                {periodEndLabel ? (
                  <>Prochain renouvellement le <span className="text-ink">{periodEndLabel}</span>.</>
                ) : null}
              </>
            )}
          </p>
          <div className="flex flex-wrap gap-2.5">
            {cancelAtPeriodEnd ? (
              <button
                className="btn-primary"
                disabled={busy !== null}
                onClick={() => run("resume", resumeSubscription)}
              >
                {busy === "resume" ? <Loader2 size={16} className="voice-spin" aria-hidden /> : null}
                Reprendre l’abonnement
              </button>
            ) : (
              <button
                className="btn-ghost"
                disabled={busy !== null}
                onClick={() => run("cancel", cancelSubscription)}
              >
                {busy === "cancel" ? <Loader2 size={16} className="voice-spin" aria-hidden /> : null}
                Résilier
              </button>
            )}
            {stripeConfigured && (
              <button
                className="btn-ghost"
                disabled={busy !== null}
                onClick={() => run("portal", openBillingPortal)}
              >
                {busy === "portal" ? (
                  <Loader2 size={16} className="voice-spin" aria-hidden />
                ) : (
                  <ExternalLink size={15} aria-hidden />
                )}
                Gérer le paiement et les factures
              </button>
            )}
          </div>
        </section>
      )}

      {/* Comparaison des offres */}
      <section className="flex flex-col gap-1">
        <h2 className="font-semibold px-1">Changer d’offre</h2>
        <p className="text-sm text-ink-2 px-1 mb-1">
          Toutes les offres partagent le même portefeuille de crédits. Tu peux changer ou résilier à
          tout moment.
        </p>
        <div className="grid gap-3.5 sm:grid-cols-2">
          {plans.map((plan) => {
            const isCurrent = plan.id === currentPlan;
            const action = cardAction(plan);
            return (
              <div
                key={plan.id}
                className="card p-5 flex flex-col gap-3 relative"
                style={
                  plan.highlight
                    ? { outline: "1.5px solid color-mix(in srgb, var(--green) 55%, transparent)" }
                    : undefined
                }
              >
                {plan.highlight && (
                  <span
                    className="chip absolute -top-2.5 left-5"
                    style={{ background: "var(--green)", color: "#fff", borderColor: "transparent" }}
                  >
                    Populaire
                  </span>
                )}
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="display text-lg font-semibold">{plan.name}</h3>
                    {isCurrent && (
                      <span className="chip" style={{ background: "color-mix(in srgb, var(--green) 16%, transparent)", color: "var(--green-ink)" }}>
                        Offre actuelle
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-ink-2 mt-0.5">{plan.tagline}</p>
                </div>

                <p className="display text-xl font-semibold">{plan.price}</p>

                <div className="flex items-center gap-2 flex-wrap text-xs">
                  <span className="chip" style={{ background: "color-mix(in srgb, var(--amber) 15%, transparent)", color: "var(--amber)" }}>
                    {plan.credits.toLocaleString("fr-FR")} crédits / mois
                  </span>
                  <span className="chip" style={{ background: "color-mix(in srgb, var(--sky) 14%, transparent)", color: "var(--sky)" }}>
                    <Sparkles size={12} aria-hidden className="mr-1" /> Core
                  </span>
                  {plan.hasUltra && (
                    <span className="chip" style={{ background: "color-mix(in srgb, var(--lilac) 16%, transparent)", color: "var(--lilac)" }}>
                      <Zap size={12} aria-hidden className="mr-1" /> Ultra
                    </span>
                  )}
                </div>

                <ul className="flex flex-col gap-1.5 text-sm text-ink-2 flex-1">
                  {plan.features.map((f, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <Check size={15} className="mt-0.5 shrink-0" style={{ color: "var(--green-ink)" }} aria-hidden />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>

                {action ? (
                  <button
                    className={plan.highlight || RANK[plan.id] > RANK[currentPlan] ? "btn-primary w-full" : "btn-ghost w-full"}
                    disabled={busy !== null}
                    onClick={action.onClick}
                  >
                    {busy === `to_${plan.id}` ? <Loader2 size={16} className="voice-spin" aria-hidden /> : null}
                    {action.label}
                  </button>
                ) : (
                  <button className="btn-ghost w-full" disabled>
                    Offre actuelle
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* Outils de développement (simulation sans Stripe) */}
      {devSim && (
        <section
          className="card p-4 text-sm"
          style={{ background: "color-mix(in srgb, var(--amber) 10%, var(--glass))" }}
        >
          <p className="font-semibold mb-1">Mode développement — simulation</p>
          <p className="text-ink-2 mb-3">
            Stripe n’est pas configuré : les abonnements sont simulés (aucune vraie transaction). En
            production, configure Stripe (voir <span className="text-ink">docs/abonnements.md</span>).
          </p>
          {hasPaidAccess && (
            <button
              className="btn-ghost"
              disabled={busy !== null}
              onClick={() => run("devexpire", devExpireNow)}
            >
              {busy === "devexpire" ? <Loader2 size={16} className="voice-spin" aria-hidden /> : null}
              Simuler l’expiration maintenant
            </button>
          )}
        </section>
      )}
    </>
  );
}
