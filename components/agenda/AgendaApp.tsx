"use client";

import { useEffect, useState } from "react";
import {
  CalendarCheck,
  CalendarDays,
  Plus,
  Trash2,
  Check,
  MapPin,
  User,
  Clock,
} from "lucide-react";
import { SUBJECTS } from "@/lib/learn/types";
import { subjectColor } from "@/lib/subjectColors";
import {
  loadAgenda,
  saveAgenda,
  uid,
  dateKey,
  dueLabel,
  mondayIndex,
  DAYS,
  DAYS_SHORT,
  type AgendaState,
  type Homework,
  type Course,
} from "@/lib/agenda/store";

const SUBJ = [...SUBJECTS, "Autre"];
// La couleur d'une matière (celle choisie par l'élève, sinon celle par défaut).
function tone(subject: string): string {
  return subjectColor(subject);
}

type Tab = "devoirs" | "edt";

export function AgendaApp() {
  const [state, setState] = useState<AgendaState | null>(null);
  const [tab, setTab] = useState<Tab>("devoirs");

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setState(loadAgenda());
  }, []);

  function update(next: AgendaState) {
    saveAgenda(next);
    setState({ ...next });
  }

  if (!state) {
    return (
      <div className="mx-auto max-w-xl px-4 pt-24 text-center text-ink-3">Chargement…</div>
    );
  }

  return (
    <div className="mx-auto max-w-xl px-4 pt-[calc(env(safe-area-inset-top,0px)+18px)]">
      <h1 className="text-2xl font-semibold mb-4">Agenda</h1>

      <div className="flex gap-2 mb-5">
        <button
          onClick={() => setTab("devoirs")}
          className={tab === "devoirs" ? tabOn : tabOff}
        >
          <CalendarCheck size={16} aria-hidden /> Devoirs
        </button>
        <button onClick={() => setTab("edt")} className={tab === "edt" ? tabOn : tabOff}>
          <CalendarDays size={16} aria-hidden /> Emploi du temps
        </button>
      </div>

      {tab === "devoirs" ? (
        <Devoirs state={state} update={update} />
      ) : (
        <EmploiDuTemps state={state} update={update} />
      )}
    </div>
  );
}

const tabOn =
  "flex-1 inline-flex items-center justify-center gap-1.5 rounded-full py-2.5 text-sm font-medium bg-[var(--green)] text-white";
const tabOff =
  "flex-1 inline-flex items-center justify-center gap-1.5 rounded-full py-2.5 text-sm font-medium btn-ghost";

/* ======================= Devoirs ======================= */
function Devoirs({
  state,
  update,
}: {
  state: AgendaState;
  update: (s: AgendaState) => void;
}) {
  const [title, setTitle] = useState("");
  const [subject, setSubject] = useState("Autre");
  const [due, setDue] = useState(dateKey());

  function add() {
    const t = title.trim();
    if (!t) return;
    const hw: Homework = { id: uid("h"), title: t, subject, due, done: false };
    update({ ...state, homework: [...state.homework, hw] });
    setTitle("");
  }
  function toggle(id: string) {
    update({
      ...state,
      homework: state.homework.map((h) => (h.id === id ? { ...h, done: !h.done } : h)),
    });
  }
  function remove(id: string) {
    update({ ...state, homework: state.homework.filter((h) => h.id !== id) });
  }

  const todo = state.homework
    .filter((h) => !h.done)
    .sort((a, b) => a.due.localeCompare(b.due));
  const done = state.homework.filter((h) => h.done);

  return (
    <div className="flex flex-col gap-5">
      <section className="card p-4">
        <div className="flex items-center gap-2 font-semibold mb-3">
          <Plus size={17} className="text-green-ink" aria-hidden /> Ajouter un devoir
        </div>
        <input
          className="input mb-2.5"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") add();
          }}
          placeholder="ex. Exercices 4 à 7 p.52"
        />
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
        <div className="flex items-center gap-2">
          <input
            type="date"
            className="input max-w-44"
            value={due}
            onChange={(e) => setDue(e.target.value)}
            aria-label="Date du devoir"
          />
          <button className="btn-primary ml-auto" onClick={add} disabled={!title.trim()}>
            Ajouter
          </button>
        </div>
      </section>

      {todo.length === 0 && done.length === 0 && (
        <p className="text-center text-ink-3 text-sm py-6">
          Aucun devoir pour l’instant. Ajoute-en un ci-dessus 👆
        </p>
      )}

      {todo.length > 0 && (
        <section>
          <h2 className="font-semibold mb-2">À faire</h2>
          <div className="flex flex-col gap-2">
            {todo.map((h) => {
              const d = dueLabel(h.due);
              const color =
                d.tone === "late"
                  ? "var(--coral)"
                  : d.tone === "today"
                    ? "var(--green-ink)"
                    : d.tone === "soon"
                      ? "var(--amber)"
                      : "var(--ink-3)";
              return (
                <div key={h.id} className="card p-3 flex items-center gap-3">
                  <button
                    onClick={() => toggle(h.id)}
                    className="h-6 w-6 shrink-0 rounded-full border-2 grid place-items-center"
                    style={{ borderColor: "var(--line)" }}
                    aria-label="Marquer comme fait"
                  >
                    <Check size={13} className="text-ink-3 opacity-0" aria-hidden />
                  </button>
                  <div className="min-w-0 flex-1">
                    <div className="font-medium leading-snug">{h.title}</div>
                    <div className="flex items-center gap-2 mt-0.5 text-xs">
                      <span
                        className="rounded-full px-2 py-0.5 font-medium"
                        style={{
                          background: `color-mix(in srgb, ${tone(h.subject)} 16%, transparent)`,
                          color: tone(h.subject),
                        }}
                      >
                        {h.subject}
                      </span>
                      <span style={{ color }} className="font-medium">
                        {d.label}
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={() => remove(h.id)}
                    className="btn-ghost !px-2 shrink-0"
                    aria-label="Supprimer"
                  >
                    <Trash2 size={15} className="text-coral" aria-hidden />
                  </button>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {done.length > 0 && (
        <section>
          <h2 className="font-semibold mb-2 text-ink-3">Terminés ({done.length})</h2>
          <div className="flex flex-col gap-2">
            {done.map((h) => (
              <div key={h.id} className="card p-3 flex items-center gap-3 opacity-60">
                <button
                  onClick={() => toggle(h.id)}
                  className="h-6 w-6 shrink-0 rounded-full grid place-items-center text-white"
                  style={{ background: "var(--green)" }}
                  aria-label="Marquer comme à faire"
                >
                  <Check size={13} aria-hidden />
                </button>
                <div className="min-w-0 flex-1 font-medium line-through">{h.title}</div>
                <button
                  onClick={() => remove(h.id)}
                  className="btn-ghost !px-2 shrink-0"
                  aria-label="Supprimer"
                >
                  <Trash2 size={15} className="text-coral" aria-hidden />
                </button>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

/* ======================= Emploi du temps ======================= */
function EmploiDuTemps({
  state,
  update,
}: {
  state: AgendaState;
  update: (s: AgendaState) => void;
}) {
  const [day, setDay] = useState(() => mondayIndex());
  const [open, setOpen] = useState(false);
  const [start, setStart] = useState("08:00");
  const [end, setEnd] = useState("09:00");
  const [subject, setSubject] = useState("Autre");
  const [room, setRoom] = useState("");
  const [teacher, setTeacher] = useState("");

  function add() {
    const c: Course = {
      id: uid("c"),
      day,
      start,
      end,
      subject,
      room: room.trim() || undefined,
      teacher: teacher.trim() || undefined,
    };
    update({ ...state, courses: [...state.courses, c] });
    setRoom("");
    setTeacher("");
    setOpen(false);
  }
  function remove(id: string) {
    update({ ...state, courses: state.courses.filter((c) => c.id !== id) });
  }

  const dayCourses = state.courses
    .filter((c) => c.day === day)
    .sort((a, b) => a.start.localeCompare(b.start));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-1.5 overflow-x-auto no-scrollbar -mx-1 px-1 pb-1">
        {DAYS.map((d, i) => (
          <button
            key={d}
            onClick={() => setDay(i)}
            className={
              day === i
                ? "shrink-0 rounded-full px-3.5 py-1.5 text-sm font-medium bg-[var(--green)] text-white"
                : "shrink-0 btn-ghost !py-1.5 !px-3.5 text-sm"
            }
          >
            {DAYS_SHORT[i]}
          </button>
        ))}
      </div>

      {dayCourses.length === 0 ? (
        <p className="text-center text-ink-3 text-sm py-6">
          Rien le {DAYS[day].toLowerCase()}. Ajoute tes cours une fois, ils reviennent
          chaque semaine.
        </p>
      ) : (
        <div className="flex flex-col gap-2.5">
          {dayCourses.map((c) => (
            <div
              key={c.id}
              className="card p-3.5 flex items-stretch gap-3"
              style={{
                background: `color-mix(in srgb, ${tone(c.subject)} 10%, transparent)`,
              }}
            >
              <div className="flex flex-col justify-center text-sm w-14 shrink-0">
                <span className="font-semibold">{c.start}</span>
                <span className="text-ink-3">{c.end}</span>
              </div>
              <span
                className="w-1 rounded-full shrink-0"
                style={{ background: tone(c.subject) }}
              />
              <div className="min-w-0 flex-1">
                <div className="font-semibold" style={{ color: tone(c.subject) }}>
                  {c.subject}
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-0.5 text-sm text-ink-2">
                  {c.room && (
                    <span className="inline-flex items-center gap-1">
                      <MapPin size={13} aria-hidden /> {c.room}
                    </span>
                  )}
                  {c.teacher && (
                    <span className="inline-flex items-center gap-1">
                      <User size={13} aria-hidden /> {c.teacher}
                    </span>
                  )}
                </div>
              </div>
              <button
                onClick={() => remove(c.id)}
                className="btn-ghost !px-2 shrink-0 self-start"
                aria-label="Supprimer"
              >
                <Trash2 size={15} className="text-coral" aria-hidden />
              </button>
            </div>
          ))}
        </div>
      )}

      {open ? (
        <section className="card p-4 flex flex-col gap-3">
          <div className="font-semibold">Nouveau cours — {DAYS[day]}</div>
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1.5 text-sm text-ink-2">
              <Clock size={14} aria-hidden />
              <input
                type="time"
                className="input !py-1.5"
                value={start}
                onChange={(e) => setStart(e.target.value)}
                aria-label="Heure de début"
              />
            </label>
            <span className="text-ink-3">→</span>
            <input
              type="time"
              className="input !py-1.5"
              value={end}
              onChange={(e) => setEnd(e.target.value)}
              aria-label="Heure de fin"
            />
          </div>
          <div className="flex flex-wrap gap-1.5">
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
          <div className="flex gap-2">
            <input
              className="input"
              value={room}
              onChange={(e) => setRoom(e.target.value)}
              placeholder="Salle (optionnel)"
            />
            <input
              className="input"
              value={teacher}
              onChange={(e) => setTeacher(e.target.value)}
              placeholder="Prof (optionnel)"
            />
          </div>
          <div className="flex gap-2 justify-end">
            <button className="btn-ghost" onClick={() => setOpen(false)}>
              Annuler
            </button>
            <button className="btn-primary" onClick={add}>
              Ajouter le cours
            </button>
          </div>
        </section>
      ) : (
        <button className="btn-ghost w-full" onClick={() => setOpen(true)}>
          <Plus size={16} aria-hidden /> Ajouter un cours
        </button>
      )}
    </div>
  );
}
