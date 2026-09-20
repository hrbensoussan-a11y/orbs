"use client";

import { useEffect, useRef, useState } from "react";
import { X, Play, Pause, RotateCcw } from "lucide-react";

const PRESETS = [
  { label: "25 / 5", w: 25, b: 5 },
  { label: "50 / 10", w: 50, b: 10 },
  { label: "15 / 3", w: 15, b: 3 },
];

export function Pomodoro({
  onFocus,
  onClose,
}: {
  onFocus: () => void;
  onClose: () => void;
}) {
  const [presetIdx, setPresetIdx] = useState(0);
  const presetRef = useRef(0);
  const phaseRef = useRef<"work" | "break">("work");
  const [phase, setPhaseState] = useState<"work" | "break">("work");
  const [running, setRunning] = useState(false);
  const [left, setLeft] = useState(PRESETS[0].w * 60_000);
  const [cycles, setCycles] = useState(0);
  const endAtRef = useRef(0);
  const onFocusRef = useRef(onFocus);
  onFocusRef.current = onFocus;

  function setPhase(p: "work" | "break") {
    phaseRef.current = p;
    setPhaseState(p);
  }

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => {
      const rem = endAtRef.current - Date.now();
      if (rem > 0) {
        setLeft(rem);
        return;
      }
      // Fin de phase
      if (phaseRef.current === "work") {
        onFocusRef.current();
        setCycles((c) => c + 1);
        setPhase("break");
        const b = PRESETS[presetRef.current].b * 60_000;
        endAtRef.current = Date.now() + b;
        setLeft(b);
      } else {
        setPhase("work");
        setLeft(PRESETS[presetRef.current].w * 60_000);
        setRunning(false);
      }
    }, 250);
    return () => clearInterval(id);
  }, [running]);

  function start() {
    endAtRef.current = Date.now() + left;
    setRunning(true);
  }
  function pause() {
    setLeft(Math.max(0, endAtRef.current - Date.now()));
    setRunning(false);
  }
  function reset() {
    setRunning(false);
    setPhase("work");
    setLeft(PRESETS[presetRef.current].w * 60_000);
  }
  function choose(i: number) {
    presetRef.current = i;
    setPresetIdx(i);
    setRunning(false);
    setPhase("work");
    setLeft(PRESETS[i].w * 60_000);
  }

  const mm = Math.floor(left / 60_000);
  const ss = Math.floor((left % 60_000) / 1000);
  const time = `${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;

  return (
    <div className="fixed inset-0 z-40 grid place-items-center p-4" style={{ background: "rgba(31,41,68,.25)" }}>
      <div className="glass-strong rounded-[var(--r-card)] p-6 w-full max-w-sm text-center relative">
        <button className="btn-ghost !px-2.5 absolute top-4 right-4" onClick={onClose} aria-label="Fermer">
          <X size={18} aria-hidden />
        </button>
        <h2 className="text-lg font-semibold">Concentration</h2>
        <p className="text-sm text-ink-2 mt-1">
          {phase === "work" ? "Au travail." : "Petite pause."}
        </p>

        <div className="my-6 display text-6xl font-semibold" style={{ color: phase === "work" ? "var(--green-ink)" : "var(--sky)" }}>
          {time}
        </div>

        <div className="flex justify-center gap-2 mb-5">
          {PRESETS.map((p, i) => (
            <button
              key={p.label}
              onClick={() => choose(i)}
              className={
                presetIdx === i
                  ? "rounded-full px-3 py-1.5 text-sm font-medium bg-[var(--green)] text-white"
                  : "btn-ghost !py-1.5 !px-3 text-sm"
              }
            >
              {p.label}
            </button>
          ))}
        </div>

        <div className="flex justify-center gap-3">
          {running ? (
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
          {cycles} cycle{cycles > 1 ? "s" : ""} terminé{cycles > 1 ? "s" : ""} aujourd’hui
        </p>
      </div>
    </div>
  );
}
