"use client";

import { useEffect, useRef, useState } from "react";
import { X, Check, RotateCw, Trophy, Award } from "lucide-react";
import type { Card, Kind } from "@/lib/learn/types";
import { grade, previewInterval } from "@/lib/learn/sm2";
import { award, levelFromXp, recomputeBadges } from "@/lib/learn/progress";
import { clozeParse } from "@/lib/learn/text";
import { interleavedDue, type ReviewItem } from "@/lib/learn/review";
import { subjectColor, loadSubjectColors } from "@/lib/subjectColors";
import type { LearnCtx } from "./ctx";

type Rewards = {
  correct: number;
  total: number;
  seconds: number;
  xp: number;
  leveledTo: number | null;
  badges: string[];
  missed: ReviewItem[];
};

/** Session de révision inter-paquets : rappel actif + auto-évaluation SM-2,
 *  matières entrelacées, les cartes ratées sont rejouées en fin de session. */
export function DailyReview({ ctx, onDone }: { ctx: LearnCtx; onDone: () => void }) {
  const [queue, setQueue] = useState<ReviewItem[]>(() => interleavedDue(ctx.s));
  const [index, setIndex] = useState(0);
  const [correct, setCorrect] = useState(0);
  const [wrong, setWrong] = useState(0);
  const missedRef = useRef<Map<string, ReviewItem>>(new Map());
  const startRef = useRef(0);
  const xpStartRef = useRef(ctx.s.stats.xp);
  const [rewards, setRewards] = useState<Rewards | null>(null);
  const [colors] = useState<Record<string, string>>(() => loadSubjectColors());

  useEffect(() => {
    startRef.current = Date.now();
  }, []);

  // Plein écran : on masque la barre du bas et la bulle IA pendant l'étude.
  useEffect(() => {
    document.body.classList.add("studying");
    return () => document.body.classList.remove("studying");
  }, []);

  function finish(correctCount: number, total: number) {
    const before = levelFromXp(xpStartRef.current);
    const after = levelFromXp(ctx.s.stats.xp);
    const badges = recomputeBadges(ctx.s);
    ctx.save();
    setRewards({
      correct: correctCount,
      total,
      seconds: Math.round((Date.now() - startRef.current) / 1000),
      xp: ctx.s.stats.xp - xpStartRef.current,
      leveledTo: after > before ? after : null,
      badges,
      missed: [...missedRef.current.values()],
    });
  }

  function answer(item: ReviewItem, q: number) {
    const isCorrect = q >= 3;
    grade(item.card, q);
    award(ctx.s, isCorrect ? "correct" : "attempt");
    ctx.save();
    const nc = correct + (isCorrect ? 1 : 0);
    const nw = wrong + (isCorrect ? 0 : 1);
    setCorrect(nc);
    setWrong(nw);
    if (!isCorrect) {
      missedRef.current.set(item.card.id, item);
      setQueue((qq) => [...qq, item]); // rejouer la carte ratée plus tard
    }
    const totalQueue = queue.length + (isCorrect ? 0 : 1);
    if (index + 1 >= totalQueue) finish(nc, nc + nw);
    else setIndex((i) => i + 1);
  }

  function restart(items?: ReviewItem[]) {
    const next = items && items.length ? items : interleavedDue(ctx.s);
    startRef.current = Date.now();
    xpStartRef.current = ctx.s.stats.xp;
    missedRef.current = new Map();
    setCorrect(0);
    setWrong(0);
    setIndex(0);
    setQueue(next);
    setRewards(null);
  }

  if (rewards)
    return (
      <EndScreen
        r={rewards}
        colors={colors}
        onReplayMissed={() => restart(rewards.missed.map((m) => m))}
        onDone={onDone}
      />
    );

  if (!queue.length)
    return (
      <Shell onClose={onDone}>
        <div className="card p-7 text-center">
          <p className="text-xl font-semibold">Rien à réviser pour l’instant.</p>
          <p className="text-ink-2 mt-2">Reviens plus tard : la répétition espacée te préviendra.</p>
          <button className="btn-primary mt-6" onClick={onDone}>
            Retour
          </button>
        </div>
      </Shell>
    );

  const item = queue[index];
  if (!item) return null;
  const progress = `${Math.min(index + 1, queue.length)} / ${queue.length}`;

  return (
    <Shell onClose={onDone} progress={progress} correct={correct} wrong={wrong}>
      <RecallCard key={index} item={item} colors={colors} onGrade={(q) => answer(item, q)} />
    </Shell>
  );
}

/* ---------------- Coquille ---------------- */
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

/* ---------------- Carte de rappel universelle ---------------- */
const FRONT: Record<Kind, string> = {
  definitions: "Terme",
  questions: "Question",
  cloze: "Texte à trous",
  memorize: "Récite de mémoire",
  order: "Dans quel ordre ?",
};
const BACK: Record<Kind, string> = {
  definitions: "Définition",
  questions: "Réponse",
  cloze: "Passage complété",
  memorize: "Texte",
  order: "Le bon ordre",
};

function ivLabel(card: Card, q: number): string {
  if (q < 3) return "< 1 j";
  const d = previewInterval(card, q);
  return d <= 1 ? "1 j" : `${d} j`;
}

function RecallCard({
  item,
  colors,
  onGrade,
}: {
  item: ReviewItem;
  colors: Record<string, string>;
  onGrade: (q: number) => void;
}) {
  const [shown, setShown] = useState(false);
  const { card, deck } = item;
  const hex = subjectColor(deck.subject, colors);

  return (
    <div className="card p-6 flex flex-col gap-5 min-h-[calc(100dvh-210px)]">
      <div className="flex items-center gap-2 text-xs">
        <span className="w-2.5 h-2.5 rounded-full flex-none" style={{ background: hex }} />
        <span className="font-medium" style={{ color: `color-mix(in srgb, ${hex} 62%, var(--ink))` }}>
          {deck.subject}
        </span>
        <span className="text-ink-3 truncate">· {deck.name}</span>
      </div>

      <div className="text-xs font-medium text-ink-3">{FRONT[deck.kind]}</div>
      <Front card={card} kind={deck.kind} />

      {shown ? (
        <>
          <div className="border-t border-line pt-4">
            <div className="text-xs font-medium text-ink-3 mb-1">{BACK[deck.kind]}</div>
            <Back card={card} kind={deck.kind} />
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

/* Recto selon le type de fiche. */
function Front({ card, kind }: { card: Card; kind: Kind }) {
  if (kind === "cloze") {
    const tokens = clozeParse(card.t);
    return (
      <p className="text-lg leading-loose">
        {tokens.map((tk, i) =>
          tk.type === "text" ? (
            <span key={i}>{tk.value}</span>
          ) : (
            <span key={i} className="inline-block align-baseline mx-0.5 px-2 rounded-md bg-fill2 text-ink-3">
              {"▁".repeat(Math.max(3, tk.answer.length))}
            </span>
          ),
        )}
      </p>
    );
  }
  return <p className="text-2xl font-semibold leading-snug">{card.t}</p>;
}

/* Verso selon le type de fiche. */
function Back({ card, kind }: { card: Card; kind: Kind }) {
  if (kind === "cloze") {
    const tokens = clozeParse(card.t);
    return (
      <p className="text-lg leading-loose">
        {tokens.map((tk, i) =>
          tk.type === "text" ? (
            <span key={i}>{tk.value}</span>
          ) : (
            <span key={i} className="font-semibold text-green-ink">
              {tk.answer}
            </span>
          ),
        )}
      </p>
    );
  }
  if (kind === "order") {
    const lines = card.d.split("\n").map((s) => s.trim()).filter(Boolean);
    return (
      <ol className="list-decimal ml-5 text-lg leading-relaxed">
        {lines.map((l, i) => (
          <li key={i}>{l}</li>
        ))}
      </ol>
    );
  }
  return <p className="text-lg leading-relaxed whitespace-pre-wrap">{card.d}</p>;
}

/* ---------------- Écran de fin ---------------- */
function EndScreen({
  r,
  colors,
  onReplayMissed,
  onDone,
}: {
  r: Rewards;
  colors: Record<string, string>;
  onReplayMissed: () => void;
  onDone: () => void;
}) {
  const mm = Math.floor(r.seconds / 60);
  const ss = String(r.seconds % 60).padStart(2, "0");
  return (
    <div className="mx-auto max-w-md px-4 pt-[calc(env(safe-area-inset-top,0px)+24px)]">
      <div className="card p-7 flex flex-col items-center text-center gap-4">
        <span className="icon-chip green !w-16 !h-16 !rounded-[22px]">
          <Trophy size={30} strokeWidth={1.8} aria-hidden />
        </span>
        <h1 className="text-2xl font-semibold">Révision terminée</h1>

        <p className="text-ink-2">
          <span className="display text-3xl font-semibold text-green-ink">{r.correct}</span>
          <span className="text-ink-3"> / {r.total} réussies</span>
        </p>

        <div className="flex flex-wrap justify-center gap-2 mt-1">
          <span className="chip">⏱ {mm}:{ss}</span>
          {r.xp > 0 && <span className="chip">+{r.xp} XP</span>}
        </div>

        {r.leveledTo && <p className="font-semibold text-green-ink">Niveau {r.leveledTo} atteint !</p>}
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
            <p className="text-sm font-semibold mb-1.5">À retravailler</p>
            <div className="flex flex-wrap gap-1.5">
              {r.missed.slice(0, 12).map((m) => (
                <span
                  key={m.card.id}
                  className="chip"
                  style={{ color: `color-mix(in srgb, ${subjectColor(m.deck.subject, colors)} 62%, var(--ink))` }}
                >
                  {m.card.t.slice(0, 40) || m.deck.name}
                </span>
              ))}
            </div>
          </div>
        )}

        <div className="flex gap-3 mt-3 w-full">
          {r.missed.length > 0 ? (
            <button className="btn-ghost flex-1" onClick={onReplayMissed}>
              <RotateCw size={15} aria-hidden /> Refaire les ratées
            </button>
          ) : null}
          <button className="btn-primary flex-1" onClick={onDone}>
            <Check size={16} aria-hidden /> Terminer
          </button>
        </div>
      </div>
    </div>
  );
}
