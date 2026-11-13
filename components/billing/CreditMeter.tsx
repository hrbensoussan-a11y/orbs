// Jauge du portefeuille de crédits (présentationnel — rendu côté serveur).
//
// Montre le solde restant du portefeuille UNIQUE, l'allocation du cycle, la date
// de renouvellement et une estimation « à quoi servent ces crédits » dérivée des
// coûts réels par action (Core / Ultra).

import { Coins, Sparkles, Zap, Lock } from "lucide-react";
import { formatInt, formatShortDate } from "@/lib/format";
import type { CreditOp } from "@/lib/billing/pricing";

export function CreditMeter({
  balance,
  allowance,
  costs,
  ultraUnlocked,
  cycleEnd,
  usage,
  hasPaidAccess,
}: {
  balance: number;
  allowance: number;
  costs: Record<CreditOp, number>;
  ultraUnlocked: boolean;
  cycleEnd: Date | null;
  usage: { core: number; ultra: number; other: number; total: number };
  hasPaidAccess: boolean;
}) {
  // Sans abonnement actif : aucun crédit. On invite à choisir une offre plutôt
  // que d'afficher une jauge vide (il n'existe pas d'allocation gratuite).
  if (!hasPaidAccess) {
    return (
      <section className="card p-5">
        <div className="flex items-center gap-2.5 mb-2">
          <span className="icon-chip amber">
            <Coins size={22} strokeWidth={1.9} aria-hidden />
          </span>
          <div>
            <h2 className="font-semibold leading-tight">Portefeuille de crédits</h2>
            <p className="text-sm text-ink-3 leading-snug">Aucun abonnement actif.</p>
          </div>
        </div>
        <p className="text-sm text-ink-2">
          Les crédits IA (Core &amp; Ultra, voix, fiches) sont inclus dans un abonnement. Choisis une
          offre ci-dessous pour commencer à utiliser l&apos;assistant.
        </p>
      </section>
    );
  }

  const pct = allowance > 0 ? Math.max(0, Math.min(100, (balance / allowance) * 100)) : 0;
  const coreMsgs = Math.floor(balance / costs.chat_core);
  const ultraMsgs = Math.floor(balance / costs.chat_ultra);
  const upct = (n: number) => (allowance > 0 ? Math.min(100, (n / allowance) * 100) : 0);

  return (
    <section className="card p-5">
      <div className="flex items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-2.5">
          <span className="icon-chip amber">
            <Coins size={22} strokeWidth={1.9} aria-hidden />
          </span>
          <div>
            <h2 className="font-semibold leading-tight">Portefeuille de crédits</h2>
            <p className="text-sm text-ink-3 leading-snug">
              Un seul solde pour Core, Ultra, la voix et les fiches.
            </p>
          </div>
        </div>
        <div className="text-right">
          <p className="display text-2xl font-semibold leading-none">{formatInt(balance)}</p>
          <p className="text-xs text-ink-3">crédits</p>
        </div>
      </div>

      <div className="meter" style={{ "--tone": "var(--amber)" } as React.CSSProperties}>
        <span style={{ width: `${pct}%` }} />
      </div>
      <div className="mt-1.5 flex items-center justify-between text-xs text-ink-2">
        <span>
          {formatInt(balance)} / {formatInt(allowance)} ce cycle
        </span>
        {cycleEnd && <span>Renouvellement le {formatShortDate(cycleEnd)}</span>}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2.5">
        <div className="rounded-[var(--r-inner)] p-3" style={{ background: "var(--fill)" }}>
          <p className="flex items-center gap-1.5 text-sm font-medium">
            <Sparkles size={15} aria-hidden style={{ color: "var(--sky)" }} /> Core
          </p>
          <p className="text-sm text-ink-2 mt-0.5">
            ≈ {formatInt(coreMsgs)} message{coreMsgs > 1 ? "s" : ""}
            <span className="text-ink-3"> · {costs.chat_core} créd./msg</span>
          </p>
        </div>
        <div
          className="rounded-[var(--r-inner)] p-3"
          style={{ background: "var(--fill)", opacity: ultraUnlocked ? 1 : 0.6 }}
        >
          <p className="flex items-center gap-1.5 text-sm font-medium">
            {ultraUnlocked ? (
              <Zap size={15} aria-hidden style={{ color: "var(--lilac)" }} />
            ) : (
              <Lock size={14} aria-hidden style={{ color: "var(--ink-3)" }} />
            )}{" "}
            Ultra
          </p>
          <p className="text-sm text-ink-2 mt-0.5">
            {ultraUnlocked ? (
              <>
                ≈ {formatInt(ultraMsgs)} message{ultraMsgs > 1 ? "s" : ""}
                <span className="text-ink-3"> · {costs.chat_ultra} créd./msg</span>
              </>
            ) : (
              <span className="text-ink-3">Réservé aux offres payantes</span>
            )}
          </p>
        </div>
      </div>

      {/* Consommation du cycle, répartie entre Core et Ultra (portefeuille unique) */}
      <div className="mt-4 pt-4 border-t border-line">
        <div className="flex items-center justify-between text-xs text-ink-2 mb-1.5">
          <span>Consommation ce cycle</span>
          <span>
            {formatInt(usage.total)} crédit{usage.total > 1 ? "s" : ""} utilisé
            {usage.total > 1 ? "s" : ""}
          </span>
        </div>
        <div
          className="flex overflow-hidden"
          style={{ height: 8, borderRadius: "var(--r-pill)", background: "var(--fill-2)" }}
          aria-hidden
        >
          {usage.core > 0 && (
            <div style={{ width: `${upct(usage.core)}%`, background: "var(--sky)" }} />
          )}
          {usage.ultra > 0 && (
            <div style={{ width: `${upct(usage.ultra)}%`, background: "var(--lilac)" }} />
          )}
          {usage.other > 0 && (
            <div style={{ width: `${upct(usage.other)}%`, background: "var(--ink-3)" }} />
          )}
        </div>
        <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-2">
          <span className="inline-flex items-center gap-1.5">
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--sky)" }} aria-hidden />
            Core · {formatInt(usage.core)}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--lilac)" }} aria-hidden />
            Ultra · {formatInt(usage.ultra)}
          </span>
          {usage.other > 0 && (
            <span className="inline-flex items-center gap-1.5">
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--ink-3)" }} aria-hidden />
              Voix & autres · {formatInt(usage.other)}
            </span>
          )}
        </div>
      </div>
    </section>
  );
}
