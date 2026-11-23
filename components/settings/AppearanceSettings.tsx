"use client";

// Réglages → Apparence. Mêmes réglages et même stockage qu'avant
// (lib/appearance : thème, fond, luminosité, animations dans l'espace local
// du compte ; taille du texte sur le serveur, synchronisée entre appareils),
// présentés en ligne plutôt que dans une fenêtre.
//
// Lecture (confort, lib/reading) : taille du texte + espacement, appliqués
// aux zones de lecture seulement (journal, réponses de l'assistant).

import { useEffect, useState, useTransition } from "react";
import { Check, RotateCcw } from "lucide-react";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { SettingRow, SettingsGroup, Segmented, Switch, OptionTile } from "@/components/settings/controls";
import {
  APPEARANCE_EVENT,
  BACKGROUNDS,
  THEMES,
  applyAppearance,
  clearAppearance,
  readAppearance,
  readReducedMotion,
  saveAppearance,
  saveReducedMotion,
  type Appearance,
} from "@/lib/appearance";
import { FONT_SIZES } from "@/lib/constants";
import { setLineSpacing, setReadingSize } from "@/app/actions/settings";
import { LINE_SPACINGS, readingStyle, toLineSpacing, type LineSpacing } from "@/lib/reading";

/** Aperçu miniature de chaque thème (couleurs du thème, pas de la page). */
const THEME_PREVIEW: Record<string, { bg: string; bar: string; bar2: string }> = {
  light: { bg: "linear-gradient(135deg,#eef3f8,#f6f0fb)", bar: "rgba(255,255,255,.95)", bar2: "#38c172" },
  warm: { bg: "linear-gradient(135deg,#f4ead7,#ffe6c9)", bar: "rgba(255,250,240,.95)", bar2: "#f6a93b" },
  dark: { bg: "linear-gradient(135deg,#12141a,#1d2230)", bar: "rgba(255,255,255,.14)", bar2: "#5fd08a" },
};

const THEME_SUB: Record<string, string> = {
  light: "Lumineux et net",
  warm: "Teintes chaudes, plus douces le soir",
  dark: "Repose les yeux dans le noir",
};

const SIZES = [
  { value: "sm", label: "Petite" },
  { value: "base", label: "Normale" },
  { value: "lg", label: "Grande" },
] as const;

function dimLabel(dim: number): string {
  if (dim <= 0.02) return "Normale";
  if (dim >= 0.9) return "Très douce";
  if (dim >= 0.5) return "Douce";
  return "Légèrement atténuée";
}

export function AppearanceSettings({
  initialFontSize,
  initialLineSpacing,
}: {
  initialFontSize: string;
  initialLineSpacing: string;
}) {
  const [ap, setAp] = useState<Appearance | null>(null);
  const [reduced, setReduced] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [size, setSize] = useState(initialFontSize in FONT_SIZES ? initialFontSize : "base");
  const [savedSize, setSavedSize] = useState<"idle" | "saved" | "error">("idle");
  const [pending, startTransition] = useTransition();
  const [spacing, setSpacing] = useState<LineSpacing>(toLineSpacing(initialLineSpacing));
  const [savedSpacing, setSavedSpacing] = useState<"idle" | "saved" | "error">("idle");
  const [spacingPending, startSpacing] = useTransition();

  useEffect(() => {
    const sync = () => setAp(readAppearance());
    /* eslint-disable react-hooks/set-state-in-effect */
    sync();
    setReduced(readReducedMotion());
    /* eslint-enable react-hooks/set-state-in-effect */
    window.addEventListener(APPEARANCE_EVENT, sync);
    return () => window.removeEventListener(APPEARANCE_EVENT, sync);
  }, []);

  function update(patch: Partial<Appearance>) {
    setAp((prev) => {
      const next = { ...(prev ?? readAppearance()), ...patch };
      applyAppearance(next);
      saveAppearance(next);
      return next;
    });
  }

  function changeMotion(next: boolean) {
    setReduced(next);
    saveReducedMotion(next);
    document.documentElement.setAttribute("data-motion", next ? "reduced" : "full");
  }

  function changeSize(next: string) {
    const previous = size;
    setSize(next);
    setSavedSize("idle");
    startTransition(async () => {
      try {
        const res = await setReadingSize(next);
        if (res.ok) setSavedSize("saved");
        else {
          setSize(previous);
          setSavedSize("error");
        }
      } catch {
        setSize(previous);
        setSavedSize("error");
      }
    });
  }

  function changeSpacing(next: LineSpacing) {
    const previous = spacing;
    setSpacing(next);
    setSavedSpacing("idle");
    startSpacing(async () => {
      try {
        const res = await setLineSpacing(next);
        if (res.ok) setSavedSpacing("saved");
        else {
          setSpacing(previous);
          setSavedSpacing("error");
        }
      } catch {
        setSpacing(previous);
        setSavedSpacing("error");
      }
    });
  }

  function doReset() {
    clearAppearance();
    // Rechargement : les réglages de départ s'appliquent partout proprement.
    window.location.reload();
  }

  const a = ap ?? { theme: "", bg: "", dim: 0 };
  // Les thèmes « warm » et « dark » redéfinissent les couleurs du fond
  // (app/globals.css) : le choix du fond n'a d'effet qu'avec le thème Clair.
  const bgActive = a.theme === "" || a.theme === "light";

  return (
    <>
      <SettingsGroup title="Thème et fond">
        <SettingRow id="theme" title="Thème" desc="L’ambiance générale d’Orbs." stack>
          <div className="st-tiles st-tiles--3" role="radiogroup" aria-label="Thème">
            {THEMES.map(([id, label]) => {
              const p = THEME_PREVIEW[id];
              return (
                <OptionTile key={id} selected={a.theme === id} onSelect={() => update({ theme: id })} label={label}>
                  <span className="st-theme-preview" style={{ background: p.bg }} aria-hidden>
                    <i style={{ background: p.bar }} />
                    <i style={{ background: p.bar }} />
                    <i style={{ background: p.bar2 }} />
                  </span>
                  <span className="st-tile-label">{label}</span>
                  <span className="st-tile-sub hidden sm:block">{THEME_SUB[id]}</span>
                </OptionTile>
              );
            })}
          </div>
        </SettingRow>

        <SettingRow
          id="fond"
          title="Fond d’écran"
          desc={
            bgActive
              ? "Les couleurs qui flottent derrière le verre."
              : "Disponible avec le thème Clair : les thèmes Anti-lumière bleue et Sombre ont leurs propres couleurs."
          }
          stack
          disabled={!bgActive}
        >
          <div className="st-tiles st-tiles--swatch" role="radiogroup" aria-label="Fond d’écran">
            {BACKGROUNDS.map(([id, label, gradient]) => (
              <OptionTile
                key={id}
                selected={a.bg === id}
                onSelect={() => update({ bg: id })}
                label={label}
                disabled={!bgActive}
              >
                <span className="st-swatch" style={{ background: gradient }} aria-hidden />
                <span className="st-swatch-label">{label}</span>
              </OptionTile>
            ))}
          </div>
        </SettingRow>

        <SettingRow
          id="luminosite"
          title="Luminosité"
          desc="Atténue l’écran pour travailler le soir sans être ébloui·e."
          stack
        >
          <div className="flex items-center gap-3">
            <input
              type="range"
              min={0}
              max={100}
              value={Math.round(a.dim * 100)}
              onChange={(e) => update({ dim: Number(e.target.value) / 100 })}
              className="st-range"
              style={{ "--p": `${Math.round(a.dim * 100)}%` } as React.CSSProperties}
              aria-label="Luminosité"
              aria-valuetext={dimLabel(a.dim)}
            />
            <span className="st-value !min-w-[8.25rem]">{dimLabel(a.dim)}</span>
          </div>
        </SettingRow>
      </SettingsGroup>

      <SettingsGroup
        title="Lecture"
        footer="Enregistré sur ton compte : le même confort de lecture sur tous tes appareils. Les boutons et les menus ne changent pas."
      >
        <SettingRow
          id="taille-texte"
          title="Taille du texte"
          desc="Tes pages du journal et les réponses de l’assistant."
          stack
        >
          <Segmented
            value={size}
            options={SIZES}
            onChange={changeSize}
            label="Taille du texte du journal"
            disabled={pending}
          />
          <p className="text-xs empty:hidden mt-2" aria-live="polite">
            {savedSize === "saved" && !pending && (
              <span className="st-saved">
                <Check size={13} aria-hidden /> Enregistré
              </span>
            )}
            {savedSize === "error" && <span className="text-coral">L’enregistrement a échoué. Réessaie.</span>}
          </p>
        </SettingRow>

        <SettingRow
          id="espacement-texte"
          title="Espacement du texte"
          desc="L’espace entre les lignes et entre les paragraphes."
          stack
        >
          <Segmented
            value={spacing}
            options={LINE_SPACINGS}
            onChange={changeSpacing}
            label="Espacement du texte"
          />
          <p className="text-xs empty:hidden mt-2" aria-live="polite">
            {savedSpacing === "saved" && !spacingPending && (
              <span className="st-saved">
                <Check size={13} aria-hidden /> Enregistré
              </span>
            )}
            {savedSpacing === "error" && <span className="text-coral">L’enregistrement a échoué. Réessaie.</span>}
          </p>
          {/* Aperçu : la même mise en forme que les pages et les réponses. */}
          <div className="st-reading-preview" style={readingStyle(size, spacing)} aria-label="Aperçu de lecture">
            <div className="reading">
              <p>Aujourd’hui, j’ai enfin compris les fractions : il suffit de mettre les deux nombres sur le même dénominateur avant de les additionner.</p>
              <p>Demain, je refais les exercices 4 et 5 pour vérifier.</p>
            </div>
          </div>
        </SettingRow>
      </SettingsGroup>

      <SettingsGroup title="Confort">
        <SettingRow
          id="animations"
          title="Réduire les animations"
          desc="Moins de mouvements et de transitions. Plus reposant, et plus fluide sur un téléphone un peu lent."
        >
          <Switch checked={reduced} onChange={changeMotion} label="Réduire les animations" />
        </SettingRow>
        <SettingRow
          id="reinitialiser-apparence"
          title="Réinitialiser l’apparence"
          desc="Thème, fond, luminosité et animations reviennent comme au début."
        >
          <button type="button" className="btn-ghost" onClick={() => setConfirmReset(true)}>
            <RotateCcw size={15} aria-hidden /> Réinitialiser
          </button>
        </SettingRow>
      </SettingsGroup>

      <ConfirmDialog
        open={confirmReset}
        tone="danger"
        icon={<RotateCcw size={20} />}
        title="Réinitialiser l’apparence ?"
        message="Le thème, le fond, la luminosité et les animations reviennent aux réglages de départ. La page va se recharger. Ton compte et tes données ne changent pas."
        confirmLabel="Oui, réinitialiser"
        cancelLabel="Non"
        onCancel={() => setConfirmReset(false)}
        onConfirm={doReset}
      />
    </>
  );
}
