"use client";

// Réglages de la bulle IA flottante (voir AiOrb).
// - Afficher / enlever la bulle.
// - Taille : petite / moyenne / grande.
// - Style : apparence de la bulle (6 styles, avec aperçu cliquable).
// Tout est stocké en localStorage ("orbs.aiorb.prefs") et appliqué en direct
// à la bulle via l'évènement "orbs:aiorb".

import { useEffect, useState } from "react";

const PREFS_KEY = "orbs.aiorb.prefs";

const SIZE_KEYS = ["sm", "md", "lg"] as const;
type SizeKey = (typeof SIZE_KEYS)[number];
const SIZE_LABELS: { key: SizeKey; label: string }[] = [
  { key: "sm", label: "Petite" },
  { key: "md", label: "Moyenne" },
  { key: "lg", label: "Grande" },
];

const STYLE_KEYS = ["minimal", "neon", "aurora", "violet", "clair", "contour"] as const;
type StyleKey = (typeof STYLE_KEYS)[number];
const STYLE_LABELS: { key: StyleKey; label: string }[] = [
  { key: "minimal", label: "Minimal" },
  { key: "neon", label: "Néon" },
  { key: "aurora", label: "Aurore" },
  { key: "violet", label: "Violet" },
  { key: "clair", label: "Clair" },
  { key: "contour", label: "Contour" },
];

const PREVIEW_PX: Record<SizeKey, number> = { sm: 34, md: 42, lg: 54 };

export function AiOrbSettings() {
  const [show, setShow] = useState(true);
  const [size, setSize] = useState<SizeKey>("md");
  const [style, setStyle] = useState<StyleKey>("minimal");

  useEffect(() => {
    try {
      const raw = localStorage.getItem(PREFS_KEY);
      if (raw) {
        const p = JSON.parse(raw);
        /* eslint-disable react-hooks/set-state-in-effect */
        setShow(!p?.hidden);
        if (SIZE_KEYS.includes(p?.size)) setSize(p.size);
        if (STYLE_KEYS.includes(p?.style)) setStyle(p.style);
        /* eslint-enable react-hooks/set-state-in-effect */
      }
    } catch {
      /* réglages par défaut */
    }
  }, []);

  function persist(nextShow: boolean, nextSize: SizeKey, nextStyle: StyleKey) {
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify({ hidden: !nextShow, size: nextSize, style: nextStyle }));
    } catch {
      /* ignore */
    }
    // Prévient la bulle (même onglet) qu'elle doit se relire.
    window.dispatchEvent(new Event("orbs:aiorb"));
  }

  function changeShow(v: boolean) {
    setShow(v);
    persist(v, size, style);
  }
  function changeSize(v: SizeKey) {
    setSize(v);
    persist(show, v, style);
  }
  function changeStyle(v: StyleKey) {
    setStyle(v);
    persist(show, size, v);
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Afficher / enlever */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <p>Afficher la bulle</p>
          <p className="text-sm text-ink-2">Le petit rond qui ouvre l’IA sur toutes les pages.</p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={show}
          aria-label="Afficher la bulle IA"
          onClick={() => changeShow(!show)}
          className="relative h-8 w-14 flex-none rounded-full transition-colors"
          style={{ background: show ? "var(--green)" : "color-mix(in srgb, var(--ink-3) 40%, transparent)" }}
        >
          <span
            className="absolute top-1 h-6 w-6 rounded-full bg-white shadow transition-all"
            style={{ left: show ? "26px" : "4px" }}
          />
        </button>
      </div>

      {/* Taille */}
      <div className="flex items-center justify-between gap-4 border-t border-line pt-4">
        <div>
          <p>Taille</p>
          <p className="text-sm text-ink-2">Agrandis ou réduis la bulle.</p>
        </div>
        <div className="flex gap-1.5" role="group" aria-label="Taille de la bulle IA">
          {SIZE_LABELS.map((s) => (
            <button
              key={s.key}
              type="button"
              aria-pressed={size === s.key}
              onClick={() => changeSize(s.key)}
              disabled={!show}
              className="chip"
              style={
                size === s.key
                  ? { background: "color-mix(in srgb, var(--green) 16%, transparent)", color: "var(--green-ink)", cursor: "pointer", opacity: show ? 1 : 0.5 }
                  : { cursor: "pointer", opacity: show ? 1 : 0.5 }
              }
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* Style (apparence) */}
      <div className="border-t border-line pt-4">
        <p>Style</p>
        <p className="text-sm text-ink-2">Choisis l’apparence de la bulle.</p>
        <div
          className="mt-3 flex flex-wrap gap-3"
          role="group"
          aria-label="Style de la bulle IA"
          style={{ opacity: show ? 1 : 0.5 }}
        >
          {STYLE_LABELS.map((s) => {
            const selected = style === s.key;
            const d = PREVIEW_PX[size];
            return (
              <button
                key={s.key}
                type="button"
                aria-pressed={selected}
                aria-label={`Style ${s.label}`}
                onClick={() => changeStyle(s.key)}
                disabled={!show}
                className="flex flex-col items-center gap-1.5 rounded-2xl px-3 py-2.5 transition-colors"
                style={{
                  cursor: show ? "pointer" : "default",
                  border: "1px solid",
                  borderColor: selected ? "var(--green)" : "var(--line)",
                  background: selected ? "color-mix(in srgb, var(--green) 10%, transparent)" : "transparent",
                }}
              >
                <span
                  className="ai-orb ai-orb--sample"
                  data-orb-style={s.key}
                  aria-hidden
                  style={{ width: d, height: d }}
                >
                  <span className="ai-orb-dot" />
                </span>
                <span className="text-xs" style={{ color: selected ? "var(--green-ink)" : "var(--ink-2)" }}>
                  {s.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
