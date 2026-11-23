"use client";

// Réglages → Assistant IA → Historique : conservation des conversations.
//
// La règle est enregistrée sur le compte (setAiRetention) ; chaque appareil
// l'applique à son propre historique (lib/ai/history). Aucun choix n'efface
// l'historique par surprise : « 30 jours » et « Ne pas conserver » demandent
// une confirmation qui dit exactement ce qui va se passer, et l'effacement
// complet est une action à part, confirmée elle aussi.

import { useState, useTransition } from "react";
import { Archive, Check, History, Trash2, Clock3, EyeOff } from "lucide-react";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { OptionTile, SettingRow, SettingsGroup } from "@/components/settings/controls";
import { AI_RETENTIONS, RETENTION_DAYS, type AiRetention } from "@/lib/ai/retention";
import { countExpiring, enforceRetention } from "@/lib/ai/history";
import { clearAiHistory, setAiRetention } from "@/app/actions/assistant";

const ICON: Record<AiRetention, React.ReactNode> = {
  keep: <Archive size={18} aria-hidden />,
  "30d": <Clock3 size={18} aria-hidden />,
  none: <EyeOff size={18} aria-hidden />,
};

type Pending = { mode: AiRetention; expiring: number } | null;

export function AiHistorySettings({
  initialRetention,
  initialClearedAt,
}: {
  initialRetention: AiRetention;
  initialClearedAt: number | null;
}) {
  const [mode, setMode] = useState<AiRetention>(initialRetention);
  const [clearedAt, setClearedAt] = useState<number | null>(initialClearedAt);
  const [confirm, setConfirm] = useState<Pending>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [status, setStatus] = useState<{ kind: "saved" | "cleared" | "error"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  function choose(next: AiRetention) {
    if (next === mode) return;
    if (next === "keep") return save(next);
    // Ce qui changerait tout de suite sur cet appareil (pour le dire avant).
    setConfirm({ mode: next, expiring: next === "30d" ? countExpiring("30d") : 0 });
  }

  function save(next: AiRetention) {
    const previous = mode;
    setConfirm(null);
    setMode(next);
    setStatus(null);
    startTransition(async () => {
      try {
        const res = await setAiRetention(next);
        if (!res.ok) throw new Error(res.error);
        // Appliquée tout de suite ici ; les autres appareils à leur ouverture.
        const removed = enforceRetention(next, clearedAt);
        const n = removed.convs.length + removed.threads.length;
        setStatus({
          kind: "saved",
          text: n > 0 ? `Enregistré · ${n} conversation${n > 1 ? "s" : ""} supprimée${n > 1 ? "s" : ""}` : "Enregistré",
        });
      } catch {
        setMode(previous);
        setStatus({ kind: "error", text: "L’enregistrement a échoué. Réessaie." });
      }
    });
  }

  function clearAll() {
    setConfirmClear(false);
    setStatus(null);
    startTransition(async () => {
      try {
        const res = await clearAiHistory();
        if (!res.ok) throw new Error(res.error);
        setClearedAt(res.clearedAt);
        enforceRetention(mode, res.clearedAt);
        setStatus({ kind: "cleared", text: "Historique supprimé" });
      } catch {
        setStatus({ kind: "error", text: "La suppression a échoué. Réessaie." });
      }
    });
  }

  const ask = confirm?.mode;

  return (
    <>
      <SettingsGroup
        title="Historique"
        footer="Tes conversations sont enregistrées uniquement sur tes appareils : les serveurs d’Orbs ne les gardent pas, ils transmettent tes messages à l’IA le temps de la réponse. La règle choisie s’applique sur chacun de tes appareils quand Orbs s’y ouvre."
      >
        <SettingRow
          id="conservation-conversations"
          icon={<History size={17} />}
          title="Conservation des conversations"
          desc="Combien de temps tes discussions avec l’assistant restent dans l’historique."
          stack
        >
          <div className="st-tiles st-tiles--3" role="radiogroup" aria-label="Conservation des conversations">
            {AI_RETENTIONS.map((r) => (
              <OptionTile key={r.id} selected={mode === r.id} onSelect={() => choose(r.id)} label={r.label}>
                <span className="st-chip st-chip--lilac" aria-hidden>
                  {ICON[r.id]}
                </span>
                <span className="st-tile-label">{r.label}</span>
                <span className="st-tile-sub">{r.desc}</span>
              </OptionTile>
            ))}
          </div>
          <p className="text-xs empty:hidden mt-2" aria-live="polite">
            {status && !pending && status.kind !== "error" && (
              <span className="st-saved">
                <Check size={13} aria-hidden /> {status.text}
              </span>
            )}
            {status?.kind === "error" && <span className="text-coral">{status.text}</span>}
          </p>
        </SettingRow>
        <SettingRow
          id="supprimer-historique"
          icon={<Trash2 size={17} />}
          title="Supprimer l’historique"
          desc="Efface toutes tes conversations avec l’assistant, sur tous tes appareils."
        >
          <button type="button" className="btn-ghost" onClick={() => setConfirmClear(true)} disabled={pending}>
            <span style={{ color: "var(--coral)" }}>Supprimer</span>
          </button>
        </SettingRow>
      </SettingsGroup>

      <ConfirmDialog
        open={ask === "30d"}
        icon={<Clock3 size={20} />}
        title={`Supprimer après ${RETENTION_DAYS} jours ?`}
        message={
          <>
            Chaque conversation sans activité depuis {RETENTION_DAYS} jours sera supprimée automatiquement,
            sur tous tes appareils.{" "}
            {confirm && confirm.expiring > 0
              ? `Sur cet appareil, ${confirm.expiring} conversation${confirm.expiring > 1 ? "s sont déjà inactives" : " est déjà inactive"} depuis plus de ${RETENTION_DAYS} jours : ${confirm.expiring > 1 ? "elles seront supprimées" : "elle sera supprimée"} tout de suite.`
              : "Aucune conversation de cet appareil n’est concernée pour l’instant."}
          </>
        }
        confirmLabel={`Oui, après ${RETENTION_DAYS} jours`}
        cancelLabel="Non"
        onCancel={() => setConfirm(null)}
        onConfirm={() => save("30d")}
      />
      <ConfirmDialog
        open={ask === "none"}
        icon={<EyeOff size={20} />}
        title="Ne plus conserver les conversations ?"
        message="Tes nouvelles discussions resteront disponibles pendant ta visite, puis disparaîtront quand tu quitteras ou rechargeras Orbs. Tes conversations actuelles ne sont pas effacées : tu peux les supprimer avec « Supprimer l’historique »."
        confirmLabel="Oui, ne plus conserver"
        cancelLabel="Non"
        onCancel={() => setConfirm(null)}
        onConfirm={() => save("none")}
      />
      <ConfirmDialog
        open={confirmClear}
        tone="danger"
        icon={<Trash2 size={20} />}
        title="Supprimer tout l’historique ?"
        message="Toutes tes conversations avec l’assistant seront supprimées de cet appareil tout de suite, et de tes autres appareils à leur prochaine ouverture d’Orbs. C’est définitif."
        confirmLabel="Oui, tout supprimer"
        cancelLabel="Non"
        onCancel={() => setConfirmClear(false)}
        onConfirm={clearAll}
      />
    </>
  );
}
