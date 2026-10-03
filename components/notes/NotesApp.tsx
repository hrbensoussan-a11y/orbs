"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { SUBJECTS, SUBJECT_TONE } from "@/lib/learn/types";
import {
  loadGrades,
  saveGrades,
  uid,
  dateKey,
  fmt,
  on20,
  subjectAverages,
  generalAverage,
  type GradesState,
  type Grade,
} from "@/lib/grades/store";

const SUBJ = [...SUBJECTS, "Autre"];
function tone(subject: string): string {
  return `var(--${SUBJECT_TONE[subject] || "green"})`;
}
function colorFor(avg: number): string {
  return avg >= 14 ? "var(--green-ink)" : avg >= 10 ? "var(--amber)" : "var(--coral)";
}

export function NotesApp() {
  const [state, setState] = useState<GradesState | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setState(loadGrades());
  }, []);

  function update(next: GradesState) {
    saveGrades(next);
    setState({ ...next });
  }

  if (!state) {
    return (
      <div className="mx-auto max-w-xl px-4 pt-24 text-center text-ink-3">Chargement…</div>
    );
  }

  const grades = state.grades;
  const general = generalAverage(grades);
  const subs = subjectAverages(grades);

  return (
    <div className="mx-auto max-w-xl px-4 pt-[calc(env(safe-area-inset-top,0px)+18px)]">
      <h1 className="text-2xl font-semibold mb-4">Mes notes</h1>

      {/* Moyenne générale */}
      <section className="card p-6 mb-5 text-center">
        {general === null ? (
          <p className="text-ink-2">
            Ajoute tes notes ci-dessous : ta moyenne se calcule toute seule.
          </p>
        ) : (
          <>
            <p className="leading-none">
              <span
                className="display text-5xl font-semibold"
                style={{ color: colorFor(general) }}
              >
                {fmt(general)}
              </span>
              <span className="text-ink-3 text-xl"> /20</span>
            </p>
            <p className="text-sm text-ink-3 mt-2">
              Moyenne générale · {subs.length} matière{subs.length > 1 ? "s" : ""}
            </p>
          </>
        )}
      </section>

      <AddGrade state={state} update={update} />

      {/* Par matière */}
      {subs.length > 0 && (
        <div className="flex flex-col gap-4 mt-5">
          {subs.map((s) => (
            <SubjectBlock
              key={s.subject}
              subject={s.subject}
              average={s.average}
              grades={grades.filter((g) => g.subject === s.subject)}
              onDelete={(id) =>
                update({ ...state, grades: grades.filter((g) => g.id !== id) })
              }
            />
          ))}
        </div>
      )}

      <p className="text-center text-xs text-ink-3 py-6">
        Tes notes sont enregistrées dans ton navigateur, rien n’est envoyé nulle part.
      </p>
    </div>
  );
}

function AddGrade({
  state,
  update,
}: {
  state: GradesState;
  update: (s: GradesState) => void;
}) {
  const [subject, setSubject] = useState("Maths");
  const [label, setLabel] = useState("");
  const [value, setValue] = useState("");
  const [coef, setCoef] = useState("1");
  const [outOf, setOutOf] = useState("20");
  const [date, setDate] = useState(dateKey());
  const [err, setErr] = useState<string | null>(null);

  function add() {
    const v = Number(value.replace(",", "."));
    const o = Number(outOf.replace(",", ".")) || 20;
    const c = Number(coef.replace(",", ".")) || 1;
    if (!Number.isFinite(v) || v < 0 || v > o) {
      setErr(`La note doit être entre 0 et ${o}.`);
      return;
    }
    const g: Grade = {
      id: uid(),
      subject,
      label: label.trim(),
      value: v,
      coef: Math.max(0.5, Math.min(20, c)),
      outOf: Math.max(1, o),
      date,
    };
    update({ ...state, grades: [...state.grades, g] });
    setLabel("");
    setValue("");
    setCoef("1");
    setOutOf("20");
    setErr(null);
  }

  return (
    <section className="card p-4">
      <div className="flex items-center gap-2 font-semibold mb-3">
        <Plus size={17} className="text-green-ink" aria-hidden /> Ajouter une note
      </div>

      <div className="flex flex-wrap gap-1.5 mb-3">
        {SUBJ.map((s) => (
          <button
            key={s}
            onClick={() => setSubject(s)}
            className={
              subject === s
                ? "rounded-full px-3 py-1 text-sm font-medium text-white"
                : "btn-ghost !py-1 !px-3 text-sm"
            }
            style={subject === s ? { background: tone(s) } : undefined}
          >
            {s}
          </button>
        ))}
      </div>

      <input
        className="input mb-2.5"
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        placeholder="Intitulé (ex. DS chapitre 3) — optionnel"
      />

      <div className="flex flex-wrap items-end gap-2.5">
        <label className="flex flex-col gap-1 text-sm text-ink-2">
          Note
          <div className="flex items-center gap-1">
            <input
              className="input !w-20 text-center"
              inputMode="decimal"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="14"
              aria-label="Note"
            />
            <span className="text-ink-3">/</span>
            <input
              className="input !w-14 text-center"
              inputMode="numeric"
              value={outOf}
              onChange={(e) => setOutOf(e.target.value)}
              aria-label="Barème"
            />
          </div>
        </label>
        <label className="flex flex-col gap-1 text-sm text-ink-2">
          Coef.
          <input
            className="input !w-16 text-center"
            inputMode="decimal"
            value={coef}
            onChange={(e) => setCoef(e.target.value)}
            aria-label="Coefficient"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm text-ink-2">
          Date
          <input
            type="date"
            className="input !py-1.5"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            aria-label="Date de la note"
          />
        </label>
        <button className="btn-primary ml-auto" onClick={add} disabled={!value.trim()}>
          Ajouter
        </button>
      </div>
      {err && (
        <p className="text-sm mt-2" style={{ color: "var(--coral)" }} role="alert">
          {err}
        </p>
      )}
    </section>
  );
}

function SubjectBlock({
  subject,
  average,
  grades,
  onDelete,
}: {
  subject: string;
  average: number;
  grades: Grade[];
  onDelete: (id: string) => void;
}) {
  const sorted = useMemo(
    () => [...grades].sort((a, b) => b.date.localeCompare(a.date)),
    [grades],
  );
  return (
    <section className="card p-4">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full" style={{ background: tone(subject) }} />
          <h2 className="font-semibold">{subject}</h2>
        </div>
        <span className="display font-semibold" style={{ color: colorFor(average) }}>
          {fmt(average)}
          <span className="text-ink-3 text-sm font-normal"> /20</span>
        </span>
      </div>
      <div className="flex flex-col divide-y divide-[var(--line)]">
        {sorted.map((g) => (
          <div key={g.id} className="flex items-center gap-3 py-2">
            <span
              className="display font-semibold w-16 shrink-0"
              style={{ color: colorFor(on20(g)) }}
            >
              {fmt(g.value).replace(",00", "")}
              <span className="text-ink-3 text-xs font-normal">/{g.outOf}</span>
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-sm leading-snug truncate">
                {g.label || "Note"}
                {g.coef !== 1 && <span className="text-ink-3"> · coef {fmt(g.coef).replace(",00", "")}</span>}
              </div>
              <div className="text-xs text-ink-3">
                {new Date(g.date + "T12:00:00").toLocaleDateString("fr-FR", {
                  day: "numeric",
                  month: "short",
                })}
              </div>
            </div>
            <button
              onClick={() => onDelete(g.id)}
              className="btn-ghost !px-2 shrink-0"
              aria-label="Supprimer la note"
            >
              <Trash2 size={15} className="text-coral" aria-hidden />
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}
