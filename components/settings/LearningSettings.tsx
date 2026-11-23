"use client";

// Réglages → Apprentissage.
//   - Objectif quotidien de révision : même valeur que le sélecteur de la page
//     Apprendre (lib/learn/store → settings.dailyGoal), utilisée par la
//     progression du jour et la carte de révision de l'accueil.
//   - Jours de repos (settings.restDays) : pas d'objectif imposé ces jours-là,
//     série protégée (lib/learn/rest), rappel de révision discret à l'accueil.
//     Le résumé envoyé à l'espace famille les inclut (série « vivante »).
//   - Minuteur de concentration : durées de travail et de pause, appliquées
//     par le minuteur lui-même (lib/learn/focus → FOCUS_TIMES_EVENT), qui
//     tourne en permanence dans l'app.

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronRight, Coffee, Leaf, Target, Timer } from "lucide-react";
import { PillToggles, SettingRow, SettingsGroup, Segmented } from "@/components/settings/controls";
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
    syncFocus();
    /* eslint-enable react-hooks/set-state-in-effect */
    window.addEventListener(FOCUS_EVENT, syncFocus);
    return () => window.removeEventListener(FOCUS_EVENT, syncFocus);
  }, []);

  function changeGoal(g: number) {
    // Relit l'état juste avant d'écrire : on ne touche qu'à l'objectif.
    const state = loadLearn();
    state.settings.dailyGoal = g;
    saveLearn(state);
    setGoal(g);
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
