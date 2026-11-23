"use client";

// Réglages de la bulle IA flottante (voir AiOrb).
// - Afficher / enlever la bulle.
// - Taille : petite / moyenne / grande.
// - Style : apparence de la bulle (6 styles, avec aperçu cliquable).
// Tout est stocké en localStorage ("orbs.aiorb.prefs") et appliqué en direct
// à la bulle via l'évènement "orbs:aiorb".

import { useEffect, useState } from "react";
import { EyeOff } from "lucide-react";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { OptionTile, Segmented, SettingRow, SettingsGroup, Switch } from "@/components/settings/controls";
import { readUserItem, writeUserItem } from "@/lib/userStorage";

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
  // Confirmation avant d'enlever la bulle (elle disparaît de toutes les pages).
  const [confirmHide, setConfirmHide] = useState(false);

  useEffect(() => {
    try {
      const raw = readUserItem(PREFS_KEY);
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
      writeUserItem(PREFS_KEY, JSON.stringify({ hidden: !nextShow, size: nextSize, style: nextStyle }));
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
    <>
      <SettingsGroup title="Bulle de l’assistant">
        <SettingRow
          id="bulle"
          title="Afficher la bulle"
          desc="Le petit rond qui ouvre l’assistant sur toutes les pages."
        >
          <Switch
            checked={show}
            onChange={(next) => {
              if (!next) setConfirmHide(true);
              else changeShow(true);
            }}
            label="Afficher la bulle IA"
          />
        </SettingRow>

        <SettingRow title="Taille" disabled={!show}>
          <Segmented
            value={size}
            options={SIZE_LABELS.map((s) => ({ value: s.key, label: s.label }))}
            onChange={changeSize}
            label="Taille de la bulle IA"
            disabled={!show}
          />
        </SettingRow>

        <SettingRow title="Style" desc="L’apparence de la bulle." stack disabled={!show}>
          <div
            className="st-tiles"
            role="radiogroup"
            aria-label="Style de la bulle IA"
            style={{ gridTemplateColumns: "repeat(auto-fill, minmax(88px, 1fr))" }}
          >
            {STYLE_LABELS.map((s) => {
              const d = PREVIEW_PX[size];
              return (
                <OptionTile
                  key={s.key}
                  selected={style === s.key}
                  onSelect={() => changeStyle(s.key)}
                  label={`Style ${s.label}`}
                  disabled={!show}
                  className="!items-center"
                >
                  <span className="grid place-items-center" style={{ height: 58 }} aria-hidden>
                    <span className="ai-orb ai-orb--sample" data-orb-style={s.key} style={{ width: d, height: d }}>
                      <span className="ai-orb-dot" />
                    </span>
                  </span>
                  <span className="st-swatch-label">{s.label}</span>
                </OptionTile>
              );
            })}
          </div>
        </SettingRow>
      </SettingsGroup>

      <ConfirmDialog
        open={confirmHide}
        tone="danger"
        icon={<EyeOff size={20} />}
        title="Enlever la bulle IA ?"
        message="Le petit rond qui ouvre l’assistant disparaîtra de toutes les pages. Tu pourras toujours ouvrir l’IA depuis le menu du bas, et la réafficher ici quand tu veux."
        confirmLabel="Oui, l’enlever"
        cancelLabel="Non, la garder"
        onCancel={() => setConfirmHide(false)}
        onConfirm={() => {
          setConfirmHide(false);
          changeShow(false);
        }}
      />
    </>
  );
}
