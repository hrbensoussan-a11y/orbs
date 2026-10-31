"use client";

// Sélecteur de voix de l'assistant (popover) : 3 voix au choix + réglage
// « lire les réponses automatiquement ». Présentational : l'état (voix +
// lecture auto) vit dans le parent (AiChat) et persiste en localStorage.

import { useEffect, useRef, useState } from "react";
import { Volume2, Check } from "lucide-react";
import { VOICES, type VoiceId } from "@/lib/ai/voices";

export function VoicePicker({
  voice,
  autoplay,
  onVoice,
  onAutoplay,
}: {
  voice: VoiceId;
  autoplay: boolean;
  onVoice: (v: VoiceId) => void;
  onAutoplay: (v: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const current = VOICES.find((v) => v.id === voice) ?? VOICES[0];

  // Fermeture au clic extérieur / Échap.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="relative flex-none" ref={rootRef}>
      <button
        type="button"
        className="btn-ghost !px-2.5 !py-2"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Voix de l'assistant : ${current.label}`}
        title="Voix de l'assistant"
      >
        <Volume2 size={18} aria-hidden />
        <span className="hidden sm:inline text-sm">{current.label}</span>
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Voix de l'assistant"
          className="card absolute right-0 z-30 mt-2 p-2"
          style={{ width: 232 }}
        >
          <p className="px-2 pt-1 pb-1.5 text-xs font-semibold uppercase tracking-wide text-ink-3">
            Voix de l’assistant
          </p>
          <div className="flex flex-col gap-0.5">
            {VOICES.map((v) => {
              const selected = v.id === voice;
              return (
                <button
                  key={v.id}
                  type="button"
                  role="menuitemradio"
                  aria-checked={selected}
                  onClick={() => {
                    onVoice(v.id);
                    setOpen(false);
                  }}
                  className="flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-left"
                  style={
                    selected
                      ? { background: "color-mix(in srgb, var(--sky) 14%, transparent)" }
                      : undefined
                  }
                >
                  <span className="flex-1 min-w-0">
                    <span className={`block text-sm ${selected ? "font-semibold" : "font-medium"}`}>
                      {v.label}
                    </span>
                    <span className="block text-xs text-ink-3">{v.desc}</span>
                  </span>
                  {selected && <Check size={16} aria-hidden style={{ color: "var(--sky)" }} />}
                </button>
              );
            })}
          </div>

          <div className="mt-1.5 flex items-center justify-between gap-3 border-t border-line px-2 pt-2.5">
            <label htmlFor="voice-autoplay" className="text-sm text-ink-2 leading-snug">
              Lire les réponses automatiquement
            </label>
            <button
              id="voice-autoplay"
              type="button"
              role="switch"
              aria-checked={autoplay}
              aria-label="Lire les réponses automatiquement"
              onClick={() => onAutoplay(!autoplay)}
              className="relative h-7 w-12 flex-none rounded-full transition-colors"
              style={{
                background: autoplay
                  ? "var(--green)"
                  : "color-mix(in srgb, var(--ink-3) 40%, transparent)",
              }}
            >
              <span
                className="absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all"
                style={{ left: autoplay ? "24px" : "4px" }}
              />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
