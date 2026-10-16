"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Send, Plus } from "lucide-react";
import {
  linkChild,
  sendCheer,
  createChallenge,
  type LinkState,
  type CheerState,
  type ChallengeState,
} from "@/app/actions/family";

export function LinkChildForm() {
  const [state, action, pending] = useActionState<LinkState, FormData>(linkChild, undefined);
  return (
    <form action={action} className="flex flex-col gap-2.5">
      <div className="flex gap-2">
        <input
          name="code"
          placeholder="ABC123"
          autoComplete="off"
          autoCapitalize="characters"
          maxLength={8}
          className="input flex-1 text-center tracking-[0.3em] font-semibold uppercase"
          aria-label="Code famille"
        />
        <button type="submit" className="btn-primary" disabled={pending}>
          {pending ? "…" : "Relier"}
        </button>
      </div>
      {state?.error && <p className="text-sm text-red-600 dark:text-red-400">{state.error}</p>}
    </form>
  );
}

type Sticker = { emoji: string; label: string };

export function CheerComposer({ childId, stickers }: { childId: string; stickers: readonly Sticker[] }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [sent, setSent] = useState<string | null>(null);
  const [state, action, pending] = useActionState<CheerState, FormData>(async (prev, fd) => {
    const res = await sendCheer(prev, fd);
    if (res?.ok) setSent(String(fd.get("sticker") ?? "🌟"));
    return res;
  }, undefined);

  // Réinitialise le formulaire et efface la confirmation après un envoi.
  useEffect(() => {
    if (!sent) return;
    formRef.current?.reset();
    const t = setTimeout(() => setSent(null), 2200);
    return () => clearTimeout(t);
  }, [sent]);

  return (
    <form ref={formRef} action={action} className="flex flex-col gap-3">
      <input type="hidden" name="childId" value={childId} />
      <div className="grid grid-cols-4 gap-2">
        {stickers.map((s, i) => (
          <label key={s.emoji} className="sticker" title={s.label}>
            <input type="radio" name="sticker" value={s.emoji} defaultChecked={i === 0} className="sr-only" />
            <span aria-hidden>{s.emoji}</span>
            <span className="sr-only">{s.label}</span>
          </label>
        ))}
      </div>
      <div className="flex gap-2">
        <input
          name="message"
          maxLength={140}
          placeholder="Un petit mot (optionnel)"
          className="input flex-1"
          aria-label="Message"
        />
        <button type="submit" className="btn-primary !px-3.5" disabled={pending} aria-label="Envoyer">
          <Send size={17} aria-hidden />
        </button>
      </div>
      {state?.error && <p className="text-sm text-red-600 dark:text-red-400">{state.error}</p>}
      {sent && (
        <p className="text-sm text-green-ink font-semibold flex items-center gap-2" role="status">
          <span className="pop text-2xl" aria-hidden>{sent}</span> Envoyé ! Il s’affichera sur son accueil.
        </p>
      )}
    </form>
  );
}

type Kind = { value: string; emoji: string; example: string; presets: number[] };

export function ChallengeComposer({ childId, kinds }: { childId: string; kinds: Kind[] }) {
  const [kind, setKind] = useState(kinds[0].value);
  const [target, setTarget] = useState(kinds[0].presets[1]);
  const [open, setOpen] = useState(false);
  const current = kinds.find((k) => k.value === kind) ?? kinds[0];
  const [state, action, pending] = useActionState<ChallengeState, FormData>(async (prev, fd) => {
    const res = await createChallenge(prev, fd);
    if (res?.ok) setOpen(false);
    return res;
  }, undefined);

  if (!open) {
    return (
      <button type="button" className="btn-ghost w-full justify-center" onClick={() => setOpen(true)}>
        <Plus size={16} aria-hidden /> Lancer un défi
      </button>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-3 rounded-[var(--r-inner)] bg-fill p-3.5">
      <input type="hidden" name="childId" value={childId} />
      <input type="hidden" name="kind" value={kind} />
      <p className="text-sm text-ink-2">Quel défi ?</p>
      <div className="flex flex-wrap gap-2">
        {kinds.map((k) => (
          <button
            key={k.value}
            type="button"
            onClick={() => {
              setKind(k.value);
              setTarget(k.presets[1]);
            }}
            className={`chip !cursor-pointer ${k.value === kind ? "!bg-[color-mix(in_srgb,var(--green)_18%,transparent)] !text-green-ink" : ""}`}
            aria-pressed={k.value === kind}
          >
            {k.emoji} {k.example}
          </button>
        ))}
      </div>
      <p className="text-sm text-ink-2">Objectif</p>
      <div className="flex flex-wrap items-center gap-2">
        {current.presets.map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => setTarget(n)}
            className={`chip !cursor-pointer tabular-nums ${n === target ? "!bg-[color-mix(in_srgb,var(--green)_18%,transparent)] !text-green-ink" : ""}`}
            aria-pressed={n === target}
          >
            {n}
          </button>
        ))}
        <input
          name="target"
          type="number"
          min={1}
          max={1000}
          value={target}
          onChange={(e) => setTarget(Number(e.target.value))}
          className="input !w-24 !py-1.5 text-center"
          aria-label="Objectif personnalisé"
        />
      </div>
      <input
        name="reward"
        maxLength={80}
        placeholder="Récompense promise (ex. : ciné samedi 🎬)"
        className="input"
        aria-label="Récompense"
      />
      {state?.error && <p className="text-sm text-red-600 dark:text-red-400">{state.error}</p>}
      <div className="flex gap-2 justify-end">
        <button type="button" className="btn-ghost" onClick={() => setOpen(false)}>
          Annuler
        </button>
        <button type="submit" className="btn-primary" disabled={pending}>
          {pending ? "…" : "Lancer le défi"}
        </button>
      </div>
    </form>
  );
}
