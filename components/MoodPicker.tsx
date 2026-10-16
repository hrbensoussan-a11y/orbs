"use client";

import { MOODS } from "@/lib/definitions";

export function MoodPicker({
  value,
  onChange,
}: {
  value: number | null;
  onChange: (v: number | null) => void;
}) {
  return (
    <div className="flex items-center gap-1.5">
      {MOODS.map((m) => {
        const active = value === m.value;
        return (
          <button
            key={m.value}
            type="button"
            title={m.label}
            aria-label={m.label}
            aria-pressed={active}
            onClick={() => onChange(active ? null : m.value)}
            className={`h-10 w-10 rounded-full text-xl transition ${
              active
                ? "bg-accent/20 ring-1 ring-accent"
                : "opacity-60 hover:opacity-100 hover:bg-surface-2"
            }`}
          >
            <span aria-hidden>{m.emoji}</span>
          </button>
        );
      })}
    </div>
  );
}
