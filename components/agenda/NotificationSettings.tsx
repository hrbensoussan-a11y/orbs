"use client";

// Réglages des notifications de l'agenda :
// - interrupteur général (demande la permission du navigateur),
// - choix de la sonnerie (avec aperçu à l'écoute),
// - volume,
// - rappel avant les cours (+ combien de temps avant),
// - résumé des devoirs (+ heure),
// - bouton « Tester ».
// Tout est stocké en local et appliqué en direct (événement orbs:notif).

import { useEffect, useState } from "react";
import { Bell, BellOff, Play, Volume2, CalendarClock, CalendarCheck } from "lucide-react";
import { RINGTONES } from "@/lib/sound/ringtones";
import { playRingtone, unlockOnGesture } from "@/lib/sound/ringtones";
import {
  loadNotifSettings,
  saveNotifSettings,
  requestNotifPermission,
  notifPermission,
  fireNotification,
  defaultNotifSettings,
  LEAD_CHOICES,
  type NotifSettings,
  type NotifPermission,
} from "@/lib/agenda/notifications";

export function NotificationSettings() {
  const [s, setS] = useState<NotifSettings | null>(null);
  const [perm, setPerm] = useState<NotifPermission>("default");

  useEffect(() => {
    unlockOnGesture();
    /* eslint-disable react-hooks/set-state-in-effect */
    setS(loadNotifSettings());
    setPerm(notifPermission());
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  function patch(next: Partial<NotifSettings>) {
    setS((prev) => {
      const merged = { ...(prev ?? defaultNotifSettings()), ...next };
      saveNotifSettings(merged);
      return merged;
    });
  }

  async function toggleEnabled() {
    if (!s) return;
    const next = !s.enabled;
    if (next) {
      const p = await requestNotifPermission();
      setPerm(p);
    }
    patch({ enabled: next });
  }

  function previewSound(id: string) {
    unlockOnGesture();
    playRingtone(id, s?.volume ?? 0.7).catch(() => {});
  }

  async function test() {
    if (!s) return;
    await fireNotification(
      "Test de rappel ✓",
      "C'est le son que tu entendras pour tes cours et tes devoirs.",
      s,
      "orbs-test",
    );
  }

  if (!s) return <div className="h-10" aria-hidden />;

  const dim = s.enabled ? "" : "opacity-50 pointer-events-none";

  return (
    <div className="flex flex-col gap-5">
      {/* Interrupteur général */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span
            className="grid place-items-center h-10 w-10 rounded-full shrink-0"
            style={{
              background: s.enabled
                ? "color-mix(in srgb, var(--green) 16%, transparent)"
                : "color-mix(in srgb, var(--ink-3) 16%, transparent)",
              color: s.enabled ? "var(--green-ink)" : "var(--ink-3)",
            }}
          >
            {s.enabled ? <Bell size={18} aria-hidden /> : <BellOff size={18} aria-hidden />}
          </span>
          <div>
            <p className="font-medium leading-snug">Rappels de l’agenda</p>
            <p className="text-sm text-ink-3 leading-snug">
              Cours qui approchent et devoirs du jour, avec une sonnerie.
            </p>
          </div>
        </div>
        <Toggle checked={s.enabled} onChange={toggleEnabled} label="Activer les rappels" />
      </div>

      {perm === "denied" && (
        <p className="text-sm text-coral">
          Les notifications sont bloquées par le navigateur. Autorise-les dans
          ses réglages pour voir les rappels à l’écran (la sonnerie, elle, joue
          quand Orbs est ouvert).
        </p>
      )}
      {perm === "unsupported" && s.enabled && (
        <p className="text-sm text-ink-3">
          Ce navigateur n’affiche pas de notifications. La sonnerie jouera quand
          Orbs est ouvert.
        </p>
      )}

      {/* Sonnerie */}
      <div className={`flex flex-col gap-2.5 ${dim}`}>
        <span className="font-medium">Sonnerie</span>
        <div className="grid grid-cols-2 gap-2">
          {RINGTONES.map((r) => {
            const on = s.sound === r.id;
            return (
              <button
                key={r.id}
                onClick={() => {
                  patch({ sound: r.id });
                  previewSound(r.id);
                }}
                className="flex items-center gap-2.5 rounded-[var(--r-inner)] px-3 py-2.5 text-left transition"
                style={{
                  border: on
                    ? "1.5px solid var(--green)"
                    : "1.5px solid var(--glass-stroke)",
                  background: on
                    ? "color-mix(in srgb, var(--green) 10%, transparent)"
                    : "transparent",
                }}
                aria-pressed={on}
              >
                <span className="text-xl leading-none" aria-hidden>
                  {r.emoji}
                </span>
                <span className="flex-1 font-medium text-sm">{r.name}</span>
                {r.id !== "silence" && (
                  <span
                    onClick={(e) => {
                      e.stopPropagation();
                      previewSound(r.id);
                    }}
                    className="grid place-items-center h-7 w-7 rounded-full shrink-0"
                    style={{ color: "var(--ink-3)" }}
                    aria-hidden
                  >
                    <Play size={13} />
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Volume */}
      <div className={`flex items-center gap-3 ${dim}`}>
        <Volume2 size={18} className="text-ink-2 shrink-0" aria-hidden />
        <input
          type="range"
          min={0}
          max={100}
          value={Math.round(s.volume * 100)}
          onChange={(e) => patch({ volume: Number(e.target.value) / 100 })}
          onMouseUp={() => previewSound(s.sound)}
          onTouchEnd={() => previewSound(s.sound)}
          className="flex-1 accent-[var(--green)]"
          aria-label="Volume de la sonnerie"
        />
        <span className="text-sm text-ink-3 w-10 text-right tabular-nums">
          {Math.round(s.volume * 100)}%
        </span>
      </div>

      {/* Rappel avant les cours */}
      <div className={`flex flex-col gap-3 border-t border-line pt-4 ${dim}`}>
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <CalendarClock size={18} className="text-ink-2 shrink-0" aria-hidden />
            <span className="font-medium">Avant un cours</span>
          </div>
          <Toggle
            checked={s.courses}
            onChange={() => patch({ courses: !s.courses })}
            label="Prévenir avant les cours"
          />
        </div>
        {s.courses && (
          <label className="flex items-center justify-between gap-3 pl-7">
            <span className="text-sm text-ink-2">Me prévenir</span>
            <select
              className="input max-w-44"
              value={s.leadMin}
              onChange={(e) => patch({ leadMin: Number(e.target.value) })}
              aria-label="Délai avant le cours"
            >
              {LEAD_CHOICES.map((m) => (
                <option key={m} value={m}>
                  {m === 0 ? "À l’heure du cours" : `${m} min avant`}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      {/* Résumé des devoirs */}
      <div className={`flex flex-col gap-3 border-t border-line pt-4 ${dim}`}>
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <CalendarCheck size={18} className="text-ink-2 shrink-0" aria-hidden />
            <span className="font-medium">Devoirs du jour</span>
          </div>
          <Toggle
            checked={s.homework}
            onChange={() => patch({ homework: !s.homework })}
            label="Résumé des devoirs"
          />
        </div>
        {s.homework && (
          <label className="flex items-center justify-between gap-3 pl-7">
            <span className="text-sm text-ink-2">Chaque jour à</span>
            <input
              type="time"
              className="input max-w-32"
              value={s.homeworkTime}
              onChange={(e) => patch({ homeworkTime: e.target.value })}
              aria-label="Heure du résumé des devoirs"
            />
          </label>
        )}
      </div>

      {/* Test */}
      <div className={`border-t border-line pt-4 ${dim}`}>
        <button className="btn-ghost w-full justify-center" onClick={test}>
          <Play size={15} aria-hidden /> Tester le rappel
        </button>
      </div>
    </div>
  );
}

/* Petit interrupteur accessible (role="switch"). */
function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: () => void;
  label: string;
}) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={onChange}
      className="relative shrink-0 rounded-full transition-colors"
      style={{
        width: 46,
        height: 28,
        background: checked ? "var(--green)" : "color-mix(in srgb, var(--ink-3) 35%, transparent)",
      }}
    >
      <span
        className="absolute top-1 rounded-full bg-white transition-all"
        style={{
          width: 20,
          height: 20,
          left: checked ? 22 : 4,
          boxShadow: "0 1px 3px rgba(0,0,0,.2)",
        }}
      />
    </button>
  );
}
