"use client";

// Assistant scolaire Orbs — discussions par matière.
//
// - Écran d'accueil : la liste des matières (chaque matière = une discussion).
// - On ouvre une matière → un chat dédié à cette matière (l'IA sait de quelle
//   matière il s'agit). Chaque matière garde son propre fil (localStorage
//   "orbs.ai.v2").
// - Parle UNIQUEMENT à notre backend /api/ai/chat (aucune clé côté navigateur).
// - Commandes # avec suggestion « fantôme », rendu Markdown, copie, erreurs.

import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";
import {
  Send,
  Square,
  ArrowLeft,
  Trash2,
  Copy,
  Check,
  ChevronRight,
  X,
} from "lucide-react";
import { Markdown } from "@/components/Markdown";
import type { ChatMessage, QuickAction } from "@/lib/ai/types";
import { SUBJECT_TONE } from "@/lib/learn/types";
import {
  type TagPrefs,
  loadTagPrefs,
  matchTags,
  normalizeTag,
  extractTags,
} from "@/lib/ai/tags";

type Ghost = { id: string; rest: string; start: number } | null;
type Threads = Record<string, ChatMessage[]>;

const STORE_KEY = "orbs.ai.v2";
const MAX_HISTORY = 10;

// Les matières de discussion (une discussion = une matière).
const SUBJECTS = [
  "Maths",
  "Français",
  "Histoire-Géo",
  "Anglais",
  "SVT",
  "Physique-Chimie",
  "SES",
  "Philo",
  "Autre",
];

const QUICK_ACTIONS: { action: QuickAction; label: string; starter: string }[] = [
  { action: "explain", label: "Expliquer", starter: "Explique-moi " },
  { action: "summarize", label: "Résumer", starter: "Résume-moi " },
  { action: "flashcards", label: "Créer une fiche", starter: "Crée une fiche sur " },
  { action: "revise", label: "M'aider à réviser", starter: "Aide-moi à réviser " },
];

function toneColor(subject: string): string {
  return `var(--${SUBJECT_TONE[subject] ?? "green"})`;
}

function loadThreads(): Threads {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) {
      const data = JSON.parse(raw);
      if (data?.threads && typeof data.threads === "object") return data.threads;
    }
  } catch {
    /* localStorage indisponible ou données corrompues */
  }
  return {};
}

export function AiChat({
  firstName,
  configured,
}: {
  firstName?: string | null;
  configured: boolean;
}) {
  const [threads, setThreads] = useState<Threads>({});
  const [subject, setSubject] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [pendingAction, setPendingAction] = useState<QuickAction | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState<{ text: string; action: QuickAction | null } | null>(null);
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [tagPrefs, setTagPrefs] = useState<TagPrefs>({ trigger: "#", favorites: [] });
  const [ghost, setGhost] = useState<Ghost>(null);

  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const ghostRef = useRef<HTMLDivElement>(null);
  const suppressGhostRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const tagPrefsRef = useRef<TagPrefs>(tagPrefs);
  tagPrefsRef.current = tagPrefs;

  // Préférences des # (déclencheur + favoris), relues quand les réglages changent.
  useEffect(() => {
    const refresh = () => setTagPrefs(loadTagPrefs());
    refresh();
    window.addEventListener("orbs:aitags", refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener("orbs:aitags", refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  // Chargement initial des fils (client uniquement).
  useEffect(() => {
    const t = loadThreads();
    /* eslint-disable react-hooks/set-state-in-effect */
    setThreads(t);
    setLoaded(true);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  const persist = useCallback((t: Threads) => {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({ version: 2, threads: t }));
    } catch {
      /* quota plein / mode privé */
    }
  }, []);

  useEffect(() => {
    if (!loaded) return;
    const id = setTimeout(() => persist(threads), loading ? 500 : 0);
    return () => clearTimeout(id);
  }, [threads, loaded, loading, persist]);

  useEffect(() => {
    const flush = () => persist(threads);
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", flush);
    return () => {
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", flush);
    };
  }, [threads, persist]);

  const messages = subject ? threads[subject] ?? [] : [];

  // Défilement automatique en bas pendant la génération / à l'envoi.
  const lastLen = messages[messages.length - 1]?.content.length ?? 0;
  useEffect(() => {
    const el = endRef.current;
    if (!el) return;
    const justSent = loading && lastLen === 0;
    const nearBottom = el.getBoundingClientRect().bottom <= window.innerHeight + 160;
    if (justSent || nearBottom) el.scrollIntoView({ block: "end" });
  }, [messages.length, lastLen, loading]);

  const updateThread = useCallback(
    (subj: string, mutate: (msgs: ChatMessage[]) => ChatMessage[]) => {
      setThreads((prev) => ({ ...prev, [subj]: mutate(prev[subj] ?? []) }));
    },
    [],
  );

  // ---- Suggestion fantôme des # ----
  const computeGhost = useCallback((value: string, caret: number): Ghost => {
    if (caret !== value.length) return null;
    const trigger = tagPrefsRef.current.trigger;
    const idx = value.lastIndexOf(trigger);
    if (idx === -1) return null;
    const prev = idx > 0 ? value[idx - 1] : "";
    if (prev && !/\s/.test(prev)) return null;
    const token = value.slice(idx + trigger.length);
    if (token.length === 0 || !/^[\p{L}\d-]*$/u.test(token)) return null;
    const best = matchTags(token, tagPrefsRef.current.favorites, 1)[0];
    if (!best) return null;
    const nid = normalizeTag(best.id);
    const nt = normalizeTag(token);
    if (!nid.startsWith(nt) || nid.length <= nt.length) return null;
    return { id: best.id, rest: best.id.slice(token.length), start: idx };
  }, []);

  const refreshGhost = useCallback(
    (value: string, caret: number) => {
      setGhost(suppressGhostRef.current ? null : computeGhost(value, caret));
    },
    [computeGhost],
  );

  function acceptGhost() {
    const g = ghost;
    if (!g) return;
    const el = inputRef.current;
    const trigger = tagPrefsRef.current.trigger;
    const next = input.slice(0, g.start) + trigger + g.id + " ";
    const newCaret = next.length;
    setInput(next);
    setGhost(null);
    requestAnimationFrame(() => {
      if (el) {
        el.focus();
        try {
          el.setSelectionRange(newCaret, newCaret);
        } catch {
          /* ignore */
        }
      }
    });
  }

  function openSubject(s: string) {
    setSubject(s);
    setError(null);
    setRetry(null);
    setInput("");
    setPendingAction(null);
    setGhost(null);
    setTimeout(() => inputRef.current?.focus(), 40);
  }

  function clearSubject(s: string) {
    setThreads((prev) => ({ ...prev, [s]: [] }));
    setError(null);
    setRetry(null);
  }

  async function send(text: string, action: QuickAction | null) {
    const clean = text.trim();
    if (!clean || loading || !configured || !subject) return;
    const subj = subject;

    const baseMessages = threads[subj] ?? [];
    updateThread(subj, (msgs) => [
      ...msgs,
      { role: "user", content: clean },
      { role: "assistant", content: "" },
    ]);
    const assistantIndex = baseMessages.length + 1;

    setInput("");
    setPendingAction(null);
    setGhost(null);
    setError(null);
    setRetry(null);
    setLoading(true);

    const history = baseMessages.slice(-MAX_HISTORY);
    const ac = new AbortController();
    abortRef.current = ac;

    let acc = "";
    let flushTimer: ReturnType<typeof setTimeout> | null = null;
    const writeInto = (content: string) =>
      updateThread(subj, (msgs) => {
        const next = msgs.slice();
        if (next[assistantIndex]?.role === "assistant")
          next[assistantIndex] = { role: "assistant", content };
        return next;
      });
    const scheduleFlush = () => {
      if (flushTimer) return;
      flushTimer = setTimeout(() => {
        flushTimer = null;
        writeInto(acc);
      }, 60);
    };
    const removeEmptyPlaceholder = () =>
      updateThread(subj, (msgs) => {
        const next = msgs.slice();
        if (next[assistantIndex]?.role === "assistant" && !next[assistantIndex].content)
          next.splice(assistantIndex, 1);
        return next;
      });

    try {
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: clean,
          history,
          action: action ?? undefined,
          context: { subject: subj },
          tags: extractTags(clean, tagPrefsRef.current.trigger),
        }),
        signal: ac.signal,
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        removeEmptyPlaceholder();
        setError(data?.message ?? "L'IA est indisponible pour le moment. Réessaie dans un instant.");
        setRetry({ text: clean, action });
        return;
      }
      if (res.body) {
        const reader = res.body.getReader();
        const dec = new TextDecoder();
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          acc += dec.decode(value, { stream: true });
          scheduleFlush();
        }
      }
      if (flushTimer) {
        clearTimeout(flushTimer);
        flushTimer = null;
      }
      writeInto(acc);
      if (!acc.trim()) {
        removeEmptyPlaceholder();
        setError("L’IA n’a pas renvoyé de réponse. Réessaie.");
        setRetry({ text: clean, action });
      }
    } catch (err) {
      if (flushTimer) {
        clearTimeout(flushTimer);
        flushTimer = null;
      }
      writeInto(acc);
      const aborted =
        err instanceof DOMException
          ? err.name === "AbortError"
          : (err as { name?: string })?.name === "AbortError";
      if (aborted) {
        if (!acc.trim()) removeEmptyPlaceholder();
      } else {
        if (!acc.trim()) removeEmptyPlaceholder();
        setError("Connexion interrompue. Réessaie dans un instant.");
        setRetry({ text: clean, action });
      }
    } finally {
      abortRef.current = null;
      setLoading(false);
      setTimeout(() => inputRef.current?.focus(), 30);
    }
  }

  function stop() {
    abortRef.current?.abort();
  }

  function onQuickAction(a: { action: QuickAction; starter: string }) {
    setInput(a.starter);
    setPendingAction(a.action);
    inputRef.current?.focus();
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (ghost) {
      if (e.key === "Tab" || e.key === "ArrowRight" || (e.key === "Enter" && !e.shiftKey)) {
        e.preventDefault();
        acceptGhost();
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        suppressGhostRef.current = true;
        setGhost(null);
        return;
      }
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send(input, pendingAction);
    }
  }

  async function copyMessage(text: string, idx: number) {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      try {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      } catch {
        return;
      }
    }
    setCopiedIdx(idx);
    setTimeout(() => setCopiedIdx((v) => (v === idx ? null : v)), 1500);
  }

  // ---------- Écran : liste des matières (discussions) ----------
  if (!subject) {
    return (
      <div className="mx-auto w-full max-w-2xl px-3 pt-[calc(env(safe-area-inset-top,0px)+14px)] pb-32">
        <header className="mb-4">
          <h1 className="text-2xl font-semibold leading-tight">Discussions</h1>
          <p className="text-sm text-ink-3">
            {firstName ? `${firstName}, choisis` : "Choisis"} une matière pour en parler avec l’assistant.
          </p>
        </header>

        {!configured && (
          <div
            className="card p-4 mb-3 text-sm text-ink-2"
            style={{ background: "color-mix(in srgb, var(--amber) 12%, var(--glass))" }}
            role="status"
          >
            <strong className="text-ink">IA non configurée.</strong> L’assistant sera disponible
            dès que la clé API aura été ajoutée côté serveur.
          </div>
        )}

        <div className="flex flex-col gap-2.5">
          {SUBJECTS.map((s) => {
            const count = threads[s]?.filter((m) => m.role === "user").length ?? 0;
            return (
              <button
                key={s}
                onClick={() => openSubject(s)}
                className="card w-full flex items-center gap-3.5 p-4 text-left hover:shadow-[var(--shadow-float)] transition-shadow"
              >
                <span
                  className="w-10 h-10 rounded-full flex-none"
                  style={{ background: `color-mix(in srgb, ${toneColor(s)} 24%, transparent)`, boxShadow: `inset 0 0 0 1.5px ${toneColor(s)}` }}
                  aria-hidden
                />
                <span className="flex-1 min-w-0">
                  <span className="font-semibold block">{s}</span>
                  <span className="text-xs text-ink-3">
                    {count > 0 ? `${count} message${count > 1 ? "s" : ""}` : "Nouvelle discussion"}
                  </span>
                </span>
                <ChevronRight size={18} aria-hidden className="text-ink-3 flex-none" />
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  // ---------- Écran : chat d'une matière ----------
  const showEmpty = messages.length === 0 && !loading;

  return (
    <div className="mx-auto w-full max-w-2xl px-3 pt-[calc(env(safe-area-inset-top,0px)+14px)]">
      <header className="flex items-center gap-3 mb-3">
        <button className="btn-ghost !px-2.5 !py-2" onClick={() => setSubject(null)} aria-label="Retour aux discussions">
          <ArrowLeft size={18} aria-hidden />
        </button>
        <span
          className="w-9 h-9 rounded-full flex-none"
          style={{ background: `color-mix(in srgb, ${toneColor(subject)} 24%, transparent)`, boxShadow: `inset 0 0 0 1.5px ${toneColor(subject)}` }}
          aria-hidden
        />
        <div className="flex-1 min-w-0">
          <h1 className="text-lg font-semibold leading-tight truncate">{subject}</h1>
          <p className="text-xs text-ink-3">Discussion sur {subject.toLowerCase()}</p>
        </div>
        {messages.length > 0 && (
          <button
            className="btn-ghost !px-3 !py-2"
            onClick={() => clearSubject(subject)}
            aria-label="Effacer cette discussion"
          >
            <Trash2 size={18} aria-hidden />
          </button>
        )}
      </header>

      {!configured && (
        <div
          className="card p-4 mb-3 text-sm text-ink-2"
          style={{ background: "color-mix(in srgb, var(--amber) 12%, var(--glass))" }}
          role="status"
        >
          <strong className="text-ink">IA non configurée.</strong> L’assistant sera disponible dès
          que la clé API aura été ajoutée côté serveur.
        </div>
      )}

      <div className="pb-40">
        {showEmpty ? (
          <div className="card p-6 text-center flex flex-col items-center gap-3 mt-2">
            <h2 className="text-base font-semibold">Discussion sur {subject}</h2>
            <p className="text-ink-2 text-sm max-w-[40ch] leading-relaxed">
              Pose ta question. Je t’explique pas à pas, sans faire le travail à ta place. Tape{" "}
              <b>{tagPrefs.trigger}</b> pour une commande.
            </p>
            <div className="flex flex-wrap justify-center gap-2 mt-1">
              {QUICK_ACTIONS.map((a) => (
                <button
                  key={a.action}
                  className="chip hover:shadow-[var(--shadow-soft)] transition-shadow"
                  style={{ cursor: "pointer" }}
                  onClick={() => onQuickAction(a)}
                  disabled={!configured}
                >
                  {a.label}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-3 mt-2">
            {messages.map((m, i) =>
              m.role === "user" ? (
                <div
                  key={i}
                  className="ml-auto max-w-[85%] rounded-[18px] px-3.5 py-2.5 text-[0.95rem] leading-relaxed whitespace-pre-wrap"
                  style={{ background: "color-mix(in srgb, var(--green) 16%, transparent)", color: "var(--ink)" }}
                >
                  {m.content}
                </div>
              ) : (
                <div key={i} className="mr-auto max-w-[92%] group">
                  <div className="card px-4 py-1">
                    {m.content ? (
                      <Markdown>{m.content}</Markdown>
                    ) : (
                      <div className="inline-flex items-center gap-1.5 py-3">
                        <span className="ai-dot" />
                        <span className="ai-dot" style={{ animationDelay: "0.15s" }} />
                        <span className="ai-dot" style={{ animationDelay: "0.3s" }} />
                      </div>
                    )}
                  </div>
                  {m.content && (
                    <button
                      className="mt-1 ml-1 inline-flex items-center gap-1 text-xs text-ink-3 hover:text-ink-2"
                      onClick={() => copyMessage(m.content, i)}
                      aria-label="Copier la réponse"
                    >
                      {copiedIdx === i ? (
                        <>
                          <Check size={13} aria-hidden /> Copié
                        </>
                      ) : (
                        <>
                          <Copy size={13} aria-hidden /> Copier
                        </>
                      )}
                    </button>
                  )}
                </div>
              ),
            )}

            {error && (
              <div className="mr-auto max-w-[92%]">
                <div
                  className="card px-4 py-3 text-sm text-ink-2"
                  style={{ background: "color-mix(in srgb, var(--coral) 10%, var(--glass))" }}
                  role="alert"
                >
                  {error}
                  {retry && (
                    <button
                      className="btn-ghost !py-1.5 !px-3 !text-sm mt-2 block"
                      onClick={() => send(retry.text, retry.action)}
                    >
                      Réessayer
                    </button>
                  )}
                </div>
              </div>
            )}

            <div ref={endRef} className="scroll-mb-44" />
          </div>
        )}
      </div>

      {/* Composeur */}
      <div
        className="sticky z-20 mx-auto w-full max-w-2xl"
        style={{ bottom: "calc(env(safe-area-inset-bottom,0px) + 86px)" }}
      >
        {pendingAction && (
          <div className="mb-1 flex justify-start">
            <span className="chip" style={{ background: "color-mix(in srgb, var(--sky) 14%, transparent)" }}>
              {QUICK_ACTIONS.find((a) => a.action === pendingAction)?.label}
              <button
                className="ml-1.5 text-ink-3 hover:text-ink-2"
                onClick={() => setPendingAction(null)}
                aria-label="Retirer l'action"
              >
                <X size={12} aria-hidden />
              </button>
            </span>
          </div>
        )}
        <div className="glass-strong flex items-end gap-2 p-2 !rounded-[22px]">
          <div className="relative flex-1 self-stretch">
            {ghost && (
              <div ref={ghostRef} aria-hidden className="ai-ghost">
                <span style={{ visibility: "hidden" }}>{input}</span>
                <span className="ai-ghost-text">{ghost.rest}</span>
              </div>
            )}
            <textarea
              ref={inputRef}
              className="ai-ta"
              rows={1}
              placeholder={configured ? `Pose ta question sur ${subject}…` : "IA non configurée"}
              value={input}
              disabled={!configured || loading}
              onChange={(e) => {
                suppressGhostRef.current = false;
                setInput(e.target.value);
                refreshGhost(e.target.value, e.target.selectionStart ?? e.target.value.length);
              }}
              onSelect={(e) => refreshGhost(e.currentTarget.value, e.currentTarget.selectionStart ?? 0)}
              onScroll={(e) => {
                if (ghostRef.current) ghostRef.current.scrollTop = e.currentTarget.scrollTop;
              }}
              onBlur={() => setTimeout(() => setGhost(null), 120)}
              onKeyDown={onKeyDown}
              aria-label="Votre message"
            />
          </div>
          {loading ? (
            <button
              className="btn-ghost !px-3.5 !py-2.5 !rounded-[16px]"
              onClick={stop}
              aria-label="Arrêter la génération"
            >
              <Square size={16} aria-hidden fill="currentColor" />
            </button>
          ) : (
            <button
              className="btn-primary !px-3.5 !py-2.5 !rounded-[16px]"
              onClick={() => send(input, pendingAction)}
              disabled={!configured || !input.trim()}
              aria-label="Envoyer"
            >
              <Send size={18} aria-hidden />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
