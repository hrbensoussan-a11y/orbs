"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, X, ChevronRight, ChevronDown } from "lucide-react";
import { MoodPicker } from "./MoodPicker";

export type EditorEntry = {
  id: string | null;
  title: string;
  content: string;
  mood: number | null;
  location: string;
  tags: string[];
  entryDate: string; // ISO
};

type SaveStatus = "idle" | "saving" | "saved" | "error";

const DRAFT_KEY = "orbs:draft:new";
const DEBOUNCE_MS = 800;

function splitTags(input: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of input.split(",")) {
    const t = raw.trim();
    if (t && !seen.has(t.toLowerCase())) {
      seen.add(t.toLowerCase());
      out.push(t);
    }
  }
  return out;
}

function toISO(dateInput: string): string {
  // dateInput = "yyyy-mm-dd" ; midi local pour éviter les décalages de jour.
  const d = new Date(`${dateInput}T12:00:00`);
  return Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}

type Values = {
  title: string | null;
  content: string;
  mood: number | null;
  location: string | null;
  tags: string[];
  entryDate: string;
};

function serialize(v: Values): string {
  return JSON.stringify([v.title, v.content, v.mood, v.location, v.tags, v.entryDate]);
}

function initializeContent(initial: EditorEntry): string {
  if (initial.id || initial.content || initial.title) return initial.content;
  if (typeof window === "undefined") return initial.content;
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (raw) {
      const d = JSON.parse(raw);
      if (typeof d.content === "string" && d.content.trim()) return d.content;
    }
  } catch {}
  return initial.content;
}

function initializeTitle(initial: EditorEntry): string {
  if (initial.id || initial.content || initial.title) return initial.title;
  if (typeof window === "undefined") return initial.title;
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (raw) {
      const d = JSON.parse(raw);
      if (typeof d.title === "string") return d.title;
    }
  } catch {}
  return initial.title;
}

export function Editor({
  initial,
  suggestedPrompt,
}: {
  initial: EditorEntry;
  suggestedPrompt: string;
}) {
  const router = useRouter();

  const [title, setTitle] = useState(() => initializeTitle(initial));
  const [content, setContent] = useState(() => initializeContent(initial));
  const [mood, setMood] = useState<number | null>(initial.mood);
  const [location, setLocation] = useState(initial.location);
  const [tagsInput, setTagsInput] = useState(initial.tags.join(", "));
  const [entryDate, setEntryDate] = useState(initial.entryDate.slice(0, 10));

  const [showMeta, setShowMeta] = useState(
    Boolean(initial.mood || initial.tags.length || initial.location),
  );
  const [promptDismissed, setPromptDismissed] = useState(
    Boolean(initial.content.trim()),
  );
  const [status, setStatus] = useState<SaveStatus>("idle");

  const idRef = useRef<string | null>(initial.id);
  const savingRef = useRef(false);
  const savedRef = useRef<string>("");
  const valuesRef = useRef<Values>({
    title: null,
    content: "",
    mood: null,
    location: null,
    tags: [],
    entryDate: "",
  });
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const current = useCallback(
    (): Values => ({
      title: title.trim() ? title.trim() : null,
      content,
      mood,
      location: location.trim() ? location.trim() : null,
      tags: splitTags(tagsInput),
      entryDate: toISO(entryDate),
    }),
    [title, content, mood, location, tagsInput, entryDate],
  );

  // Garde toujours la dernière valeur pour la sauvegarde différée.
  useEffect(() => {
    valuesRef.current = current();
  });

  // eslint-disable-next-line react-hooks/preserve-manual-memoization
  const persist = useCallback(async () => {
    if (savingRef.current) return;
    const v = valuesRef.current;
    const snap = serialize(v);
    if (snap === savedRef.current) return;

    const isEmpty = !v.content.trim() && !v.title;
    if (!idRef.current && isEmpty) {
      savedRef.current = snap;
      return;
    }

    savingRef.current = true;
    setStatus("saving");
    try {
      const payload = { ...v, promptText: promptDismissed ? undefined : suggestedPrompt };
      if (!idRef.current) {
        const res = await fetch("/api/entries", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error("create failed");
        const entry = await res.json();
        idRef.current = entry.id;
        window.history.replaceState(null, "", `/write/${entry.id}`);
        try {
          localStorage.removeItem(DRAFT_KEY);
        } catch {}
      } else {
        const res = await fetch(`/api/entries/${idRef.current}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error("update failed");
      }
      savedRef.current = snap;
      setStatus("saved");
    } catch {
      setStatus("error");
    } finally {
      savingRef.current = false;
      // Des changements ont eu lieu pendant la sauvegarde ? On replanifie.
      if (serialize(valuesRef.current) !== savedRef.current) {
        scheduleSave(300);
      }
    }
    // The refs are always current, so we don't need them in dependencies
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [promptDismissed, suggestedPrompt]);

  const scheduleSave = useCallback(
    (delay = DEBOUNCE_MS) => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        void persist();
      }, delay);
    },
    [persist],
  );

  // Initialise la référence "dernier état sauvegardé".
  useEffect(() => {
    savedRef.current = serialize(current());
    textareaRef.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sauvegarde automatique à chaque changement (débattue).
  useEffect(() => {
    // Sauvegarde locale immédiate d'un brouillon non encore persisté.
    if (!idRef.current) {
      try {
        localStorage.setItem(DRAFT_KEY, JSON.stringify({ title, content }));
      } catch {}
    }
    scheduleSave();
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [title, content, mood, location, tagsInput, entryDate, scheduleSave]);

  // Sécurise la sauvegarde quand l'onglet passe en arrière-plan / se ferme.
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === "hidden") void persist();
    };
    document.addEventListener("visibilitychange", onHide);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      void persist();
    };
  }, [persist]);

  async function finish() {
    if (timerRef.current) clearTimeout(timerRef.current);
    await persist();
    router.push(idRef.current ? `/entry/${idRef.current}` : "/timeline");
    router.refresh();
  }

  const showPrompt = !promptDismissed && !content.trim();

  return (
    <div className="mx-auto max-w-xl px-4 pb-24 pt-[calc(env(safe-area-inset-top,0px)+14px)]">
      {/* Barre supérieure discrète */}
      <div className="flex items-center justify-between gap-3 mb-3 text-sm">
        <Link href="/timeline" className="btn-ghost !py-1.5">
          <ArrowLeft size={16} aria-hidden /> Journal
        </Link>
        <div className="flex items-center gap-3">
          <SaveIndicator status={status} />
          <button type="button" onClick={finish} className="btn-primary !py-1.5">
            Terminé
          </button>
        </div>
      </div>

      <div className="card p-5">
      {/* Prompt suggéré, ignorable */}
      {showPrompt && (
        <div className="mb-3 flex items-start justify-between gap-2 rounded-[var(--r-inner)] border border-line bg-fill px-3 py-2 text-sm text-ink-2">
          <span className="italic">{suggestedPrompt}</span>
          <button
            type="button"
            onClick={() => setPromptDismissed(true)}
            className="shrink-0 text-ink-3 hover:text-ink"
            aria-label="Masquer la suggestion"
            title="Masquer"
          >
            <X size={16} aria-hidden />
          </button>
        </div>
      )}

      {/* Titre (optionnel) */}
      <input
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Titre (optionnel)"
        className="w-full bg-transparent text-2xl font-serif outline-none placeholder:text-muted/70 mb-2"
      />

      {/* Corps — l'élément principal */}
      <textarea
        ref={textareaRef}
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder="Écris librement…"
        className="writing-surface w-full min-h-[52vh] resize-none bg-transparent outline-none placeholder:text-muted/70"
      />

      {/* Métadonnées repliées */}
      <div className="mt-6 border-t border-line pt-4">
        <button
          type="button"
          onClick={() => setShowMeta((s) => !s)}
          className="inline-flex items-center gap-1 text-sm text-ink-2 hover:text-ink"
          aria-expanded={showMeta}
        >
          {showMeta ? (
            <ChevronDown size={15} aria-hidden />
          ) : (
            <ChevronRight size={15} aria-hidden />
          )}
          Détails (humeur, tags, lieu, date)
        </button>

        {showMeta && (
          <div className="mt-4 flex flex-col gap-5">
            <div>
              <div className="text-sm text-muted mb-2">Humeur</div>
              <MoodPicker value={mood} onChange={setMood} />
            </div>

            <label className="flex flex-col gap-1.5">
              <span className="text-sm text-muted">Tags (séparés par des virgules)</span>
              <input
                type="text"
                value={tagsInput}
                onChange={(e) => setTagsInput(e.target.value)}
                placeholder="travail, famille, idées…"
                className="input"
              />
            </label>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <label className="flex flex-col gap-1.5">
                <span className="text-sm text-muted">Lieu (optionnel)</span>
                <input
                  type="text"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="Paris, maison…"
                  className="input"
                />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-sm text-muted">Date de l’entrée</span>
                <input
                  type="date"
                  value={entryDate}
                  onChange={(e) => setEntryDate(e.target.value)}
                  className="input"
                />
              </label>
            </div>
          </div>
        )}
      </div>
      </div>
    </div>
  );
}

function SaveIndicator({ status }: { status: SaveStatus }) {
  const map: Record<SaveStatus, string> = {
    idle: "",
    saving: "Enregistrement…",
    saved: "Enregistré",
    error: "Hors ligne — réessai…",
  };
  const text = map[status];
  if (!text) return null;
  return (
    <span
      className={`text-xs ${status === "error" ? "text-red-500" : "text-muted"}`}
    >
      {text}
    </span>
  );
}
