"use client";

import {
  ArrowLeft,
  Sparkles,
  RefreshCw,
  ListChecks,
  Pencil,
  Shuffle,
  Check,
  List,
  HelpCircle,
  AlignLeft,
  Eye,
  ArrowUpDown,
  type LucideIcon,
} from "lucide-react";
import type { Deck } from "@/lib/learn/types";
import { dueCount } from "@/lib/learn/sm2";

export type Mode =
  | "smart"
  | "flashcards"
  | "mcq"
  | "write"
  | "match"
  | "truefalse"
  | "fiche"
  | "interro"
  | "cloze"
  | "memorize_learn"
  | "memorize_test"
  | "order";

type Activity = {
  mode: Mode;
  label: string;
  desc: string;
  Icon: LucideIcon;
  min: number;
  featured?: boolean;
};

const DEF_ACTIVITIES: Activity[] = [
  { mode: "smart", label: "Révision intelligente", desc: "Ce que tu es sur le point d’oublier, d’abord.", Icon: Sparkles, min: 1, featured: true },
  { mode: "flashcards", label: "Recto-verso", desc: "Retourne les cartes à ton rythme.", Icon: RefreshCw, min: 1 },
  { mode: "mcq", label: "QCM", desc: "Choisis la bonne définition parmi quatre.", Icon: ListChecks, min: 4 },
  { mode: "write", label: "Écrire", desc: "Tape le terme à partir de sa définition.", Icon: Pencil, min: 1 },
  { mode: "match", label: "Associer", desc: "Relie chaque terme à sa définition.", Icon: Shuffle, min: 4 },
  { mode: "truefalse", label: "Vrai / Faux", desc: "La définition proposée est-elle la bonne ?", Icon: Check, min: 2 },
  { mode: "fiche", label: "Fiche", desc: "Masque les définitions et interroge-toi.", Icon: List, min: 1 },
];

const QUESTION_ACTIVITIES: Activity[] = [
  { mode: "interro", label: "Interro", desc: "Réponds de tête, puis corrige-toi.", Icon: HelpCircle, min: 1, featured: true },
  { mode: "flashcards", label: "Parcourir", desc: "Question au recto, réponse au verso.", Icon: RefreshCw, min: 1 },
  { mode: "fiche", label: "Fiche", desc: "Masque les réponses et interroge-toi.", Icon: List, min: 1 },
];

const CLOZE_ACTIVITIES: Activity[] = [
  { mode: "cloze", label: "Texte à trous", desc: "Retrouve les mots cachés dans le contexte.", Icon: AlignLeft, min: 1, featured: true },
];

const MEMORIZE_ACTIVITIES: Activity[] = [
  { mode: "memorize_learn", label: "Apprendre", desc: "Masque de plus en plus de mots, à ton rythme.", Icon: Eye, min: 1, featured: true },
  { mode: "memorize_test", label: "Test", desc: "Tout masqué, révèle ligne par ligne, auto-évalue.", Icon: Check, min: 1 },
];

const ORDER_ACTIVITIES: Activity[] = [
  { mode: "order", label: "Remettre dans l’ordre", desc: "Réordonne les éléments mélangés.", Icon: ArrowUpDown, min: 1, featured: true },
];

function activitiesFor(kind: Deck["kind"]): Activity[] {
  switch (kind) {
    case "questions":
      return QUESTION_ACTIVITIES;
    case "cloze":
      return CLOZE_ACTIVITIES;
    case "memorize":
      return MEMORIZE_ACTIVITIES;
    case "order":
      return ORDER_ACTIVITIES;
    default:
      return DEF_ACTIVITIES;
  }
}

export function StudyPicker({
  deck,
  onStart,
  onBack,
  onEdit,
}: {
  deck: Deck;
  onStart: (mode: Mode) => void;
  onBack: () => void;
  onEdit: () => void;
}) {
  const activities = activitiesFor(deck.kind);
  const due = dueCount(deck);

  return (
    <div className="mx-auto max-w-xl px-4 pt-[calc(env(safe-area-inset-top,0px)+14px)]">
      <button className="btn-ghost !py-1.5 mb-4" onClick={onBack}>
        <ArrowLeft size={16} aria-hidden /> Tous les paquets
      </button>

      <div className="flex items-start justify-between gap-3 mb-1">
        <h1 className="text-2xl font-semibold leading-tight">{deck.name}</h1>
        <button className="btn-ghost !py-1.5 shrink-0" onClick={onEdit}>
          <Pencil size={14} aria-hidden /> Modifier
        </button>
      </div>
      <p className="text-sm text-ink-2 mb-5">
        {deck.cards.length} carte{deck.cards.length > 1 ? "s" : ""}
        {due > 0 ? ` · ${due} à réviser` : " · rien à réviser pour l’instant"}
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {activities.map((a) => {
          const enough = deck.cards.length >= a.min;
          return (
            <button
              key={a.mode}
              disabled={!enough}
              onClick={() => enough && onStart(a.mode)}
              className={`card p-4 text-left transition ${
                a.featured ? "!border-[var(--green)]/60" : ""
              } ${enough ? "hover:-translate-y-[3px] hover:shadow-[var(--shadow-float)]" : "opacity-55"}`}
            >
              <span
                className={`icon-chip ${a.featured ? "green" : "sky"} mb-3`}
              >
                <a.Icon size={20} strokeWidth={1.9} aria-hidden />
              </span>
              <div className="font-semibold">{a.label}</div>
              <p className="text-sm text-ink-2 mt-1 leading-snug">
                {enough ? a.desc : `Au moins ${a.min} cartes.`}
              </p>
            </button>
          );
        })}
      </div>
    </div>
  );
}
