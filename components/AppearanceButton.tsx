"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { Palette, X } from "lucide-react";

export const APPEARANCE_KEY = "orbs.appearance";

type Appearance = { theme: string; bg: string; dim: number };

const THEMES: [string, string][] = [
  ["light", "Clair"],
  ["warm", "Anti-lumière bleue"],
  ["dark", "Sombre"],
];
const BGS: [string, string, string][] = [
  ["rainbow", "Arc-en-ciel", "linear-gradient(135deg,#ffe1ce,#e7d3ff,#cff3df,#d5e7ff)"],
  ["mint", "Menthe", "linear-gradient(135deg,#d7f5e3,#bff0d6,#dcf3ea)"],
  ["sunset", "Coucher de soleil", "linear-gradient(135deg,#ffe0c9,#ffd9e0,#ffe9c7)"],
  ["ocean", "Océan", "linear-gradient(135deg,#cfe6ff,#d2f0f4,#dbe7ff)"],
  ["plain", "Uni", "linear-gradient(135deg,#eef1f5,#eef2f7)"],
];

function read(): Appearance {
  if (typeof window === "undefined") return { theme: "light", bg: "rainbow", dim: 0 };
  try {
    const o = JSON.parse(localStorage.getItem(APPEARANCE_KEY) || "{}");
    return {
      theme: o.theme || "light",
      bg: o.bg || "rainbow",
      dim: typeof o.dim === "number" ? o.dim : 0,
    };
  } catch {
    return { theme: "light", bg: "rainbow", dim: 0 };
  }
}
function apply(a: Appearance) {
  const r = document.documentElement;
  r.setAttribute("data-theme", a.theme);
  r.setAttribute("data-bg", a.bg);
  r.style.setProperty("--dim", String(a.dim));
}

export function AppearanceButton({ variant = "icon" }: { variant?: "icon" | "row" }) {
  const [open, setOpen] = useState(false);
  const [ap, setAp] = useState<Appearance>({ theme: "light", bg: "rainbow", dim: 0 });

  useEffect(() => {
    setAp(read());
  }, []);

  function update(patch: Partial<Appearance>) {
    setAp((prev) => {
      const next = { ...prev, ...patch };
      apply(next);
      try {
        localStorage.setItem(APPEARANCE_KEY, JSON.stringify(next));
      } catch {}
      return next;
    });
  }

  return (
    <>
      {variant === "row" ? (
        <button className="btn-ghost" onClick={() => setOpen(true)}>
          <Palette size={16} aria-hidden /> Apparence
        </button>
      ) : (
        <button
          className="glass-strong grid place-items-center h-11 w-11 rounded-full text-ink-2"
          onClick={() => setOpen(true)}
          title="Apparence"
          aria-label="Apparence"
        >
          <Palette size={19} strokeWidth={1.8} aria-hidden />
        </button>
      )}

      {open && (
        <div
          className="fixed inset-0 z-40 flex items-end justify-center"
          style={{ background: "rgba(31,41,68,.28)" }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <div
            className="glass-strong w-full max-w-[480px] p-4"
            style={{
              borderRadius: "26px 26px 0 0",
              paddingBottom: "calc(1rem + env(safe-area-inset-bottom,0px))",
            }}
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-lg">Apparence</h2>
              <button className="btn-ghost !px-2.5" onClick={() => setOpen(false)} aria-label="Fermer">
                <X size={18} aria-hidden />
              </button>
            </div>

            <div className="text-sm text-ink-2 mb-2">Thème</div>
            <div className="flex gap-2 mb-5">
              {THEMES.map(([v, l]) => {
                const on = ap.theme === v;
                const s: CSSProperties = {
                  borderColor: on ? "var(--green)" : "var(--glass-stroke)",
                  background: on ? "color-mix(in srgb,var(--green) 14%,transparent)" : "var(--fill)",
                  color: on ? "var(--green-ink)" : "var(--ink)",
                };
                return (
                  <button
                    key={v}
                    onClick={() => update({ theme: v })}
                    className="flex-1 rounded-[14px] py-2.5 px-1.5 text-sm font-medium border"
                    style={s}
                  >
                    {l}
                  </button>
                );
              })}
            </div>

            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-ink-2">Luminosité</span>
              <span className="text-xs text-ink-3">
                {ap.dim <= 0.02 ? "Normale" : ap.dim >= 0.9 ? "Faible" : "Douce"}
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              value={Math.round(ap.dim * 100)}
              onChange={(e) => update({ dim: Number(e.target.value) / 100 })}
              className="w-full mb-5"
              style={{ accentColor: "var(--green)" }}
              aria-label="Luminosité"
            />

            <div className="text-sm text-ink-2 mb-2">Fond d’écran</div>
            <div className="grid grid-cols-5 gap-2">
              {BGS.map(([v, l, g]) => {
                const on = ap.bg === v;
                return (
                  <button
                    key={v}
                    onClick={() => update({ bg: v })}
                    title={l}
                    className="flex flex-col items-center gap-1.5 border-0 bg-transparent"
                  >
                    <span
                      className="w-full rounded-[14px]"
                      style={{
                        aspectRatio: "1",
                        background: g,
                        boxShadow: on ? "0 0 0 2px var(--green)" : "inset 0 0 0 1px var(--glass-stroke)",
                      }}
                    />
                    <span className="text-[0.58rem] text-ink-3 text-center leading-tight">{l}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
