"use client";

// Réglages → Assistant IA : préférences de réponse.
//
// Style d'accompagnement (Guide / Équilibré / Direct) : enregistré sur le
// COMPTE (Settings.aiStyle, action serveur setAiStyle) et relu par le serveur
// à chaque message — toutes les discussions, tous les appareils.
//
// Mêmes clés que le chat (components/ai/AiChat) — l'espace local du compte :
//   - orbs.ai.mode      : mode de réflexion utilisé à l'ouverture du chat ;
//   - orbs.ai.voice     : voix de l'assistant vocal ;
//   - orbs.ai.voiceplay : "0" = ne pas lire les réponses automatiquement.
// Le chat relit ces valeurs à son ouverture ; les changer ici ou dans le chat
// revient au même.

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { Brain, Check, Headphones, Scale, Signpost, Sparkles, Target, Zap } from "lucide-react";
import { OptionTile, SettingRow, SettingsGroup, Switch } from "@/components/settings/controls";
import { AI_MODES, DEFAULT_MODE_ID, toModeId, type AiModeId } from "@/lib/ai/modes";
import { AI_STYLES, type AiStyleId } from "@/lib/ai/style";
import { DEFAULT_VOICE, VOICES, toVoiceId, type VoiceId } from "@/lib/ai/voices";
import { readUserItem, writeUserItem } from "@/lib/userStorage";
import { setAiStyle } from "@/app/actions/assistant";

const MODE_KEY = "orbs.ai.mode";
const VOICE_KEY = "orbs.ai.voice";
const AUTOPLAY_KEY = "orbs.ai.voiceplay";

const MODE_ICON: Record<AiModeId, React.ReactNode> = {
  luna: <Zap size={18} aria-hidden />,
  terra: <Brain size={18} aria-hidden />,
};

const STYLE_ICON: Record<AiStyleId, React.ReactNode> = {
  guide: <Signpost size={18} aria-hidden />,
  balanced: <Scale size={18} aria-hidden />,
  direct: <Target size={18} aria-hidden />,
};

function write(key: string, value: string): void {
  try {
    writeUserItem(key, value);
  } catch {
    /* stockage indisponible */
  }
}

export function AssistantSettings({
  hasPaidAccess,
  initialStyle,
}: {
  hasPaidAccess: boolean;
  /** Style enregistré sur le compte (lu côté serveur par la page). */
  initialStyle: AiStyleId;
}) {
  const [style, setStyle] = useState<AiStyleId>(initialStyle);
  const [styleSave, setStyleSave] = useState<"idle" | "saved" | "error">("idle");
  const [savingStyle, startStyleSave] = useTransition();
  const [mode, setMode] = useState<AiModeId>(DEFAULT_MODE_ID);
  const [voice, setVoice] = useState<VoiceId>(DEFAULT_VOICE);
  const [autoplay, setAutoplay] = useState(true);

  useEffect(() => {
    try {
      /* eslint-disable react-hooks/set-state-in-effect */
      const m = readUserItem(MODE_KEY);
      if (m) setMode(toModeId(m));
      const v = readUserItem(VOICE_KEY);
      if (v) setVoice(toVoiceId(v));
      setAutoplay(readUserItem(AUTOPLAY_KEY) !== "0");
      /* eslint-enable react-hooks/set-state-in-effect */
    } catch {
      /* valeurs par défaut */
    }
  }, []);

  function changeStyle(next: AiStyleId) {
    if (next === style) return;
    const previous = style;
    setStyle(next);
    setStyleSave("idle");
    startStyleSave(async () => {
      try {
        const res = await setAiStyle(next);
        if (res.ok) setStyleSave("saved");
        else {
          setStyle(previous);
          setStyleSave("error");
        }
      } catch {
        setStyle(previous);
        setStyleSave("error");
      }
    });
  }

  return (
    <>
      {!hasPaidAccess && (
        <div className="st-note st-note--info">
          <Sparkles size={17} className="shrink-0 mt-0.5" aria-hidden />
          <span>
            L’assistant fait partie d’Orbs Plus et d’Orbs Ultimate. Tes préférences sont déjà
            enregistrées : elles s’appliqueront dès l’activation.{" "}
            <Link href="/abonnement" className="st-link-btn">
              Voir les offres
            </Link>
          </span>
        </div>
      )}

      <SettingsGroup
        title="Accompagnement"
        footer={
          <>
            Enregistré sur ton compte : le même style dans toutes tes discussions, sur tous tes
            appareils. Pour une seule réponse, tape aussi <strong className="text-ink">#court</strong> ou{" "}
            <strong className="text-ink">#détaillé</strong> dans ta question.
          </>
        }
      >
        <SettingRow
          id="style-ia"
          title="Style d’accompagnement"
          desc="La façon dont l’assistant t’aide à comprendre."
          stack
        >
          <div className="st-tiles" role="radiogroup" aria-label="Style d’accompagnement" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
            {AI_STYLES.map((st) => (
              <OptionTile
                key={st.id}
                selected={style === st.id}
                onSelect={() => changeStyle(st.id)}
                label={`Style ${st.label}`}
              >
                <span className="st-chip st-chip--lilac" aria-hidden>
                  {STYLE_ICON[st.id]}
                </span>
                <span className="st-tile-label">{st.label}</span>
                <span className="st-tile-sub">{st.desc}</span>
              </OptionTile>
            ))}
          </div>
          <p className="text-xs empty:hidden mt-2" aria-live="polite">
            {styleSave === "saved" && !savingStyle && (
              <span className="st-saved">
                <Check size={13} aria-hidden /> Enregistré
              </span>
            )}
            {styleSave === "error" && <span className="text-coral">L’enregistrement a échoué. Réessaie.</span>}
          </p>
        </SettingRow>
      </SettingsGroup>

      <SettingsGroup title="Réponses" footer="Tu peux toujours changer de mode dans une discussion.">
        <SettingRow
          id="mode-ia"
          title="Mode de réflexion"
          desc="Le mode utilisé quand tu ouvres l’assistant."
          stack
        >
          <div className="st-tiles" role="radiogroup" aria-label="Mode de réflexion" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
            {AI_MODES.map((m) => (
              <OptionTile
                key={m.id}
                selected={mode === m.id}
                onSelect={() => {
                  setMode(m.id);
                  write(MODE_KEY, m.id);
                }}
                label={`Mode ${m.label}`}
              >
                <span className="st-chip st-chip--lilac" aria-hidden>
                  {MODE_ICON[m.id]}
                </span>
                <span className="st-tile-label">{m.label}</span>
                <span className="st-tile-sub">{m.description}</span>
              </OptionTile>
            ))}
          </div>
        </SettingRow>
      </SettingsGroup>

      <SettingsGroup title="Voix" footer="La voix est utilisée quand tu parles à l’assistant ou qu’il te lit sa réponse.">
        <SettingRow id="voix" title="Voix de l’assistant" stack>
          <div className="st-tiles st-tiles--3" role="radiogroup" aria-label="Voix de l’assistant">
            {VOICES.map((v) => (
              <OptionTile
                key={v.id}
                selected={voice === v.id}
                onSelect={() => {
                  setVoice(v.id);
                  write(VOICE_KEY, v.id);
                }}
                label={`Voix ${v.label}`}
              >
                <span className="st-tile-label">{v.label}</span>
                <span className="st-tile-sub">{v.desc}</span>
              </OptionTile>
            ))}
          </div>
        </SettingRow>
        <SettingRow
          id="lecture-auto"
          icon={<Headphones size={17} />}
          title="Lire les réponses à voix haute"
          desc="Après une question posée à l’oral, la réponse est lue automatiquement."
        >
          <Switch
            checked={autoplay}
            onChange={(v) => {
              setAutoplay(v);
              write(AUTOPLAY_KEY, v ? "1" : "0");
            }}
            label="Lire les réponses à voix haute"
          />
        </SettingRow>
      </SettingsGroup>
    </>
  );
}
