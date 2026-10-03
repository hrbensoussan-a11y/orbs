"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { X, Check, RotateCw, ArrowLeft, ArrowRight, Trophy, Award, ChevronUp, ChevronDown } from "lucide-react";
import type { Card, Deck } from "@/lib/learn/types";
import { grade, previewInterval, dueCards, shuffle } from "@/lib/learn/sm2";
import { award, levelFromXp, recomputeBadges } from "@/lib/learn/progress";
import { answerMatches, clozeParse, tokenizeWords, maskedSet } from "@/lib/learn/text";
import type { LearnCtx } from "./ctx";
import type { Mode } from "./StudyPicker";

const PER_CARD: Mode[] = [
  "smart",
  "mcq",
  "write",
  "truefalse",
  "interro",
  "cloze",
  "order",
  "memorize_test",
];
const REVIEW_LIKE: Mode[] = ["smart", "interro", "cloze", "order", "memorize_test"];

type Rewards = {
  correct: number;
  total: number;
  seconds: number;
  xp: number;
  leveledTo: number | null;
  badges: string[];
  missed: Card[];
};

export function StudySession({
  ctx,
  deck,
  mode,
  onDone,
}: {
  ctx: LearnCtx;
  deck: Deck;
  mode: Mode;
  onDone: () => void;
}) {
  const initialQueue = useMemo(() => {
    if (REVIEW_LIKE.includes(mode)) {
      const due = dueCards(deck);
      return due.length ? due : shuffle(deck.cards);
    }
    return shuffle(deck.cards);
  }, [deck, mode]);

  const [queue, setQueue] = useState<Card[]>(initialQueue);
  const [index, setIndex] = useState(0);
  const [correct, setCorrect] = useState(0);
  const [wrong, setWrong] = useState(0);
  const missedRef = useRef<Map<string, Card>>(new Map());
  const startRef = useRef(0);
  const xpStartRef = useRef(ctx.s.stats.xp);
  const [rewards, setRewards] = useState<Rewards | null>(null);

  useEffect(() => {
    startRef.current = Date.now();
  }, []);

  const pool = useMemo(() => deck.cards.map((c) => c.d).filter(Boolean), [deck]);

  function finish(correctCount: number, total: number) {
    const xpNow = ctx.s.stats.xp;
    const before = levelFromXp(xpStartRef.current);
    const after = levelFromXp(xpNow);
    const badges = recomputeBadges(ctx.s);
    ctx.save();
    setRewards({
      correct: correctCount,
      total,
      seconds: Math.round((Date.now() - startRef.current) / 1000),
      xp: xpNow - xpStartRef.current,
      leveledTo: after > before ? after : null,
      badges,
      missed: [...missedRef.current.values()],
    });
  }

  /** Réponse à une carte (modes un-par-un). */
  function answer(card: Card, q: number, isCorrect: boolean) {
    grade(card, q);
    award(ctx.s, isCorrect ? "correct" : "attempt");
    ctx.save();
    const newCorrect = correct + (isCorrect ? 1 : 0);
    const newWrong = wrong + (isCorrect ? 0 : 1);
    setCorrect(newCorrect);
    setWrong(newWrong);
    if (!isCorrect) {
      missedRef.current.set(card.id, card);
      setQueue((qq) => [...qq, card]); // repousser pour la refaire
    }
    const totalQueue = queue.length + (isCorrect ? 0 : 1);
    if (index + 1 >= totalQueue) finish(newCorrect, newCorrect + newWrong);
    else setIndex((i) => i + 1);
  }

  if (rewards) return <EndScreen r={rewards} mode={mode} onRestart={() => restart()} onDone={onDone} />;

  function restart() {
    startRef.current = Date.now();
    xpStartRef.current = ctx.s.stats.xp;
    missedRef.current = new Map();
    setCorrect(0);
    setWrong(0);
    setIndex(0);
    setQueue(
      REVIEW_LIKE.includes(mode)
        ? (dueCards(deck).length ? dueCards(deck) : shuffle(deck.cards))
        : shuffle(deck.cards),
    );
    setRewards(null);
  }

  // --- Modes "activité entière" ---
  if (mode === "flashcards") return <Shell onClose={onDone}><Flashcards deck={deck} onFinish={(n) => finish(0, n)} /></Shell>;
  if (mode === "fiche") return <Shell onClose={onDone}><Fiche deck={deck} onFinish={(n) => finish(0, n)} /></Shell>;
  if (mode === "memorize_learn") return <Shell onClose={onDone}><MemorizeLearn deck={deck} onFinish={(n) => finish(0, n)} /></Shell>;
  if (mode === "match")
    return (
      <Shell onClose={onDone}>
        <MatchGame
          deck={deck}
          onFinish={(n, ok) => finish(ok, n)}
          grade={(cards) => {
            for (const c of cards) {
              grade(c, 4);
              award(ctx.s, "correct");
            }
            ctx.save();
          }}
        />
      </Shell>
    );

  // --- Modes un-par-un ---
  const card = queue[index];
  if (!card) return null; // sécurité (ne devrait pas arriver)
  const progress = `${Math.min(index + 1, queue.length)} / ${queue.length}`;

  return (
    <Shell onClose={onDone} progress={progress} correct={correct} wrong={wrong}>
      {mode === "smart" && <SmartCard key={index} card={card} onGrade={(q) => answer(card, q, q >= 3)} />}
      {mode === "interro" && <Interro key={index} card={card} onGrade={(q) => answer(card, q, q >= 3)} />}
      {mode === "mcq" && <Mcq key={index} card={card} pool={pool} onAnswer={(ok) => answer(card, ok ? 4 : 1, ok)} />}
      {mode === "write" && <WriteCard key={index} card={card} onAnswer={(ok) => answer(card, ok ? 4 : 1, ok)} />}
      {mode === "truefalse" && <TrueFalse key={index} card={card} pool={pool} onAnswer={(ok) => answer(card, ok ? 4 : 1, ok)} />}
      {mode === "cloze" && <ClozeCard key={index} card={card} onGrade={(q) => answer(card, q, q >= 3)} />}
      {mode === "order" && <OrderCard key={index} card={card} onGrade={(q) => answer(card, q, q >= 3)} />}
      {mode === "memorize_test" && <MemorizeTest key={index} card={card} onGrade={(q) => answer(card, q, q >= 3)} />}
    </Shell>
  );
}

/* ---------------- Coquille commune ---------------- */
function Shell({
  children,
  onClose,
  progress,
  correct,
  wrong,
}: {
  children: React.ReactNode;
  onClose: () => void;
  progress?: string;
  correct?: number;
  wrong?: number;
}) {
  return (
    <div className="mx-auto max-w-xl px-4 pt-[calc(env(safe-area-inset-top,0px)+14px)]">
      <div className="flex items-center justify-between gap-3 mb-5">
        <button className="btn-ghost !px-2.5" onClick={onClose} aria-label="Quitter">
          <X size={18} aria-hidden />
        </button>
        {progress && <span className="text-sm text-ink-2 font-medium display">{progress}</span>}
        <div className="flex items-center gap-3 text-sm">
          {correct !== undefined && <span className="text-green-ink">✓ {correct}</span>}
          {wrong !== undefined && wrong > 0 && <span className="text-coral">✗ {wrong}</span>}
        </div>
      </div>
      {children}
    </div>
  );
}

/* ---------------- Révision intelligente ---------------- */
function ivLabel(card: Card, q: number): string {
  if (q < 3) return "< 1 j";
  const d = previewInterval(card, q);
  return d <= 1 ? "1 j" : `${d} j`;
}
function SmartCard({ card, onGrade }: { card: Card; onGrade: (q: number) => void }) {
  const [shown, setShown] = useState(false);
  return (
    <div className="card p-6 flex flex-col gap-5 min-h-[46vh]">
      <div className="text-xs font-medium text-ink-3">Terme</div>
      <p className="text-2xl font-semibold">{card.t}</p>
      {shown ? (
        <>
          <div className="border-t border-line pt-4">
            <div className="text-xs font-medium text-ink-3 mb-1">Définition</div>
            <p className="text-lg leading-relaxed">{card.d}</p>
          </div>
          <div className="mt-auto grid grid-cols-2 sm:grid-cols-4 gap-2">
            {[
              { q: 1, label: "À refaire", tone: "var(--coral)" },
              { q: 3, label: "Difficile", tone: "var(--amber)" },
              { q: 4, label: "Bien", tone: "var(--sky)" },
              { q: 5, label: "Facile", tone: "var(--green)" },
            ].map((b) => (
              <button
                key={b.q}
                onClick={() => onGrade(b.q)}
                className="rounded-[var(--r-inner)] border border-line py-2.5 px-2 text-sm font-medium transition hover:-translate-y-[2px]"
                style={{ background: `color-mix(in srgb, ${b.tone} 12%, transparent)`, color: b.tone }}
              >
                {b.label}
                <span className="block text-[0.7rem] opacity-70 font-normal">{ivLabel(card, b.q)}</span>
              </button>
            ))}
          </div>
        </>
      ) : (
        <button className="btn-primary mt-auto self-center px-8" onClick={() => setShown(true)}>
          Afficher la réponse
        </button>
      )}
    </div>
  );
}

/* ---------------- Interro (questions) ---------------- */
function Interro({ card, onGrade }: { card: Card; onGrade: (q: number) => void }) {
  const [shown, setShown] = useState(false);
  return (
    <div className="card p-6 flex flex-col gap-5 min-h-[46vh]">
      <div className="text-xs font-medium text-ink-3">Question</div>
      <p className="text-xl font-semibold leading-snug">{card.t}</p>
      {shown ? (
        <>
          <div className="border-t border-line pt-4">
            <div className="text-xs font-medium text-ink-3 mb-1">Réponse</div>
            <p className="text-lg leading-relaxed">{card.d}</p>
          </div>
          <div className="mt-auto grid grid-cols-2 gap-2.5">
            <button className="btn-ghost !py-3" style={{ color: "var(--coral)" }} onClick={() => onGrade(1)}>
              À revoir
            </button>
            <button className="btn-primary !py-3" onClick={() => onGrade(4)}>
              Je savais
            </button>
          </div>
        </>
      ) : (
        <button className="btn-primary mt-auto self-center px-8" onClick={() => setShown(true)}>
          Voir la réponse
        </button>
      )}
    </div>
  );
}

/* ---------------- QCM ---------------- */
function Mcq({ card, pool, onAnswer }: { card: Card; pool: string[]; onAnswer: (ok: boolean) => void }) {
  const options = useMemo(() => {
    const distractors = shuffle(pool.filter((d) => d !== card.d)).slice(0, 3);
    return shuffle([card.d, ...distractors]);
  }, [card, pool]);
  const [picked, setPicked] = useState<string | null>(null);

  return (
    <div className="card p-6 flex flex-col gap-4 min-h-[46vh]">
      <div className="text-xs font-medium text-ink-3">Quelle définition ?</div>
      <p className="text-xl font-semibold">{card.t}</p>
      <div className="flex flex-col gap-2.5 mt-2">
        {options.map((o) => {
          const isCorrect = o === card.d;
          const chosen = picked === o;
          let cls = "border-line";
          if (picked) {
            if (isCorrect) cls = "!border-[var(--green)] bg-[color-mix(in_srgb,var(--green)_12%,transparent)]";
            else if (chosen) cls = "!border-[var(--coral)] bg-[color-mix(in_srgb,var(--coral)_12%,transparent)]";
          }
          return (
            <button
              key={o}
              disabled={!!picked}
              onClick={() => setPicked(o)}
              className={`text-left rounded-[var(--r-inner)] border p-3 transition ${cls}`}
            >
              {o}
            </button>
          );
        })}
      </div>
      {picked && (
        <button className="btn-primary mt-auto self-end" onClick={() => onAnswer(picked === card.d)}>
          Suivant <ArrowRight size={16} aria-hidden />
        </button>
      )}
    </div>
  );
}

/* ---------------- Écrire ---------------- */
function WriteCard({ card, onAnswer }: { card: Card; onAnswer: (ok: boolean) => void }) {
  const [value, setValue] = useState("");
  const [result, setResult] = useState<null | boolean>(null);

  function check(ok: boolean) {
    setResult(ok);
  }
  return (
    <div className="card p-6 flex flex-col gap-4 min-h-[46vh]">
      <div className="text-xs font-medium text-ink-3">Quel terme ?</div>
      <p className="text-lg leading-relaxed">{card.d}</p>
      {result === null ? (
        <>
          <input
            className="input mt-2"
            value={value}
            autoFocus
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && value.trim() && check(answerMatches(value, card.t))}
            placeholder="Ta réponse…"
          />
          <div className="mt-auto flex items-center gap-3">
            <button className="text-sm text-ink-3 hover:text-ink" onClick={() => check(false)}>
              Je ne sais pas
            </button>
            <button
              className="btn-primary ml-auto"
              disabled={!value.trim()}
              onClick={() => check(answerMatches(value, card.t))}
            >
              Vérifier
            </button>
          </div>
        </>
      ) : (
        <>
          <div
            className="rounded-[var(--r-inner)] p-3"
            style={{
              background: `color-mix(in srgb, ${result ? "var(--green)" : "var(--coral)"} 12%, transparent)`,
            }}
          >
            <p className="text-sm" style={{ color: result ? "var(--green-ink)" : "var(--coral)" }}>
              {result ? "Correct !" : "La bonne réponse :"}
            </p>
            {!result && <p className="font-semibold mt-0.5">{card.t}</p>}
          </div>
          <button className="btn-primary mt-auto self-end" onClick={() => onAnswer(result)}>
            Suivant <ArrowRight size={16} aria-hidden />
          </button>
        </>
      )}
    </div>
  );
}

/* ---------------- Vrai / Faux ---------------- */
function TrueFalse({ card, pool, onAnswer }: { card: Card; pool: string[]; onAnswer: (ok: boolean) => void }) {
  const { shownDef, isReal } = useMemo(() => {
    const others = pool.filter((d) => d !== card.d);
    // Tirage au sort voulu : refait uniquement quand la carte change.
    /* eslint-disable react-hooks/purity */
    const real = Math.random() < 0.5 || others.length === 0;
    return { shownDef: real ? card.d : others[Math.floor(Math.random() * others.length)], isReal: real };
    /* eslint-enable react-hooks/purity */
  }, [card, pool]);
  const [answered, setAnswered] = useState<null | boolean>(null);

  function pick(saysReal: boolean) {
    setAnswered(saysReal === isReal);
  }
  return (
    <div className="card p-6 flex flex-col gap-4 min-h-[46vh]">
      <p className="text-xl font-semibold">{card.t}</p>
      <div className="border-t border-line pt-3">
        <div className="text-xs font-medium text-ink-3 mb-1">Définition proposée</div>
        <p className="text-lg leading-relaxed">{shownDef}</p>
      </div>
      {answered === null ? (
        <div className="mt-auto grid grid-cols-2 gap-2.5">
          <button className="btn-ghost !py-3" style={{ color: "var(--coral)" }} onClick={() => pick(false)}>
            Faux
          </button>
          <button className="btn-primary !py-3" onClick={() => pick(true)}>
            Vrai
          </button>
        </div>
      ) : (
        <>
          <p className="text-sm" style={{ color: answered ? "var(--green-ink)" : "var(--coral)" }}>
            {answered ? "Bien vu !" : isReal ? "C’était vrai." : "C’était faux."}
            {!isReal && <> La vraie définition : <span className="font-semibold">{card.d}</span></>}
          </p>
          <button className="btn-primary mt-auto self-end" onClick={() => onAnswer(answered)}>
            Suivant <ArrowRight size={16} aria-hidden />
          </button>
        </>
      )}
    </div>
  );
}

/* ---------------- Recto-verso ---------------- */
function Flashcards({ deck, onFinish }: { deck: Deck; onFinish: (n: number) => void }) {
  const cards = useMemo(() => shuffle(deck.cards), [deck]);
  const [i, setI] = useState(0);
  const [flip, setFlip] = useState(false);
  const c = cards[i];
  return (
    <div className="flex flex-col gap-4">
      <span className="text-sm text-ink-2 display self-center">{i + 1} / {cards.length}</span>
      <button
        onClick={() => setFlip((f) => !f)}
        className="card p-6 min-h-[44vh] flex items-center justify-center text-center"
      >
        <div>
          <div className="text-xs font-medium text-ink-3 mb-2">{flip ? "Définition" : "Terme"}</div>
          <p className={flip ? "text-lg leading-relaxed" : "text-2xl font-semibold"}>{flip ? c.d : c.t}</p>
          <p className="text-xs text-ink-3 mt-4">Touche pour retourner</p>
        </div>
      </button>
      <div className="flex items-center justify-between">
        <button className="btn-ghost" disabled={i === 0} onClick={() => { setI(i - 1); setFlip(false); }}>
          <ArrowLeft size={16} aria-hidden /> Précédent
        </button>
        {i + 1 < cards.length ? (
          <button className="btn-primary" onClick={() => { setI(i + 1); setFlip(false); }}>
            Suivant <ArrowRight size={16} aria-hidden />
          </button>
        ) : (
          <button className="btn-primary" onClick={() => onFinish(cards.length)}>
            Terminer
          </button>
        )}
      </div>
    </div>
  );
}

/* ---------------- Fiche ---------------- */
function Fiche({ deck, onFinish }: { deck: Deck; onFinish: (n: number) => void }) {
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [allOpen, setAllOpen] = useState(false);
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">{deck.name}</h2>
        <button className="btn-ghost !py-1.5" onClick={() => setAllOpen((a) => !a)}>
          {allOpen ? "Tout masquer" : "Tout révéler"}
        </button>
      </div>
      <div className="flex flex-col gap-2">
        {deck.cards.map((c) => {
          const shown = allOpen || open[c.id];
          return (
            <button
              key={c.id}
              onClick={() => setOpen((o) => ({ ...o, [c.id]: !o[c.id] }))}
              className="card p-3.5 text-left flex flex-col gap-1"
            >
              <span className="font-semibold">{c.t}</span>
              <span className={shown ? "text-ink-2" : "text-ink-3 blur-[5px] select-none"}>
                {shown ? c.d : "réponse masquée — touche pour révéler"}
              </span>
            </button>
          );
        })}
      </div>
      <button className="btn-primary self-center mt-2 px-8" onClick={() => onFinish(deck.cards.length)}>
        Terminer
      </button>
    </div>
  );
}

/* ---------------- Associer ---------------- */
function MatchGame({
  deck,
  onFinish,
  grade: gradeCards,
}: {
  deck: Deck;
  onFinish: (n: number, ok: number) => void;
  grade: (cards: Card[]) => void;
}) {
  const cards = useMemo(() => shuffle(deck.cards).slice(0, 6), [deck]);
  const terms = cards;
  const defs = useMemo(() => shuffle(cards), [cards]);
  const [selTerm, setSelTerm] = useState<string | null>(null);
  const [selDef, setSelDef] = useState<string | null>(null);
  const [matched, setMatched] = useState<Set<string>>(new Set());
  const [bad, setBad] = useState<string | null>(null);

  function tryMatch(termId: string | null, defId: string | null) {
    if (!termId || !defId) return;
    if (termId === defId) {
      const next = new Set(matched);
      next.add(termId);
      setMatched(next);
      setSelTerm(null);
      setSelDef(null);
      if (next.size === cards.length) {
        gradeCards(cards);
        setTimeout(() => onFinish(cards.length, cards.length), 250);
      }
    } else {
      setBad(termId + "|" + defId);
      setTimeout(() => {
        setBad(null);
        setSelTerm(null);
        setSelDef(null);
      }, 500);
    }
  }

  function pickTerm(id: string) {
    if (matched.has(id)) return;
    const next = selTerm === id ? null : id;
    setSelTerm(next);
    tryMatch(next, selDef);
  }
  function pickDef(id: string) {
    if (matched.has(id)) return;
    const next = selDef === id ? null : id;
    setSelDef(next);
    tryMatch(selTerm, next);
  }

  const cellCls = (id: string, sel: boolean) =>
    `card p-3 text-left text-sm transition ${
      matched.has(id)
        ? "opacity-40"
        : sel
          ? "!border-[var(--green)] ring-1 ring-[var(--green)]"
          : bad && bad.includes(id)
            ? "!border-[var(--coral)]"
            : ""
    }`;

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-ink-2">Relie chaque terme à sa définition.</p>
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-2">
          {terms.map((c) => (
            <button key={c.id} className={cellCls(c.id, selTerm === c.id)} onClick={() => pickTerm(c.id)}>
              {c.t}
            </button>
          ))}
        </div>
        <div className="flex flex-col gap-2">
          {defs.map((c) => (
            <button key={c.id} className={cellCls(c.id, selDef === c.id)} onClick={() => pickDef(c.id)}>
              {c.d}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ---------------- Texte à trous ---------------- */
function ClozeCard({ card, onGrade }: { card: Card; onGrade: (q: number) => void }) {
  const tokens = useMemo(() => clozeParse(card.t), [card]);
  const blanks = useMemo(
    () => tokens.filter((t) => t.type === "blank") as { type: "blank"; answer: string }[],
    [tokens],
  );
  const [values, setValues] = useState<string[]>(() => blanks.map(() => ""));
  const [result, setResult] = useState<null | { ok: boolean[]; q: number }>(null);

  function verify() {
    const ok = blanks.map((b, i) => answerMatches(values[i] || "", b.answer));
    const correct = ok.filter(Boolean).length;
    const ratio = blanks.length ? correct / blanks.length : 1;
    setResult({ ok, q: ratio === 1 ? 5 : ratio >= 0.6 ? 4 : 1 });
  }

  return (
    <div className="card p-6 flex flex-col gap-4 min-h-[46vh]">
      <div className="text-xs font-medium text-ink-3">Complète le passage</div>
      <p className="text-lg leading-loose">
        {tokens.map((tk, i) => {
          if (tk.type === "text") return <span key={i}>{tk.value}</span>;
          const j = tokens.slice(0, i).filter((t) => t.type === "blank").length;
          const state = result ? (result.ok[j] ? "ok" : "bad") : "idle";
          return (
            <input
              key={i}
              value={values[j]}
              disabled={!!result}
              onChange={(e) => setValues((vs) => vs.map((x, k) => (k === j ? e.target.value : x)))}
              style={{ width: `${Math.max(6, tk.answer.length + 2)}ch` }}
              className={`inline-block mx-0.5 px-1 rounded-md border text-center ${
                state === "ok"
                  ? "border-[var(--green)] text-green-ink"
                  : state === "bad"
                    ? "border-[var(--coral)] text-coral"
                    : "border-line bg-fill2"
              }`}
            />
          );
        })}
      </p>
      {result && result.q < 3 && (
        <p className="text-sm">
          <span className="text-coral">À revoir.</span> Réponses : {blanks.map((b) => b.answer).join(", ")}
        </p>
      )}
      {result ? (
        <button className="btn-primary mt-auto self-end" onClick={() => onGrade(result.q)}>
          Suivant <ArrowRight size={16} aria-hidden />
        </button>
      ) : (
        <button className="btn-primary mt-auto self-center px-8" onClick={verify}>
          Vérifier
        </button>
      )}
    </div>
  );
}

/* ---------------- Remettre dans l'ordre ---------------- */
function shuffledDifferent(arr: string[]): string[] {
  if (arr.length < 2) return arr.slice();
  let s = arr.slice();
  for (let t = 0; t < 20; t++) {
    s = shuffle(arr);
    if (!s.every((v, i) => v === arr[i])) break;
  }
  return s;
}
function OrderCard({ card, onGrade }: { card: Card; onGrade: (q: number) => void }) {
  const correct = useMemo(() => card.d.split("\n").map((s) => s.trim()).filter(Boolean), [card]);
  const [arr, setArr] = useState<string[]>(() => shuffledDifferent(correct));
  const [checked, setChecked] = useState(false);
  const allRight = checked && arr.every((v, i) => v === correct[i]);

  function move(i: number, dir: number) {
    if (checked) return;
    const j = i + dir;
    if (j < 0 || j >= arr.length) return;
    setArr((a) => {
      const b = a.slice();
      [b[i], b[j]] = [b[j], b[i]];
      return b;
    });
  }

  return (
    <div className="card p-6 flex flex-col gap-4 min-h-[46vh]">
      <div className="text-xs font-medium text-ink-3">Remets dans le bon ordre</div>
      <p className="font-semibold">{card.t}</p>
      <div className="flex flex-col gap-2">
        {arr.map((el, i) => {
          const ok = checked && el === correct[i];
          const bad = checked && el !== correct[i];
          return (
            <div
              key={i}
              className={`flex items-center gap-2 rounded-[var(--r-inner)] border p-2.5 ${
                ok ? "border-[var(--green)]" : bad ? "border-[var(--coral)]" : "border-line bg-fill"
              }`}
            >
              <span className="display text-ink-3 w-5 text-center">{i + 1}</span>
              <span className="flex-1">{el}</span>
              {!checked && (
                <span className="flex flex-col">
                  <button onClick={() => move(i, -1)} disabled={i === 0} className="text-ink-3 hover:text-ink disabled:opacity-30" aria-label="Monter">
                    <ChevronUp size={16} aria-hidden />
                  </button>
                  <button onClick={() => move(i, 1)} disabled={i === arr.length - 1} className="text-ink-3 hover:text-ink disabled:opacity-30" aria-label="Descendre">
                    <ChevronDown size={16} aria-hidden />
                  </button>
                </span>
              )}
            </div>
          );
        })}
      </div>
      {checked && !allRight && (
        <div className="text-sm">
          <span className="text-coral">Pas tout à fait.</span> Le bon ordre :
          <ol className="list-decimal ml-5 mt-1">
            {correct.map((c, i) => (
              <li key={i}>{c}</li>
            ))}
          </ol>
        </div>
      )}
      {checked ? (
        <button className="btn-primary mt-auto self-end" onClick={() => onGrade(allRight ? 5 : 1)}>
          Suivant <ArrowRight size={16} aria-hidden />
        </button>
      ) : (
        <button className="btn-primary mt-auto self-center px-8" onClick={() => setChecked(true)}>
          Vérifier
        </button>
      )}
    </div>
  );
}

/* ---------------- Apprendre par cœur : test ---------------- */
function maskLine(ln: string): string {
  return ln.replace(/[\p{L}\p{N}]/gu, "▁");
}
function MemorizeTest({ card, onGrade }: { card: Card; onGrade: (q: number) => void }) {
  const lines = useMemo(() => card.d.split("\n"), [card]);
  const [revealed, setRevealed] = useState(0);
  const done = revealed >= lines.length;
  return (
    <div className="card p-6 flex flex-col gap-4 min-h-[46vh]">
      <div className="text-xs font-medium text-ink-3">Récite de mémoire</div>
      <p className="font-semibold">{card.t}</p>
      <div className="flex flex-col gap-1 leading-relaxed">
        {lines.map((ln, i) =>
          i < revealed ? (
            <p key={i}>{ln || " "}</p>
          ) : (
            <p key={i} className="text-ink-3 select-none">{maskLine(ln) || " "}</p>
          ),
        )}
      </div>
      {!done ? (
        <button className="btn-ghost mt-auto self-center" onClick={() => setRevealed((r) => r + 1)}>
          Révéler la ligne suivante
        </button>
      ) : (
        <div className="mt-auto grid grid-cols-2 gap-2.5">
          <button className="btn-ghost !py-3" style={{ color: "var(--coral)" }} onClick={() => onGrade(1)}>
            À revoir
          </button>
          <button className="btn-primary !py-3" onClick={() => onGrade(4)}>
            Je savais
          </button>
        </div>
      )}
    </div>
  );
}

/* ---------------- Apprendre par cœur : apprentissage progressif ---------------- */
function MemorizeLearn({ deck, onFinish }: { deck: Deck; onFinish: (n: number) => void }) {
  const cards = useMemo(() => shuffle(deck.cards), [deck]);
  const [i, setI] = useState(0);
  const [frac, setFrac] = useState(0);
  const [revealed, setRevealed] = useState<Set<number>>(new Set());
  const c = cards[i];
  const tokens = useMemo(() => tokenizeWords(c.d), [c]);
  const wordIdx = useMemo(
    () => tokens.map((t, idx) => (t.isWord ? idx : -1)).filter((x) => x >= 0),
    [tokens],
  );
  const mask = useMemo(() => {
    const ranks = maskedSet(c.id, wordIdx.length, frac);
    const set = new Set<number>();
    wordIdx.forEach((tokenIndex, rank) => {
      if (ranks.has(rank)) set.add(tokenIndex);
    });
    return set;
  }, [c, wordIdx, frac]);

  const paliers = [0, 0.25, 0.5, 0.75, 1];
  function goto(next: number) {
    setI(next);
    setFrac(0);
    setRevealed(new Set());
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <span className="text-sm text-ink-2 display">{i + 1} / {cards.length}</span>
        <div className="flex gap-1">
          {paliers.map((p) => (
            <button
              key={p}
              onClick={() => { setFrac(p); setRevealed(new Set()); }}
              className={
                frac === p
                  ? "rounded-full px-2.5 py-1 text-xs font-medium bg-[var(--green)] text-white"
                  : "btn-ghost !py-1 !px-2.5 text-xs"
              }
            >
              {Math.round(p * 100)}%
            </button>
          ))}
        </div>
      </div>
      <div className="card p-6 min-h-[42vh]">
        <p className="font-semibold mb-3">{c.t}</p>
        <p className="leading-loose whitespace-pre-wrap">
          {tokens.map((t, idx) => {
            if (!t.isWord || !mask.has(idx) || revealed.has(idx)) return <span key={idx}>{t.value}</span>;
            return (
              <button
                key={idx}
                onClick={() => setRevealed((r) => new Set(r).add(idx))}
                className="rounded px-0.5 text-ink-3 bg-[color-mix(in_srgb,var(--ink)_8%,transparent)]"
                aria-label="Révéler le mot"
              >
                {"▁".repeat(Math.max(1, t.value.length))}
              </button>
            );
          })}
        </p>
      </div>
      <div className="flex items-center justify-between">
        <button className="btn-ghost" disabled={i === 0} onClick={() => goto(i - 1)}>
          <ArrowLeft size={16} aria-hidden /> Précédent
        </button>
        {i + 1 < cards.length ? (
          <button className="btn-primary" onClick={() => goto(i + 1)}>
            Suivant <ArrowRight size={16} aria-hidden />
          </button>
        ) : (
          <button className="btn-primary" onClick={() => onFinish(cards.length)}>
            Terminer
          </button>
        )}
      </div>
    </div>
  );
}

/* ---------------- Écran de fin ---------------- */
function EndScreen({
  r,
  mode,
  onRestart,
  onDone,
}: {
  r: Rewards;
  mode: Mode;
  onRestart: () => void;
  onDone: () => void;
}) {
  const graded = PER_CARD.includes(mode) || mode === "match";
  const mm = Math.floor(r.seconds / 60);
  const ss = String(r.seconds % 60).padStart(2, "0");
  return (
    <div className="mx-auto max-w-md px-4 pt-[calc(env(safe-area-inset-top,0px)+24px)]">
      <div className="card p-7 flex flex-col items-center text-center gap-4">
        <span className="icon-chip green !w-16 !h-16 !rounded-[22px]">
          <Trophy size={30} strokeWidth={1.8} aria-hidden />
        </span>
        <h1 className="text-2xl font-semibold">Session terminée</h1>

        {graded && (
          <p className="text-ink-2">
            <span className="display text-3xl font-semibold text-green-ink">{r.correct}</span>
            <span className="text-ink-3"> / {r.total} réussies</span>
          </p>
        )}

        <div className="flex flex-wrap justify-center gap-2 mt-1">
          <span className="chip">⏱ {mm}:{ss}</span>
          {r.xp > 0 && <span className="chip">+{r.xp} XP</span>}
        </div>

        {r.leveledTo && (
          <p className="font-semibold text-green-ink">Niveau {r.leveledTo} atteint !</p>
        )}
        {r.badges.length > 0 && (
          <div className="flex flex-wrap justify-center gap-2">
            {r.badges.map((b) => (
              <span key={b} className="chip" style={{ color: "var(--green-ink)" }}>
                <Award size={13} className="mr-1" aria-hidden /> {b}
              </span>
            ))}
          </div>
        )}

        {r.missed.length > 0 && (
          <div className="w-full text-left mt-2">
            <p className="text-sm font-semibold mb-1">À retravailler</p>
            <div className="flex flex-wrap gap-1.5">
              {r.missed.slice(0, 12).map((c) => (
                <span key={c.id} className="chip">{c.t}</span>
              ))}
            </div>
          </div>
        )}

        <div className="flex gap-3 mt-3 w-full">
          <button className="btn-ghost flex-1" onClick={onRestart}>
            <RotateCw size={15} aria-hidden /> Refaire
          </button>
          <button className="btn-primary flex-1" onClick={onDone}>
            <Check size={16} aria-hidden /> Terminer
          </button>
        </div>
      </div>
    </div>
  );
}
