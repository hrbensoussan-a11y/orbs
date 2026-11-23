"use client";

// Minuteur de concentration GLOBAL (voir lib/learn/focus).
//
// Monté une fois dans le layout de l'app : il tourne en arrière-plan pendant
// qu'on travaille (on peut changer de page ou fermer la fenêtre, le minuteur
// continue) et reprend après un rechargement. Une petite pastille flottante
// montre le temps restant quand la fenêtre est fermée.
//
// Mode Concentration : pendant une phase de travail, les rappels non
// essentiels (devoirs, journal, soir) attendent la fin de la session — voir
// lib/agenda/notifications. La fenêtre et la pastille le montrent.

import { useCallback, useEffect, useRef, useState } from "react";
import { BellOff, X, Play, Pause, RotateCcw, Timer } from "lucide-react";
import {
  DEFERRABLE_LABELS,
  DEFERRED_EVENT,
  NOTIF_EVENT,
  loadDeferred,
  loadNotifSettings,
} from "@/lib/agenda/notifications";
import {
  loadFocus,
  saveFocus,
  awardFocusSession,
  fmtMs,
  FOCUS_OPEN_EVENT,
  FOCUS_PRESETS as PRESETS,
  FOCUS_TIMES_EVENT,
  type FocusState,
  type FocusTimes,
} from "@/lib/learn/focus";
import { dateKey } from "@/lib/learn/progress";
const clamp = (v: number, max: number, def: number) =>
  Number.isFinite(v) && v >= 1 ? Math.min(max, Math.round(v)) : def;

export function FocusTimer() {
  const [st, setSt] = useState<FocusState | null>(null);
  const stRef = useRef<FocusState | null>(null);
  const [open, setOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Mode Concentration : réglage (Réglages → Apprentissage) et rappels en attente.
  const [hold, setHold] = useState(true);
  const [waiting, setWaiting] = useState<string[]>([]);

  useEffect(() => {
    const sync = () => {
      setHold(loadNotifSettings().focusHold);
      setWaiting(loadDeferred());
    };
    sync();
    window.addEventListener(NOTIF_EVENT, sync);
    window.addEventListener(DEFERRED_EVENT, sync);
    return () => {
      window.removeEventListener(NOTIF_EVENT, sync);
      window.removeEventListener(DEFERRED_EVENT, sync);
    };
  }, []);

  const flash = useCallback((m: string) => {
    setToast(m);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2600);
  }, []);

  const commit = useCallback((next: FocusState) => {
    stRef.current = next;
    setSt(next);
    saveFocus(next);
  }, []);

  // État initial (localStorage absent côté serveur).
  useEffect(() => {
    const s = loadFocus();
    stRef.current = s;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSt(s);
  }, []);

  // Le bouton « Concentration » (page Apprendre) ouvre la fenêtre.
  useEffect(() => {
    const openH = () => setOpen(true);
    window.addEventListener(FOCUS_OPEN_EVENT, openH);
    return () => window.removeEventListener(FOCUS_OPEN_EVENT, openH);
  }, []);

  // Boucle de décompte : (re)démarre quand « running » bascule.
  const running = st?.running ?? false;
  useEffect(() => {
    if (!running) {
      if (tickRef.current) {
        clearInterval(tickRef.current);
        tickRef.current = null;
      }
      return;
    }
    tickRef.current = setInterval(() => {
      const cur = stRef.current;
      if (!cur || !cur.running) return;
      const rem = cur.endAt - Date.now();
      if (rem > 0) {
        const nx = { ...cur, left: rem };
        stRef.current = nx;
        setSt(nx);
        return;
      }
      if (cur.phase === "work") {
        awardFocusSession();
        flash("Concentration validée ✓");
        const today = dateKey();
        const cycles = (cur.cyclesDay === today ? cur.cycles : 0) + 1;
        commit({
          ...cur,
          phase: "break",
          cycles,
          cyclesDay: today,
          left: cur.breakMin * 60000,
          endAt: Date.now() + cur.breakMin * 60000,
        });
      } else {
        commit({ ...cur, phase: "work", running: false, endAt: 0, left: cur.workMin * 60000 });
        flash("Pause terminée — prêt·e à repartir.");
      }
    }, 250);
    return () => {
      if (tickRef.current) {
        clearInterval(tickRef.current);
        tickRef.current = null;
      }
    };
  }, [running, commit, flash]);

  const start = useCallback(() => {
    const cur = stRef.current;
    if (!cur) return;
    const left = cur.left > 0 ? cur.left : (cur.phase === "work" ? cur.workMin : cur.breakMin) * 60000;
    commit({ ...cur, running: true, left, endAt: Date.now() + left });
  }, [commit]);
  const pause = useCallback(() => {
    const cur = stRef.current;
    if (!cur) return;
    commit({ ...cur, running: false, left: Math.max(0, cur.endAt - Date.now()) });
  }, [commit]);
  const reset = useCallback(() => {
    const cur = stRef.current;
    if (!cur) return;
    commit({ ...cur, running: false, phase: "work", endAt: 0, left: cur.workMin * 60000 });
  }, [commit]);
  const setTimes = useCallback(
    (w: number, b: number) => {
      const cur = stRef.current;
      if (!cur) return;
      const workMin = clamp(w, 120, cur.workMin);
      const breakMin = clamp(b, 60, cur.breakMin);
      const nx: FocusState = { ...cur, workMin, breakMin };
      if (!cur.running) {
        nx.phase = "work";
        nx.left = workMin * 60000;
        nx.endAt = 0;
      }
      commit(nx);
    },
    [commit],
  );

  // Durées choisies depuis les Réglages (Apprentissage).
  useEffect(() => {
    const onTimes = (e: Event) => {
      const d = (e as CustomEvent<FocusTimes>).detail;
      if (d) setTimes(Number(d.workMin), Number(d.breakMin));
    };
    window.addEventListener(FOCUS_TIMES_EVENT, onTimes);
    return () => window.removeEventListener(FOCUS_TIMES_EVENT, onTimes);
  }, [setTimes]);

  if (!st) return null;
  const isWork = st.phase === "work";
  const tone = isWork ? "var(--green)" : "var(--sky)";
  // Mode Concentration en cours (session de travail lancée).
  const focusMode = hold && st.running && isWork;

  return (
    <>
      {/* Pastille flottante : visible quand ça tourne et que la fenêtre est fermée */}
      {st.running && !open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label={
            focusMode
              ? "Mode Concentration actif, rappels non essentiels en attente — ouvrir le minuteur"
              : "Minuteur de concentration en cours — ouvrir"
          }
          className="fixed left-1/2 -translate-x-1/2 z-[36] flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold text-white shadow-[var(--shadow-float)]"
          style={{ bottom: "calc(92px + env(safe-area-inset-bottom,0px))", background: tone }}
        >
          {focusMode ? <BellOff size={15} aria-hidden /> : <Timer size={16} aria-hidden />}
          <span className="display tabular-nums">{fmtMs(st.left)}</span>
          <span className="font-medium opacity-90">{isWork ? "Concentration" : "Pause"}</span>
        </button>
      )}

      {/* Fenêtre complète */}
      {open && (
        <div
          className="fixed inset-0 z-40 grid place-items-center p-4"
          style={{ background: "rgba(31,41,68,.25)" }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <div className="glass-strong rounded-[var(--r-card)] p-6 w-full max-w-sm text-center relative">
            <button
              type="button"
              className="btn-ghost !px-2.5 absolute top-4 right-4"
              onClick={() => setOpen(false)}
              aria-label="Fermer"
            >
              <X size={18} aria-hidden />
            </button>
            <h2 className="text-lg font-semibold">Concentration</h2>
            <p className="text-sm text-ink-2 mt-1">{isWork ? "Au travail." : "Petite pause."}</p>

            {hold && (
              <div
                className={`focus-mode${focusMode ? " is-on" : ""}`}
                role="status"
                aria-live="polite"
              >
                <BellOff size={16} aria-hidden className="shrink-0 mt-0.5" />
                <span className="text-left">
                  {focusMode ? (
                    <>
                      <strong className="font-semibold">Mode Concentration actif.</strong> Les rappels de
                      devoirs, du journal et du soir attendent la fin de la session ; ceux des cours
                      restent annoncés.
                      {waiting.length > 0 && (
                        <span className="block mt-1">
                          En attente : {waiting.map((k) => DEFERRABLE_LABELS[k] ?? k).join(", ")}.
                        </span>
                      )}
                    </>
                  ) : (
                    <>Pendant une session de travail, tes rappels non essentiels attendront la fin. Les cours restent annoncés.</>
                  )}
                </span>
              </div>
            )}

            <div className="my-4 display text-6xl font-semibold" style={{ color: isWork ? "var(--green-ink)" : "var(--sky)" }}>
              {fmtMs(st.left)}
            </div>

            {/* Choix rapides */}
            <div className="flex justify-center gap-2 mb-3 flex-wrap">
              {PRESETS.map(([w, b]) => {
                const on = st.workMin === w && st.breakMin === b;
                return (
                  <button
                    key={`${w}/${b}`}
                    type="button"
                    disabled={st.running}
                    onClick={() => setTimes(w, b)}
                    className={
                      on
                        ? "rounded-full px-3 py-1.5 text-sm font-medium bg-[var(--green)] text-white"
                        : "btn-ghost !py-1.5 !px-3 text-sm"
                    }
                    style={{ opacity: st.running ? 0.5 : 1 }}
                  >
                    {w} / {b}
                  </button>
                );
              })}
            </div>

            {/* Temps personnalisé */}
            <div className="flex justify-center items-end gap-5 mb-5 text-sm text-ink-2">
              <label className="flex flex-col items-center gap-1">
                Travail
                <span className="flex items-center gap-1">
                  <input
                    type="number"
                    min={1}
                    max={120}
                    defaultValue={st.workMin}
                    disabled={st.running}
                    onChange={(e) => setTimes(Number(e.target.value), st.breakMin)}
                    className="input w-16 text-center !py-1.5"
                  />
                  min
                </span>
              </label>
              <label className="flex flex-col items-center gap-1">
                Pause
                <span className="flex items-center gap-1">
                  <input
                    type="number"
                    min={1}
                    max={60}
                    defaultValue={st.breakMin}
                    disabled={st.running}
                    onChange={(e) => setTimes(st.workMin, Number(e.target.value))}
                    className="input w-16 text-center !py-1.5"
                  />
                  min
                </span>
              </label>
            </div>

            <div className="flex justify-center gap-3">
              {st.running ? (
                <button className="btn-ghost" onClick={pause}>
                  <Pause size={16} aria-hidden /> Pause
                </button>
              ) : (
                <button className="btn-primary" onClick={start}>
                  <Play size={16} aria-hidden /> Démarrer
                </button>
              )}
              <button className="btn-ghost" onClick={reset}>
                <RotateCcw size={15} aria-hidden /> Réinit.
              </button>
            </div>

            <p className="text-xs text-ink-3 mt-4">
              {st.cycles} cycle{st.cycles > 1 ? "s" : ""} aujourd’hui
            </p>
            <p className="text-xs text-ink-3 mt-1">
              Tu peux fermer cette fenêtre : le minuteur continue tout seul.
            </p>
          </div>
        </div>
      )}

      {toast && (
        <div
          className="fixed left-1/2 -translate-x-1/2 z-50 glass-strong rounded-full px-4 py-2 text-sm"
          style={{ bottom: "calc(140px + env(safe-area-inset-bottom,0px))" }}
        >
          {toast}
        </div>
      )}
    </>
  );
}
