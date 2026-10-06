"use client";

// Assistant scolaire Orbs.
//
// Panneau de gauche (masquable) à DEUX sections :
//   - « Discussions » : des conversations libres (comme un chat normal).
//   - « Matières » : une discussion par matière (l'IA sait la matière).
// À droite : le chat de la discussion sélectionnée.
// Tout est en localStorage ("orbs.ai.v2"). Parle au backend /api/ai/chat.

import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";
import {
  Send,
  Square,
  Trash2,
  Copy,
  Check,
  PanelLeft,
  X,
  Plus,
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
type Conv = { id: string; title: string; messages: ChatMessage[] };
type Sel = { kind: "subject" | "conv"; id: string } | null;

const STORE_KEY = "orbs.ai.v2";
const MAX_HISTORY = 10;

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
function newId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `c${Date.now()}${Math.random().toString(16).slice(2)}`;
  }
}

function loadStore(): { threads: Threads; convs: Conv[] } {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) {
      const data = JSON.parse(raw);
      return {
        threads: data?.threads && typeof data.threads === "object" ? data.threads : {},
        convs: Array.isArray(data?.convs) ? data.convs : [],
      };
    }
  } catch {
    /* indisponible / corrompu */
  }
  return { threads: {}, convs: [] };
}

export function AiChat({
  firstName,
  configured,
}: {
  firstName?: string | null;
  configured: boolean;
}) {
  const [threads, setThreads] = useState<Threads>({});
  const [convs, setConvs] = useState<Conv[]>([]);
  const [sel, setSel] = useState<Sel>(null);
  const [panelOpen, setPanelOpen] = useState(true);
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

  useEffect(() => {
    const { threads: t, convs: c } = loadStore();
    /* eslint-disable react-hooks/set-state-in-effect */
    setThreads(t);
    setConvs(c);
    setLoaded(true);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  const persist = useCallback((t: Threads, c: Conv[]) => {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({ version: 3, threads: t, convs: c }));
    } catch {
      /* quota plein / mode privé */
    }
  }, []);

  useEffect(() => {
    if (!loaded) return;
    const id = setTimeout(() => persist(threads, convs), loading ? 500 : 0);
    return () => clearTimeout(id);
  }, [threads, convs, loaded, loading, persist]);

  useEffect(() => {
    const flush = () => persist(threads, convs);
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", flush);
    return () => {
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", flush);
    };
  }, [threads, convs, persist]);

  // Messages de la sélection courante.
  const messages: ChatMessage[] = !sel
    ? []
    : sel.kind === "subject"
      ? threads[sel.id] ?? []
      : convs.find((c) => c.id === sel.id)?.messages ?? [];

  const lastLen = messages[messages.length - 1]?.content.length ?? 0;
  useEffect(() => {
    const el = endRef.current;
    if (!el) return;
    const justSent = loading && lastLen === 0;
    const nearBottom = el.getBoundingClientRect().bottom <= window.innerHeight + 160;
    if (justSent || nearBottom) el.scrollIntoView({ block: "end" });
  }, [messages.length, lastLen, loading]);

  const applyTo = useCallback(
    (tgt: NonNullable<Sel>, mutate: (msgs: ChatMessage[]) => ChatMessage[]) => {
      if (tgt.kind === "subject") {
        setThreads((prev) => ({ ...prev, [tgt.id]: mutate(prev[tgt.id] ?? []) }));
      } else {
        setConvs((prev) => prev.map((c) => (c.id === tgt.id ? { ...c, messages: mutate(c.messages) } : c)));
      }
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

  function select(s: Sel) {
    setSel(s);
    setError(null);
    setRetry(null);
    setInput("");
    setPendingAction(null);
    setGhost(null);
    setTimeout(() => inputRef.current?.focus(), 40);
  }

  function newConversation() {
    const conv: Conv = { id: newId(), title: "", messages: [] };
    setConvs((prev) => [conv, ...prev]);
    select({ kind: "conv", id: conv.id });
  }

  function deleteConversation(id: string) {
    setConvs((prev) => prev.filter((c) => c.id !== id));
    if (sel?.kind === "conv" && sel.id === id) setSel(null);
  }

  function clearCurrent() {
    if (!sel) return;
    applyTo(sel, () => []);
    setError(null);
    setRetry(null);
  }

  async function send(text: string, action: QuickAction | null) {
    const clean = text.trim();
    if (!clean || loading || !configured || !sel) return;
    const tgt = sel;
    const subjectForCtx = tgt.kind === "subject" ? tgt.id : undefined;

    const base = messages;
    applyTo(tgt, (msgs) => [
      ...msgs,
      { role: "user", content: clean },
      { role: "assistant", content: "" },
    ]);
    if (tgt.kind === "conv") {
      setConvs((prev) => prev.map((c) => (c.id === tgt.id && !c.title ? { ...c, title: clean.slice(0, 40) } : c)));
    }
    const assistantIndex = base.length + 1;

    setInput("");
    setPendingAction(null);
    setGhost(null);
    setError(null);
    setRetry(null);
    setLoading(true);

    const history = base.slice(-MAX_HISTORY);
    const ac = new AbortController();
    abortRef.current = ac;

    let acc = "";
    let flushTimer: ReturnType<typeof setTimeout> | null = null;
    const writeInto = (content: string) =>
      applyTo(tgt, (msgs) => {
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
      applyTo(tgt, (msgs) => {
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
          context: subjectForCtx ? { subject: subjectForCtx } : undefined,
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

  const title = !sel ? "" : sel.kind === "subject" ? sel.id : convs.find((c) => c.id === sel.id)?.title || "Nouvelle discussion";
  const headTone = sel?.kind === "subject" ? toneColor(sel.id) : "var(--sky)";
  const showEmpty = messages.length === 0 && !loading;

  return (
    <div className="mx-auto w-full max-w-4xl px-3 pt-[calc(env(safe-area-inset-top,0px)+14px)]">
      <div className="flex gap-3 items-stretch" style={{ minHeight: "calc(100dvh - 150px)" }}>
        {/* Panneau des discussions (à gauche, masquable) */}
        {panelOpen && (
          <aside className="ai-panel card p-2">
            <div className="flex items-center justify-between px-1.5 py-1 mb-1">
              <span className="text-sm font-semibold">Discussions</span>
              <div className="flex items-center gap-1">
                <button className="text-ink-2 hover:text-ink p-1" onClick={newConversation} aria-label="Nouvelle discussion">
                  <Plus size={16} aria-hidden />
                </button>
                <button className="text-ink-3 hover:text-ink-2 p-1" onClick={() => setPanelOpen(false)} aria-label="Masquer le panneau">
                  <X size={16} aria-hidden />
                </button>
              </div>
            </div>

            <div className="overflow-y-auto" style={{ maxHeight: "calc(100dvh - 210px)" }}>
              {/* Section 1 : discussions libres */}
              <div className="flex flex-col gap-0.5">
                {convs.length === 0 ? (
                  <p className="text-xs text-ink-3 px-2 py-1.5">Aucune discussion. Appuie sur + pour en créer une.</p>
                ) : (
                  convs.map((c) => {
                    const activeC = sel?.kind === "conv" && sel.id === c.id;
                    return (
                      <div key={c.id} className="flex items-center gap-1">
                        <button
                          onClick={() => select({ kind: "conv", id: c.id })}
                          className="flex-1 min-w-0 text-left rounded-xl px-2 py-2 text-sm truncate"
                          style={activeC ? { background: "color-mix(in srgb, var(--sky) 14%, transparent)", fontWeight: 600 } : undefined}
                        >
                          {c.title || "Nouvelle discussion"}
                        </button>
                        <button className="text-ink-3 hover:text-coral p-1.5 flex-none" onClick={() => deleteConversation(c.id)} aria-label="Supprimer la discussion">
                          <Trash2 size={14} aria-hidden />
                        </button>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Section 2 : matières */}
              <p className="text-xs font-semibold text-ink-3 uppercase tracking-wide px-2 pt-3 pb-1">Matières</p>
              <div className="flex flex-col gap-0.5">
                {SUBJECTS.map((s) => {
                  const count = threads[s]?.filter((m) => m.role === "user").length ?? 0;
                  const activeS = sel?.kind === "subject" && sel.id === s;
                  return (
                    <button
                      key={s}
                      onClick={() => select({ kind: "subject", id: s })}
                      className="w-full flex items-center gap-2.5 rounded-xl px-2 py-2 text-left"
                      style={activeS ? { background: `color-mix(in srgb, ${toneColor(s)} 14%, transparent)` } : undefined}
                    >
                      <span
                        className="rounded-full flex-none"
                        style={{ width: 20, height: 20, background: `color-mix(in srgb, ${toneColor(s)} 24%, transparent)`, boxShadow: `inset 0 0 0 1.5px ${toneColor(s)}` }}
                        aria-hidden
                      />
                      <span className="min-w-0 flex-1">
                        <span className={`text-sm block truncate ${activeS ? "font-semibold" : "font-medium"}`}>{s}</span>
                        {count > 0 && <span className="text-[0.68rem] text-ink-3">{count} msg</span>}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </aside>
        )}

        {/* Chat */}
        <section className="flex-1 min-w-0 flex flex-col">
          <header className="flex items-center gap-2 mb-3">
            {!panelOpen && (
              <button className="btn-ghost !px-2.5 !py-2" onClick={() => setPanelOpen(true)} aria-label="Afficher les discussions">
                <PanelLeft size={18} aria-hidden />
              </button>
            )}
            {sel ? (
              <>
                <span className="rounded-full flex-none" style={{ width: 34, height: 34, background: `color-mix(in srgb, ${headTone} 24%, transparent)`, boxShadow: `inset 0 0 0 1.5px ${headTone}` }} aria-hidden />
                <div className="flex-1 min-w-0">
                  <h1 className="text-lg font-semibold leading-tight truncate">{title}</h1>
                  <p className="text-xs text-ink-3 truncate">
                    {sel.kind === "subject" ? `Discussion sur ${sel.id.toLowerCase()}` : "Discussion libre"}
                  </p>
                </div>
                {messages.length > 0 && (
                  <button className="btn-ghost !px-3 !py-2" onClick={clearCurrent} aria-label="Effacer cette discussion">
                    <Trash2 size={18} aria-hidden />
                  </button>
                )}
              </>
            ) : (
              <h1 className="text-xl font-semibold flex-1">Assistant Orbs</h1>
            )}
          </header>

          {!configured && (
            <div className="card p-4 mb-3 text-sm text-ink-2" style={{ background: "color-mix(in srgb, var(--amber) 12%, var(--glass))" }} role="status">
              <strong className="text-ink">IA non configurée.</strong> L’assistant sera disponible dès que la clé API aura été ajoutée côté serveur.
            </div>
          )}

          {!sel ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="card p-8 text-center text-ink-2 text-sm leading-relaxed max-w-sm">
                {firstName ? `${firstName}, choisis` : "Choisis"} une discussion {panelOpen ? "à gauche" : "en ouvrant le panneau"} — une conversation libre, ou une matière — pour commencer.
              </div>
            </div>
          ) : (
            <>
              <div className="flex-1 pb-40">
                {showEmpty ? (
                  <div className="card p-6 text-center flex flex-col items-center gap-3 mt-1">
                    <h2 className="text-base font-semibold">{sel.kind === "subject" ? `Discussion sur ${sel.id}` : "Nouvelle discussion"}</h2>
                    <p className="text-ink-2 text-sm max-w-[40ch] leading-relaxed">
                      Pose ta question. Je t’explique pas à pas, sans faire le travail à ta place.
                    </p>
                    <div className="flex flex-wrap justify-center gap-2 mt-1">
                      {QUICK_ACTIONS.map((a) => (
                        <button key={a.action} className="chip hover:shadow-[var(--shadow-soft)] transition-shadow" style={{ cursor: "pointer" }} onClick={() => onQuickAction(a)} disabled={!configured}>
                          {a.label}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col gap-3 mt-1">
                    {messages.map((m, i) =>
                      m.role === "user" ? (
                        <div key={i} className="ml-auto max-w-[85%] rounded-[18px] px-3.5 py-2.5 text-[0.95rem] leading-relaxed whitespace-pre-wrap" style={{ background: "color-mix(in srgb, var(--green) 16%, transparent)", color: "var(--ink)" }}>
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
                            <button className="mt-1 ml-1 inline-flex items-center gap-1 text-xs text-ink-3 hover:text-ink-2" onClick={() => copyMessage(m.content, i)} aria-label="Copier la réponse">
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
                        <div className="card px-4 py-3 text-sm text-ink-2" style={{ background: "color-mix(in srgb, var(--coral) 10%, var(--glass))" }} role="alert">
                          {error}
                          {retry && (
                            <button className="btn-ghost !py-1.5 !px-3 !text-sm mt-2 block" onClick={() => send(retry.text, retry.action)}>
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
              <div className="sticky z-20 w-full" style={{ bottom: "calc(env(safe-area-inset-bottom,0px) + 86px)" }}>
                {pendingAction && (
                  <div className="mb-1 flex justify-start">
                    <span className="chip" style={{ background: "color-mix(in srgb, var(--sky) 14%, transparent)" }}>
                      {QUICK_ACTIONS.find((a) => a.action === pendingAction)?.label}
                      <button className="ml-1.5 text-ink-3 hover:text-ink-2" onClick={() => setPendingAction(null)} aria-label="Retirer l'action">
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
                      placeholder={configured ? "Pose ta question…" : "IA non configurée"}
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
                    <button className="btn-ghost !px-3.5 !py-2.5 !rounded-[16px]" onClick={stop} aria-label="Arrêter la génération">
                      <Square size={16} aria-hidden fill="currentColor" />
                    </button>
                  ) : (
                    <button className="btn-primary !px-3.5 !py-2.5 !rounded-[16px]" onClick={() => send(input, pendingAction)} disabled={!configured || !input.trim()} aria-label="Envoyer">
                      <Send size={18} aria-hidden />
                    </button>
                  )}
                </div>
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
