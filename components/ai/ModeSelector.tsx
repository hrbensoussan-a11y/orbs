"use client";

// Sélecteur de mode de réflexion (Luna / Terra), affiché près du champ de
// saisie du chat — dans l'esprit d'un sélecteur de modèle ChatGPT / Claude.
//
// Présentational : l'état (mode courant) vit dans le parent (AiChat) et persiste
// en localStorage. Changer de mode s'applique à la PROCHAINE réponse, dans la
// même conversation — aucune nouvelle discussion, aucun historique effacé.
//
// Accessibilité : bouton `aria-haspopup`, popover `role="menu"` avec des
// `menuitemradio`, navigation clavier (flèches / Début / Fin), fermeture au clic
// extérieur et à Échap. Compact et responsive (desktop + mobile).

import { useEffect, useRef, useState } from "react";
import { Moon, Globe, Check, ChevronDown } from "lucide-react";
import { AI_MODES, MODE_BY_ID, type AiModeId } from "@/lib/ai/modes";

/** Icône associée à chaque mode (Luna = lune, Terra = globe). */
const MODE_ICON: Record<AiModeId, typeof Moon> = { luna: Moon, terra: Globe };

export function ModeSelector({
  mode,
  onMode,
  disabled,
}: {
  mode: AiModeId;
  onMode: (m: AiModeId) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [shiftX, setShiftX] = useState(0); // recentrage horizontal si débordement
  const rootRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const itemsRef = useRef<(HTMLButtonElement | null)[]>([]);

  const current = MODE_BY_ID.get(mode) ?? AI_MODES[0];
  const CurrentIcon = MODE_ICON[current.id];

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

  // À l'ouverture : focus sur le mode actif (navigation clavier naturelle).
  useEffect(() => {
    if (!open) return;
    const idx = AI_MODES.findIndex((m) => m.id === mode);
    const t = setTimeout(() => itemsRef.current[Math.max(0, idx)]?.focus(), 0);
    return () => clearTimeout(t);
  }, [open, mode]);

  // Recentrage : sur écran étroit (panneau latéral affiché), le popover
  // ancré à gauche du bouton peut dépasser le bord. On le décale juste assez
  // pour le garder entièrement visible (marge de 8 px).
  useEffect(() => {
    if (!open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setShiftX(0);
      return;
    }
    const measure = () => {
      const el = menuRef.current;
      if (!el) return;
      const prev = el.style.transform;
      el.style.transform = "none"; // mesure la position « au repos »
      const r = el.getBoundingClientRect();
      el.style.transform = prev;
      const m = 8;
      let dx = 0;
      if (r.right > window.innerWidth - m) dx = window.innerWidth - m - r.right;
      if (r.left + dx < m) dx = m - r.left;
      setShiftX(Math.round(dx));
    };
    const raf = requestAnimationFrame(measure);
    window.addEventListener("resize", measure);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", measure);
    };
  }, [open]);

  function choose(id: AiModeId) {
    onMode(id);
    setOpen(false);
  }

  // Navigation clavier entre les options du menu.
  function onItemKeyDown(e: React.KeyboardEvent<HTMLButtonElement>, i: number) {
    const last = AI_MODES.length - 1;
    if (e.key === "ArrowDown" || e.key === "ArrowRight") {
      e.preventDefault();
      itemsRef.current[i === last ? 0 : i + 1]?.focus();
    } else if (e.key === "ArrowUp" || e.key === "ArrowLeft") {
      e.preventDefault();
      itemsRef.current[i === 0 ? last : i - 1]?.focus();
    } else if (e.key === "Home") {
      e.preventDefault();
      itemsRef.current[0]?.focus();
    } else if (e.key === "End") {
      e.preventDefault();
      itemsRef.current[last]?.focus();
    }
  }

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        className="btn-ghost !px-2.5 !py-1.5 !text-sm !rounded-[14px]"
        onClick={() => setOpen((v) => !v)}
        disabled={disabled}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Mode de réflexion : ${current.label} — ${current.tagline}. Changer de mode.`}
        title={`${current.label} — ${current.tagline}`}
      >
        <CurrentIcon size={15} aria-hidden style={{ color: "var(--sky)" }} />
        <span className="font-semibold">{current.label}</span>
        <span className="hidden sm:inline text-ink-3 font-normal">· {current.tagline}</span>
        <ChevronDown
          size={14}
          aria-hidden
          className="text-ink-3 transition-transform"
          style={{ transform: open ? "rotate(180deg)" : "none" }}
        />
      </button>

      {open && (
        <div
          ref={menuRef}
          role="menu"
          aria-label="Mode de réflexion"
          className="card absolute left-0 bottom-full z-30 mb-2 p-2"
          style={{
            width: 300,
            maxWidth: "calc(100vw - 16px)",
            transform: shiftX ? `translateX(${shiftX}px)` : undefined,
          }}
        >
          <p className="px-2 pt-1 pb-1.5 text-xs font-semibold uppercase tracking-wide text-ink-3">
            Mode de réflexion
          </p>
          <div className="flex flex-col gap-0.5">
            {AI_MODES.map((m, i) => {
              const selected = m.id === mode;
              const Icon = MODE_ICON[m.id];
              return (
                <button
                  key={m.id}
                  ref={(el) => {
                    itemsRef.current[i] = el;
                  }}
                  type="button"
                  role="menuitemradio"
                  aria-checked={selected}
                  onClick={() => choose(m.id)}
                  onKeyDown={(e) => onItemKeyDown(e, i)}
                  className="flex items-start gap-2.5 rounded-xl px-2.5 py-2 text-left"
                  style={
                    selected
                      ? { background: "color-mix(in srgb, var(--sky) 14%, transparent)" }
                      : undefined
                  }
                >
                  <span
                    className="mt-0.5 grid place-items-center rounded-full flex-none"
                    style={{
                      width: 28,
                      height: 28,
                      background: "color-mix(in srgb, var(--sky) 16%, transparent)",
                      color: "var(--sky)",
                    }}
                    aria-hidden
                  >
                    <Icon size={16} />
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="flex items-center gap-1.5">
                      <span className={`text-sm ${selected ? "font-semibold" : "font-medium"}`}>
                        {m.label}
                      </span>
                      <span className="text-xs text-ink-3">· {m.tagline}</span>
                      {selected && (
                        <Check size={15} aria-hidden style={{ color: "var(--sky)" }} className="ml-auto" />
                      )}
                    </span>
                    <span className="mt-0.5 block text-xs text-ink-2 leading-snug">
                      {m.description}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
