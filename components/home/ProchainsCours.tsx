"use client";

// « Prochains cours » de l'accueil : lit l'emploi du temps de l'agenda
// (rien d'inventé). Vide tant que l'élève n'a pas ajouté ses cours.

import { useEffect, useState } from "react";
import Link from "next/link";
import { MapPin, User, Clock } from "lucide-react";
import { loadAgenda, mondayIndex, DAYS, type Course } from "@/lib/agenda/store";
import { subjectColor, loadSubjectColors } from "@/lib/subjectColors";

type Upcoming = { course: Course; offset: number };

function minutes(hm: string): number {
  const [h, m] = hm.split(":");
  return (Number(h) || 0) * 60 + (Number(m) || 0);
}

/** Les prochains cours à partir de maintenant, sur les 7 jours qui viennent. */
function upcoming(courses: Course[], max: number): Upcoming[] {
  const now = new Date();
  const today = mondayIndex(now);
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const out: Upcoming[] = [];
  for (let offset = 0; offset < 7 && out.length < max; offset++) {
    const day = (today + offset) % 7;
    const list = courses
      .filter((c) => c.day === day && !(offset === 0 && minutes(c.end) <= nowMin))
      .sort((a, b) => minutes(a.start) - minutes(b.start));
    for (const course of list) {
      if (out.length >= max) break;
      out.push({ course, offset });
    }
  }
  return out;
}

export function ProchainsCours() {
  const [list, setList] = useState<Upcoming[] | null>(null);
  const [colors, setColors] = useState<Record<string, string>>({});

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setList(upcoming(loadAgenda().courses, 3));
    setColors(loadSubjectColors());
  }, []);

  return (
    <section className="card p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">Prochains cours</h2>
        <Link href="/agenda?vue=edt" className="chip">
          Voir l’agenda
        </Link>
      </div>

      {list === null ? (
        <div className="h-16" aria-hidden />
      ) : list.length === 0 ? (
        <div className="text-center py-3">
          <p className="font-semibold">Rien de prévu pour l’instant.</p>
          <p className="text-sm text-ink-3 mt-1">
            Ajoute tes cours dans l’agenda pour les retrouver ici.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {list.map(({ course: c, offset }) => {
            const col = subjectColor(c.subject, colors);
            const when = offset === 0 ? "Aujourd’hui" : offset === 1 ? "Demain" : DAYS[c.day];
            return (
              <div
                key={c.id}
                className="flex gap-3.5 items-stretch rounded-[var(--r-inner)] p-3.5"
                style={{ background: `color-mix(in srgb, ${col} 12%, transparent)` }}
              >
                <div className="flex flex-col justify-center text-sm shrink-0 w-14">
                  <span className="font-semibold display">{c.start}</span>
                  <span className="text-ink-3">{c.end}</span>
                </div>
                <span className="w-1 rounded-full" style={{ background: col }} aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="font-semibold leading-snug" style={{ color: col }}>
                    {c.subject}
                  </p>
                  {(c.room || c.teacher) && (
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1 text-sm text-ink-2">
                      {c.room && (
                        <span className="inline-flex items-center gap-1">
                          <MapPin size={14} aria-hidden /> {c.room}
                        </span>
                      )}
                      {c.teacher && (
                        <span className="inline-flex items-center gap-1">
                          <User size={14} aria-hidden /> {c.teacher}
                        </span>
                      )}
                    </div>
                  )}
                  <span className="inline-flex items-center gap-1 mt-2 text-sm text-ink-3">
                    <Clock size={13} aria-hidden /> {when}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
