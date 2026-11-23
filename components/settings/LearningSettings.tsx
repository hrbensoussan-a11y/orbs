"use client";

// Réglages → Apprentissage.
//   - Objectif quotidien de révision : même valeur que le sélecteur de la page
//     Apprendre (lib/learn/store → settings.dailyGoal), utilisée par la
//     progression du jour et la carte de révision de l'accueil.
//   - Jours de repos (settings.restDays) : pas d'objectif imposé ces jours-là,
//     série protégée (lib/learn/rest), rappel de révision discret à l'accueil.
//     Le résumé envoyé à l'espace famille les inclut (série « vivante »).
//   - Intensité des révisions (settings.intensity) : espace réellement les
//     prochaines révisions dans la répétition espacée (lib/learn/sm2).
//   - Mode Concentration (lib/agenda/notifications → focusHold) : pendant une
//     session de travail, les rappels non essentiels attendent la fin.
//   - Minuteur de concentration : durées de travail et de pause, appliquées
//     par le minuteur lui-même (lib/learn/focus → FOCUS_TIMES_EVENT), qui
//     tourne en permanence dans l'app.

import { useEffect, useState } from "react";
import Link from "next/link";
import { BellOff, ChevronRight, Coffee, Gauge, Leaf, Target, Timer } from "lucide-react";
import { OptionTile, PillToggles, SettingRow, SettingsGroup, Segmented, Switch } from "@/components/settings/controls";
import { DEFAULT_INTENSITY, newCardExampleDays } from "@/lib/learn/intensity";
import type { Intensity } from "@/lib/learn/types";
import { loadNotifSettings, saveNotifSettings, NOTIF_EVENT } from "@/lib/agenda/notifications";
import { isPristine, load as loadLearn, save as saveLearn } from "@/lib/learn/store";
import { MAX_REST_DAYS, WEEKDAYS, isRestDay, sanitizeRestDays } from "@/lib/learn/rest";
import { summarize } from "@/lib/learn/summary";
import { syncLearnSummary } from "@/app/actions/family";
import {
  FOCUS_EVENT,
  FOCUS_OPEN_EVENT,
  FOCUS_PRESETS,
  FOCUS_TIMES_EVENT,
  loadFocus,
  type FocusTimes,
} from "@/lib/learn/focus";

const GOALS = [10, 20, 30, 50] as const;

const INTENSITIES: readonly { value: Intensity; label: string; sub: string }[] = [
  { value: "light", label: "Légère", sub: "Des révisions plus espacées : moins souvent sollicité·e." },
  { value: "balanced", label: "Équilibrée", sub: "Le rythme habituel de la répétition espacée." },
  { value: "intensive", label: "Intensive", sub: "Des révisions plus rapprochées pour bien ancrer." },
];

const DAY_OPTIONS = WEEKDAYS.map((d) => ({ id: String(d.id), label: d.short, ariaLabel: d.long }));

/** « le samedi et le dimanche », « le mercredi, le samedi et le dimanche »… */
function restSentence(days: number[]): string {
  const names = days.map((d) => `le ${WEEKDAYS[d].long.toLowerCase()}`);
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} et ${names[names.length - 1]}`;
}

const PRESET_NAMES: Record<string, string> = {
  "25-5": "Classique",
  "50-10": "Longue",
  "15-3": "Courte",
};

function clampInt(v: number, min: number, max: number): number | null {
  return Number.isFinite(v) ? Math.min(max, Math.max(min, Math.round(v))) : null;
}

export function LearningSettings() {
  const [goal, setGoal] = useState<number | null>(null);
  const [restDays, setRestDays] = useState<number[] | null>(null);
  const [intensity, setIntensity] = useState<Intensity | null>(null);
  const [focusHold, setFocusHold] = useState<boolean | null>(null);
  const [times, setTimes] = useState<FocusTimes | null>(null);
  const [draft, setDraft] = useState<{ work: string; brk: string }>({ work: "", brk: "" });

  useEffect(() => {
    const syncFocus = () => {
      const f = loadFocus();
      setTimes({ workMin: f.workMin, breakMin: f.breakMin });
      setDraft({ work: String(f.workMin), brk: String(f.breakMin) });
    };
    /* eslint-disable react-hooks/set-state-in-effect */
    const learn = loadLearn();
    setGoal(learn.settings.dailyGoal);
    setRestDays(learn.settings.restDays);
    setIntensity(learn.settings.intensity ?? DEFAULT_INTENSITY);
    setFocusHold(loadNotifSettings().focusHold);
    syncFocus();
    /* eslint-enable react-hooks/set-state-in-effect */
    const syncHold = () => setFocusHold(loadNotifSettings().focusHold);
    window.addEventListener(FOCUS_EVENT, syncFocus);
    window.addEventListener(NOTIF_EVENT, syncHold);
    return () => {
      window.removeEventListener(FOCUS_EVENT, syncFocus);
      window.removeEventListener(NOTIF_EVENT, syncHold);
    };
  }, []);

  function changeGoal(g: number) {
    // Relit l'état juste avant d'écrire : on ne touche qu'à l'objectif.
    const state = loadLearn();
    state.settings.dailyGoal = g;
    saveLearn(state);
    setGoal(g);
  }

  function changeIntensity(next: Intensity) {
    // Relit l'état juste avant d'écrire : on ne touche qu'à l'intensité.
    const state = loadLearn();
    state.settings.intensity = next;
    saveLearn(state);
    setIntensity(next);
  }

  function changeFocusHold(next: boolean) {
    setFocusHold(next);
    saveNotifSettings({ ...loadNotifSettings(), focusHold: next });
  }

  function toggleRestDay(day: number) {
    // Relit l'état juste avant d'écrire : on ne touche qu'aux jours de repos.
    const state = loadLearn();
    const current = state.settings.restDays;
    if (!current.includes(day) && current.length >= MAX_REST_DAYS) return;
    const next = current.includes(day)
      ? current.filter((d) => d !== day)
      : sanitizeRestDays([...current, day]);
    state.settings.restDays = next;
    saveLearn(state);
    setRestDays(next);
    // L'espace famille calcule la série « vivante » avec ces jours.
    if (!isPristine(state)) syncLearnSummary(summarize(state)).catch(() => {});
  }

  function applyTimes(workMin: number, breakMin: number) {
    window.dispatchEvent(
      new CustomEvent<FocusTimes>(FOCUS_TIMES_EVENT, { detail: { workMin, breakMin } }),
    );
  }

  function commitDraft() {
    if (!times) return;
    const w = clampInt(Number(draft.work), 1, 120) ?? times.workMin;
    const b = clampInt(Number(draft.brk), 1, 60) ?? times.breakMin;
    setDraft({ work: String(w), brk: String(b) });
    if (w !== times.workMin || b !== times.breakMin) applyTimes(w, b);
  }

  const presetKey = times ? `${times.workMin}-${times.breakMin}` : "";
  const presetOptions = FOCUS_PRESETS.map(([w, b]) => ({
    value: `${w}-${b}`,
    label: (
      <span className="flex flex-col items-center leading-tight">
        <span>{PRESET_NAMES[`${w}-${b}`] ?? `${w} / ${b}`}</span>
        <span className="text-[0.72rem] font-normal" style={{ color: "var(--st-desc)" }}>
          {w} + {b} min
        </span>
      </span>
    ),
  }));

  return (
    <>
      <SettingsGroup
        title="Révisions"
        footer={
          <>
            Chaque carte révisée compte. Tes paquets et ta progression se trouvent dans{" "}
            <Link href="/apprendre">Apprendre</Link>.
          </>
        }
      >
        <SettingRow
          id="objectif-quotidien"
          icon={<Target size={17} />}
          title="Objectif quotidien"
          desc="Nombre de cartes à réviser chaque jour pour valider ta journée."
          stack
        >
          {goal !== null && (
            <Segmented
              value={goal}
              options={GOALS.map((g) => ({
                value: g,
                label: (
                  <>
                    {g}
                    <span className="hidden sm:inline"> cartes</span>
                  </>
                ),
              }))}
              onChange={changeGoal}
              label="Objectif quotidien de révision"
            />
          )}
        </SettingRow>

        <SettingRow
          id="intensite-revisions"
          icon={<Gauge size={17} />}
          title="Intensité des révisions"
          desc="Le rythme auquel tes cartes reviennent, d’après tes réponses."
          stack
        >
          {intensity !== null && (
            <>
              <div className="st-tiles st-tiles--3" role="radiogroup" aria-label="Intensité des révisions">
                {INTENSITIES.map((it) => (
                  <OptionTile
                    key={it.value}
                    selected={intensity === it.value}
                    onSelect={() => changeIntensity(it.value)}
                    label={`Intensité ${it.label}`}
                  >
                    <span className="st-tile-label">{it.label}</span>
                    <span className="st-tile-sub">{it.sub}</span>
                    <span className="st-tile-sub font-semibold" style={{ color: "var(--ink-2)" }}>
                      Carte bien sue : {newCardExampleDays(it.value)} j
                    </span>
                  </OptionTile>
                ))}
              </div>
              <p className="text-xs mt-2.5" style={{ color: "var(--st-desc)" }}>
                S’applique à tes prochaines réponses ; les révisions déjà prévues gardent leur date.
                Tes XP, ta série et ta progression ne changent pas.
              </p>
            </>
          )}
        </SettingRow>

        <SettingRow
          id="jours-repos"
          icon={<Leaf size={17} />}
          title="Jours de repos"
          desc="Ces jours-là, pas d’objectif à atteindre et ta série est protégée. Réviser quand même compte en bonus."
          stack
        >
          {restDays !== null && (
            <>
              <PillToggles
                className="st-pills--days"
                options={DAY_OPTIONS}
                selected={restDays.map(String)}
                onToggle={(id) => toggleRestDay(Number(id))}
                label="Jours de repos"
                isDisabled={(_, on) => !on && restDays.length >= MAX_REST_DAYS}
              />
              <p className="text-xs mt-2.5" style={{ color: "var(--st-desc)" }} aria-live="polite">
                {restDays.length === 0
                  ? "Aucun jour de repos : l’objectif compte tous les jours."
                  : `Repos ${restSentence(restDays)}.`}
                {restDays.length >= MAX_REST_DAYS && " Il reste un jour pour avancer."}
                {isRestDay(restDays) && " Aujourd’hui, c’est repos 🌿"}
              </p>
            </>
          )}
        </SettingRow>
      </SettingsGroup>

      <SettingsGroup
        title="Concentration"
        footer="Pendant une session en cours, les nouvelles durées s’appliquent à la phase suivante."
      >
        <SettingRow
          id="minuteur"
          icon={<Timer size={17} />}
          title="Minuteur de concentration"
          desc="Alterne travail et pause. Chaque session terminée te rapporte de l’XP."
          stack
        >
          {times && (
            <Segmented
              value={presetKey}
              options={presetOptions}
              onChange={(k) => {
                const [w, b] = String(k).split("-").map(Number);
                applyTimes(w, b);
              }}
              label="Durées du minuteur"
            />
          )}
        </SettingRow>
        {times && (
          <>
            <SettingRow icon={<Timer size={17} />} title="Travail" desc="De 1 à 120 minutes.">
              <label className="flex items-center gap-2 st-num-unit">
                <input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={120}
                  className="st-num"
                  value={draft.work}
                  onChange={(e) => setDraft((d) => ({ ...d, work: e.target.value }))}
                  onBlur={commitDraft}
                  onKeyDown={(e) => e.key === "Enter" && commitDraft()}
                  aria-label="Durée de travail en minutes"
                />
                min
              </label>
            </SettingRow>
            <SettingRow icon={<Coffee size={17} />} title="Pause" desc="De 1 à 60 minutes.">
              <label className="flex items-center gap-2 st-num-unit">
                <input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={60}
                  className="st-num"
                  value={draft.brk}
                  onChange={(e) => setDraft((d) => ({ ...d, brk: e.target.value }))}
                  onBlur={commitDraft}
                  onKeyDown={(e) => e.key === "Enter" && commitDraft()}
                  aria-label="Durée de pause en minutes"
                />
                min
              </label>
            </SettingRow>
          </>
        )}
        {focusHold !== null && (
          <SettingRow
            id="mode-concentration"
            icon={<BellOff size={17} />}
            title="Mode Concentration"
            desc="Pendant une session de travail, les rappels de devoirs, du journal et du soir attendent la fin. Les rappels de cours restent annoncés."
          >
            <Switch checked={focusHold} onChange={changeFocusHold} label="Mode Concentration" />
          </SettingRow>
        )}
        <SettingRow title="Lancer une session" desc="Ouvre le minuteur, il continue même si tu changes de page.">
          <button
            type="button"
            className="btn-ghost"
            onClick={() => window.dispatchEvent(new Event(FOCUS_OPEN_EVENT))}
          >
            Ouvrir <ChevronRight size={15} aria-hidden />
          </button>
        </SettingRow>
      </SettingsGroup>
    </>
  );
}
