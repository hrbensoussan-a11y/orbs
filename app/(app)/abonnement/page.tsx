import Link from "next/link";
import { ArrowLeft, CheckCircle2, Info, ArrowDownUp } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { getBillingState, recentLedger } from "@/lib/billing/store";
import { PLANS, PLAN_IDS, type PlanId } from "@/lib/billing/plans";
import { stripeConfigured } from "@/lib/billing/stripe";
import { reconcileFromCheckoutSession } from "@/lib/billing/webhook";
import { formatEur, formatShortDate, formatInt } from "@/lib/format";
import { CreditMeter } from "@/components/billing/CreditMeter";
import { BillingPanel, type PlanView } from "@/components/billing/BillingPanel";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  active: "Actif",
  trialing: "Essai",
  past_due: "Paiement en attente",
  canceled: "Résilié",
};

const LEDGER_LABEL: Record<string, string> = {
  grant_signup: "Crédits de bienvenue",
  grant_cycle: "Renouvellement des crédits",
  grant_upgrade: "Crédits (montée d'offre)",
  spend_chat: "Chat IA",
  spend_cards: "Fiches IA",
  spend_voice_stt: "Dictée vocale",
  spend_voice_tts: "Lecture à voix haute",
  expire_cycle: "Ajustement de fin de cycle",
  refund: "Remboursement",
  adjust: "Ajustement",
};

function planPrice(id: PlanId): string {
  const p = PLANS[id];
  return p.priceEur > 0 ? `${formatEur(p.priceEur)} / mois` : "Gratuit";
}

export default async function AbonnementPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();
  const sp = await searchParams;
  const status = typeof sp.status === "string" ? sp.status : undefined;
  const sessionId = typeof sp.session_id === "string" ? sp.session_id : undefined;

  // Retour de Checkout : on réconcilie tout de suite (sans attendre le webhook).
  if (status === "success" && sessionId && stripeConfigured()) {
    await reconcileFromCheckoutSession(user.id, sessionId).catch(() => {});
  }

  const billing = await getBillingState(user.id);
  const ledger = await recentLedger(user.id, 6);

  const ultraUnlocked = billing.entitlements.engines.includes("ultra");
  const devSim = !stripeConfigured() && process.env.NODE_ENV !== "production";

  const plans: PlanView[] = PLAN_IDS.map((id) => {
    const p = PLANS[id];
    return {
      id,
      name: p.name,
      tagline: p.tagline,
      price: planPrice(id),
      credits: p.monthlyCredits,
      features: p.features,
      highlight: !!p.highlight,
      hasUltra: p.entitlements.engines.includes("ultra"),
    };
  });

  const periodEnd = billing.subscription?.currentPeriodEnd ?? null;
  const periodEndLabel = periodEnd ? formatShortDate(periodEnd) : null;
  const statusLabel =
    billing.status !== "free" ? (STATUS_LABEL[billing.status] ?? null) : null;

  return (
    <div className="mx-auto max-w-2xl px-4 pt-[calc(env(safe-area-inset-top,0px)+18px)] flex flex-col gap-4">
      <div className="flex items-center gap-3 mb-1">
        <Link href="/compte" className="btn-ghost !px-2.5" aria-label="Retour">
          <ArrowLeft size={18} aria-hidden />
        </Link>
        <h1 className="text-2xl font-semibold">Abonnement & crédits</h1>
      </div>

      {/* Bannières de retour Checkout */}
      {status === "success" && (
        <div
          className="card px-4 py-3 text-sm flex items-start gap-2"
          style={{ background: "color-mix(in srgb, var(--green) 12%, var(--glass))" }}
          role="status"
        >
          <CheckCircle2 size={16} className="mt-0.5 shrink-0" style={{ color: "var(--green-ink)" }} aria-hidden />
          <span>Merci ! Ton abonnement est actif. Tes crédits ont été ajoutés à ton portefeuille.</span>
        </div>
      )}
      {status === "cancel" && (
        <div
          className="card px-4 py-3 text-sm flex items-start gap-2"
          style={{ background: "color-mix(in srgb, var(--amber) 10%, var(--glass))" }}
          role="status"
        >
          <Info size={16} className="mt-0.5 shrink-0" style={{ color: "var(--amber)" }} aria-hidden />
          <span>Paiement annulé — aucun montant n’a été débité. Tu peux réessayer quand tu veux.</span>
        </div>
      )}

      {/* Portefeuille de crédits */}
      <CreditMeter
        balance={billing.wallet.balance}
        allowance={billing.wallet.allowance}
        costs={billing.costs}
        ultraUnlocked={ultraUnlocked}
        cycleEnd={billing.wallet.cycleEnd}
        usage={billing.usage}
      />

      {/* Gestion + comparaison des offres (interactif) */}
      <BillingPanel
        plans={plans}
        currentPlan={billing.plan}
        hasPaidAccess={billing.hasPaidAccess}
        cancelAtPeriodEnd={billing.cancelAtPeriodEnd}
        periodEndLabel={periodEndLabel}
        statusLabel={statusLabel}
        stripeConfigured={stripeConfigured()}
        devSim={devSim}
      />

      {/* Activité récente du portefeuille */}
      {ledger.length > 0 && (
        <section className="card p-5">
          <h2 className="font-semibold mb-3 flex items-center gap-2">
            <ArrowDownUp size={16} aria-hidden style={{ color: "var(--ink-3)" }} /> Activité récente
          </h2>
          <ul className="flex flex-col divide-y divide-line">
            {ledger.map((m) => (
              <li key={m.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                <span className="min-w-0">
                  <span className="block truncate">{LEDGER_LABEL[m.reason] ?? m.reason}</span>
                  <span className="block text-xs text-ink-3">{formatShortDate(m.createdAt)}</span>
                </span>
                <span
                  className="font-semibold tabular-nums shrink-0"
                  style={{ color: m.delta >= 0 ? "var(--green-ink)" : "var(--ink-2)" }}
                >
                  {m.delta >= 0 ? "+" : "−"}
                  {formatInt(Math.abs(m.delta))}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="text-center text-xs text-ink-3 px-6 pb-2">
        Les crédits financent l’usage de l’IA (Core, Ultra, voix, fiches). Un seul portefeuille, des
        allocations renouvelées à chaque cycle. Paiement sécurisé par Stripe — aucune donnée de carte
        ne transite par Orbs.
      </p>
    </div>
  );
}
