"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { SUBJECT_TONE } from "@/lib/learn/types";
import {
  loadGrades,
  generalAverage,
  subjectAverages,
  fmt,
  type SubjectAverage,
} from "@/lib/grades/store";

function colorFor(avg: number): string {
  return avg >= 14 ? "var(--green-ink)" : avg >= 10 ? "var(--amber)" : "var(--coral)";
}

export function MoyenneCard() {
  const [general, setGeneral] = useState<number | null>(null);
  const [subs, setSubs] = useState<SubjectAverage[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const s = loadGrades();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setGeneral(generalAverage(s.grades));
    setSubs(subjectAverages(s.grades));
    setReady(true);
  }, []);

  return (
    <Link href="/notes" className="card p-5 block" aria-label="Mes notes">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-semibold">Mes notes</h2>
        <span className="chip inline-flex items-center gap-1">
          {general === null ? "Ajouter" : "Afficher"} <ChevronRight size={14} aria-hidden />
        </span>
      </div>

      {!ready ? (
        <p className="text-ink-3 text-sm">…</p>
      ) : general === null ? (
        <p className="text-ink-2 text-sm">
          Ajoute tes notes et suis ta moyenne par matière, sans attendre le bulletin.
        </p>
      ) : (
        <div className="flex items-center justify-between gap-4">
          <div className="flex flex-wrap gap-1.5 min-w-0">
            {subs.slice(0, 5).map((s) => (
              <span
                key={s.subject}
                className="rounded-full px-2.5 py-0.5 text-xs font-medium"
                style={{
                  background: `color-mix(in srgb, var(--${SUBJECT_TONE[s.subject] || "green"}) 14%, transparent)`,
                  color: `var(--${SUBJECT_TONE[s.subject] || "green"})`,
                }}
              >
                {s.subject} {fmt(s.average).replace(",00", "")}
              </span>
            ))}
          </div>
          <div className="text-right shrink-0">
            <p className="leading-none">
              <span
                className="display text-4xl font-semibold"
                style={{ color: colorFor(general) }}
              >
                {fmt(general)}
              </span>
              <span className="text-ink-3 text-lg"> /20</span>
            </p>
            <p className="text-sm text-ink-3 mt-1">Moyenne générale</p>
          </div>
        </div>
      )}
    </Link>
  );
}
