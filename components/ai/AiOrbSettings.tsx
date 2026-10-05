"use client";

// Réglages de la bulle IA flottante (voir AiOrb).
// - Afficher / enlever la bulle.
// - Taille : petite / moyenne / grande.
// Tout est stocké en localStorage ("orbs.aiorb.prefs") et appliqué en direct
// à la bulle via l'évènement "orbs:aiorb".

import { useEffect, useState } from "react";

const PREFS_KEY = "orbs.aiorb.prefs";
const SIZE_LABELS: { key: SizeKey; label: string }[] = [
  { key: "sm", label: "Petite" },
  { key: "md", label: "Moyenne" },
  { key: "lg", label: "Grande" },
];
const SIZE_KEYS = ["sm", "md", "lg"] as const;
type SizeKey = (typeof SIZE_KEYS)[number];
const PREVIEW_PX: Record<SizeKey, number> = { sm: 34, md: 42, lg: 54 };

export function AiOrbSettings() {
  const [show, setShow] = useState(true);
  const [size, setSize] = useState<SizeKey>("md");

  useEffect(() => {
    try {
      const raw = localStorage.getItem(PREFS_KEY);
      if (raw) {
        const p = JSON.parse(raw);
        /* eslint-disable react-hooks/set-state-in-effect */
        setShow(!p?.hidden);
        if (SIZE_KEYS.includes(p?.size)) setSize(p.size);
        /* eslint-enable react-hooks/set-state-in-effect */
      }
    } catch {
      /* réglages par défaut */
    }
  }, []);

  function persist(nextShow: boolean, nextSize: SizeKey) {
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify({ hidden: !nextShow, size: nextSize }));
    } catch {
      /* ignore */
    }
    // Prévient la bulle (même onglet) qu'elle doit se relire.
    window.dispatchEvent(new Event("orbs:aiorb"));
  }

  function changeShow(v: boolean) {
    setShow(v);
    persist(v, size);
  }
  function changeSize(v: SizeKey) {
    setSize(v);
    persist(show, v);
  }

  const dot = PREVIEW_PX[size];
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

      {/* Aperçu du logo */}
      <div className="flex items-center gap-3 border-t border-line pt-4">
        <span className="text-sm text-ink-2 flex-1">Aperçu</span>
        <span
          aria-hidden
          className="relative rounded-full flex-none transition-all"
          style={{
            width: dot,
            height: dot,
            background: "#17271f",
            opacity: show ? 1 : 0.35,
            boxShadow: "0 6px 16px rgba(0,0,0,.28)",
          }}
        >
          <span className="absolute rounded-full" style={{ inset: "8%", border: "1.5px solid rgba(121,224,172,.5)" }} />
          <span
            className="absolute rounded-full"
            style={{ width: "30%", height: "30%", left: "54%", top: "30%", background: "#79e0ac" }}
          />
        </span>
      </div>
    </div>
  );
}
