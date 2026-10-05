"use client";

// Assistant scolaire Orbs — interface de conversation.
//
// - Parle UNIQUEMENT à notre backend /api/ai/chat (jamais à OpenAI en direct,
//   aucune clé côté navigateur).
// - Historique des conversations en localStorage (clé "orbs.ai.v1").
// - Rendu Markdown des réponses, copie, nouvelle conversation, suppression,
//   états « réflexion » et erreurs, actions rapides. Responsive.

import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import {
  Sparkle,
  Send,
  Square,
  Plus,
  Trash2,
  Copy,
  Check,
  MessageSquare,
  X,
} from "lucide-react";
import { Markdown } from "@/components/Markdown";
import type { ChatMessage, QuickAction } from "@/lib/ai/types";
import {
  type TagPrefs,
  loadTagPrefs,
  matchTags,
  normalizeTag,
  extractTags,
} from "@/lib/ai/tags";

// Suggestion « fantôme » : la fin de la commande, affichée en gris derrière
// le texte. Entrée ou Tab la complète (comme un auto-correcteur).
type Ghost = { id: string; rest: string; start: number } | null;

type Conversation = {
  id: string;
  title: string;
  createdAt: number;
  messages: ChatMessage[];
};

const STORE_KEY = "orbs.ai.v1";
const MAX_HISTORY = 10; // nombre de messages renvoyés comme contexte à l'IA

const QUICK_ACTIONS: {
  action: QuickAction;
  label: string;
  starter: string;
}[] = [
  { action: "explain", label: "Expliquer", starter: "Explique-moi " },
  { action: "summarize", label: "Résumer", starter: "Résume-moi " },
  { action: "flashcards", label: "Créer une fiche", starter: "Crée une fiche sur " },
  { action: "questions", label: "Créer des questions", starter: "Crée des questions sur " },
  { action: "revise", label: "M'aider à réviser", starter: "Aide-moi à réviser " },
  { action: "mistake", label: "M'expliquer mon erreur", starter: "Explique-moi mon erreur : " },
];

function newId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `c${Date.now()}${Math.random().toString(16).slice(2)}`;
  }
}

function loadConversations(): Conversation[] {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return [];
    const data = JSON.parse(raw);
    if (Array.isArray(data?.conversations)) return data.conversations;
  } catch {
    /* localStorage indisponible ou données corrompues : on repart à vide */
  }
  return [];
}

export function AiChat({
  firstName,
  configured,
}: {
  firstName?: string | null;
  configured: boolean;
}) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [pendingAction, setPendingAction] = useState<QuickAction | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState<{ text: string; action: QuickAction | null } | null>(null);
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [tagPrefs, setTagPrefs] = useState<TagPrefs>({ trigger: "#", favorites: [] });
  const [ghost, setGhost] = useState<Ghost>(null);

  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const ghostRef = useRef<HTMLDivElement>(null);
  const suppressGhostRef = useRef(false); // Échap masque la suggestion jusqu'à la frappe suivante
  const abortRef = useRef<AbortController | null>(null);
  const tagPrefsRef = useRef<TagPrefs>(tagPrefs);
  tagPrefsRef.current = tagPrefs;

  // Préférences des # (déclencheur + favoris) : lues après le montage et
  // re-synchronisées quand les réglages changent (même onglet ou autre onglet).
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

  // Calcule la suggestion fantôme : on ne suggère que lorsque le curseur est à
  // la fin du texte et qu'une commande COMMENCE par ce qui est tapé.
  const computeGhost = useCallback((value: string, caret: number): Ghost => {
    if (caret !== value.length) return null; // seulement en fin de saisie
    const trigger = tagPrefsRef.current.trigger;
    const idx = value.lastIndexOf(trigger);
    if (idx === -1) return null;
    const prev = idx > 0 ? value[idx - 1] : "";
    if (prev && !/\s/.test(prev)) return null; // en début de mot seulement
    const token = value.slice(idx + trigger.length);
    if (token.length === 0 || !/^[\p{L}\d-]*$/u.test(token)) return null;
    const best = matchTags(token, tagPrefsRef.current.favorites, 1)[0];
    if (!best) return null;
    const nid = normalizeTag(best.id);
    const nt = normalizeTag(token);
    if (!nid.startsWith(nt) || nid.length <= nt.length) return null; // doit compléter un préfixe
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

  // Chargement initial depuis localStorage (client uniquement). Ce state ne
  // peut PAS être calculé au rendu : localStorage n'existe pas côté serveur,
  // donc on l'hydrate une seule fois après le montage.
  useEffect(() => {
    const convs = loadConversations();
    /* eslint-disable react-hooks/set-state-in-effect */
    setConversations(convs);
    setActiveId(convs[0]?.id ?? null);
    setLoaded(true);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  const persist = useCallback((convs: Conversation[]) => {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({ version: 1, conversations: convs }));
    } catch {
      /* quota plein / mode privé : on ignore, l'app continue de fonctionner */
    }
  }, []);

  // Sauvegarde : immédiate hors streaming ; throttle pendant le streaming
  // (la bulle change toutes les 60 ms). Quand le tour se termine, `loading`
  // repasse à false et on enregistre aussitôt l'état final — rien n'est perdu
  // même si on recharge juste après.
  useEffect(() => {
    if (!loaded) return;
    const id = setTimeout(() => persist(conversations), loading ? 500 : 0);
    return () => clearTimeout(id);
  }, [conversations, loaded, loading, persist]);

  // Filet de sécurité : si l'onglet est fermé/masqué, on écrit tout de suite.
  useEffect(() => {
    const flush = () => persist(conversations);
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", flush);
    return () => {
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", flush);
    };
  }, [conversations, persist]);

  const active = useMemo(
    () => conversations.find((c) => c.id === activeId) ?? null,
    [conversations, activeId],
  );

  // Défilement automatique : suit le texte qui se génère, mais uniquement si
  // la fin de la conversation est (presque) à l'écran, pour ne pas déranger
  // l'élève qui remonte lire un message précédent. À l'envoi d'un message, on
  // redescend toujours. On mesure depuis le repère de fin (endRef) et non depuis
  // la hauteur de la page : celle-ci inclut l'espace sous la réponse réservé à la
  // zone de saisie et à la barre de navigation, ce qui faussait le calcul.
  const lastLen =
    active?.messages[active.messages.length - 1]?.content.length ?? 0;
  useEffect(() => {
    const el = endRef.current;
    if (!el) return;
    const justSent = loading && lastLen === 0;
    const nearBottom = el.getBoundingClientRect().bottom <= window.innerHeight + 160;
    if (justSent || nearBottom) el.scrollIntoView({ block: "end" });
  }, [active?.messages.length, lastLen, loading]);

  const updateActive = useCallback(
    (mutate: (c: Conversation) => Conversation, id?: string) => {
      const targetId = id ?? activeId;
      if (!targetId) return;
      setConversations((prev) =>
        prev.map((c) => (c.id === targetId ? mutate(c) : c)),
      );
    },
    [activeId],
  );

  function startNewConversation() {
    const conv: Conversation = {
      id: newId(),
      title: "",
      createdAt: Date.now(),
      messages: [],
    };
    setConversations((prev) => [conv, ...prev]);
    setActiveId(conv.id);
    setError(null);
    setRetry(null);
    setShowHistory(false);
    setInput("");
    setPendingAction(null);
    setTimeout(() => inputRef.current?.focus(), 30);
  }

  function deleteConversation(id: string) {
    setConversations((prev) => {
      const next = prev.filter((c) => c.id !== id);
      if (id === activeId) setActiveId(next[0]?.id ?? null);
      return next;
    });
  }

  async function send(text: string, action: QuickAction | null) {
    const clean = text.trim();
    if (!clean || loading) return;
    if (!configured) return;

    // Conversation active (créée à la volée si besoin).
    let convId = activeId;
    let baseMessages: ChatMessage[] = [];
    if (!convId || !conversations.some((c) => c.id === convId)) {
      const conv: Conversation = {
        id: newId(),
        title: "",
        createdAt: Date.now(),
        messages: [],
      };
      convId = conv.id;
      setConversations((prev) => [conv, ...prev]);
      setActiveId(conv.id);
    } else {
      baseMessages = conversations.find((c) => c.id === convId)?.messages ?? [];
    }

    // On ajoute d'un coup le message de l'élève ET une bulle assistant vide,
    // qu'on remplit ensuite au fur et à mesure que le texte arrive.
    updateActive(
      (c) => ({
        ...c,
        title: c.title || clean.slice(0, 42),
        messages: [
          ...c.messages,
          { role: "user", content: clean },
          { role: "assistant", content: "" },
        ],
      }),
      convId,
    );
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
      updateActive((c) => {
        const msgs = c.messages.slice();
        if (msgs[assistantIndex]?.role === "assistant")
          msgs[assistantIndex] = { role: "assistant", content };
        return { ...c, messages: msgs };
      }, convId);
    // On n'écrit dans le state qu'au plus toutes les 60 ms (fluide, sans
    // re-rendre le Markdown à chaque lettre).
    const scheduleFlush = () => {
      if (flushTimer) return;
      flushTimer = setTimeout(() => {
        flushTimer = null;
        writeInto(acc);
      }, 60);
    };
    const removeEmptyPlaceholder = () =>
      updateActive((c) => {
        const msgs = c.messages.slice();
        if (msgs[assistantIndex]?.role === "assistant" && !msgs[assistantIndex].content)
          msgs.splice(assistantIndex, 1);
        return { ...c, messages: msgs };
      }, convId);

    try {
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: clean,
          history,
          action: action ?? undefined,
          tags: extractTags(clean, tagPrefsRef.current.trigger),
        }),
        signal: ac.signal,
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        removeEmptyPlaceholder();
        setError(
          data?.message ??
            "L'IA est indisponible pour le moment. Réessaie dans un instant.",
        );
        setRetry({ text: clean, action });
        return;
      }
      // Lecture du flux : on ajoute le texte au fur et à mesure.
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
      writeInto(acc); // on garde le texte déjà reçu
      const aborted =
        err instanceof DOMException
          ? err.name === "AbortError"
          : (err as { name?: string })?.name === "AbortError";
      if (aborted) {
        // Arrêt volontaire : on garde le partiel, pas de message d'erreur.
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
    // Suggestion fantôme : Tab, Entrée ou → la complètent (comme un auto-correcteur).
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
      // Repli : sélection via un textarea temporaire.
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

  const hello = firstName ? `Bonjour ${firstName} 👋` : "Bonjour 👋";
  const messages = active?.messages ?? [];
  const showWelcome = messages.length === 0 && !loading;

  return (
    <div className="mx-auto w-full max-w-2xl px-3 pt-[calc(env(safe-area-inset-top,0px)+14px)]">
      {/* En-tête */}
      <header className="flex items-center gap-3 mb-3">
        <span className="icon-chip sky !w-11 !h-11 !rounded-[16px]">
          <Sparkle size={22} strokeWidth={1.8} aria-hidden />
        </span>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-semibold leading-tight">Assistant Orbs</h1>
          <p className="text-xs text-ink-3">Aide aux devoirs, révisions et explications</p>
        </div>
        <button
          className="btn-ghost !px-3 !py-2"
          onClick={() => setShowHistory((v) => !v)}
          aria-label="Historique des conversations"
          aria-expanded={showHistory}
        >
          <MessageSquare size={18} aria-hidden />
        </button>
        <button
          className="btn-ghost !px-3 !py-2"
          onClick={startNewConversation}
          aria-label="Nouvelle conversation"
        >
          <Plus size={18} aria-hidden />
        </button>
      </header>

      {/* Panneau historique */}
      {showHistory && (
        <div className="card p-2 mb-3">
          <div className="flex items-center justify-between px-2 py-1">
            <span className="text-sm font-medium text-ink-2">Conversations</span>
            <button
              className="text-ink-3 hover:text-ink-2"
              onClick={() => setShowHistory(false)}
              aria-label="Fermer l'historique"
            >
              <X size={16} aria-hidden />
            </button>
          </div>
          {conversations.length === 0 ? (
            <p className="text-xs text-ink-3 px-2 py-2">Aucune conversation pour l’instant.</p>
          ) : (
            <ul className="max-h-64 overflow-y-auto">
              {conversations.map((c) => (
                <li key={c.id} className="flex items-center gap-1">
                  <button
                    className={`flex-1 text-left truncate rounded-xl px-2 py-2 text-sm ${
                      c.id === activeId ? "text-green-ink" : "text-ink-2"
                    }`}
                    style={
                      c.id === activeId
                        ? { background: "color-mix(in srgb, var(--green) 12%, transparent)" }
                        : undefined
                    }
                    onClick={() => {
                      setActiveId(c.id);
                      setShowHistory(false);
                      setError(null);
                    }}
                  >
                    {c.title || "Nouvelle conversation"}
                  </button>
                  <button
                    className="text-ink-3 hover:text-coral p-2"
                    onClick={() => deleteConversation(c.id)}
                    aria-label={`Supprimer « ${c.title || "conversation"} »`}
                  >
                    <Trash2 size={16} aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Bandeau « IA non configurée » */}
      {!configured && (
        <div
          className="card p-4 mb-3 text-sm text-ink-2"
          style={{ background: "color-mix(in srgb, var(--amber) 12%, var(--glass))" }}
          role="status"
        >
          <strong className="text-ink">IA non configurée.</strong> L’assistant sera
          disponible dès que la clé API aura été ajoutée côté serveur. Le reste
          d’Orbs fonctionne normalement.
        </div>
      )}

      {/* Zone messages */}
      <div className="pb-40">
        {showWelcome ? (
          <div className="card p-6 text-center flex flex-col items-center gap-3 mt-2">
            <span className="icon-chip sky !w-14 !h-14 !rounded-[20px]">
              <Sparkle size={26} strokeWidth={1.8} aria-hidden />
            </span>
            <h2 className="text-lg font-semibold">{hello}</h2>
            <p className="text-ink-2 text-sm max-w-[38ch] leading-relaxed">
              Pose une question sur un cours, un devoir ou un chapitre. Je
              t’explique pas à pas, sans faire le travail à ta place.
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
                  style={{
                    background: "color-mix(in srgb, var(--green) 16%, transparent)",
                    color: "var(--ink)",
                  }}
                >
                  {m.content}
                </div>
              ) : (
                <div key={i} className="mr-auto max-w-[92%] group">
                  <div className="card px-4 py-1">
                    {m.content ? (
                      <Markdown>{m.content}</Markdown>
                    ) : (
                      // Bulle en cours : « l'IA réfléchit » tant qu'aucun mot n'est arrivé.
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

            {/* Erreur */}
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

            {/* scroll-mb-44 : la fin s'arrête au-dessus de la zone de saisie + barre de navigation */}
            <div ref={endRef} className="scroll-mb-44" />
          </div>
        )}
      </div>

      {/* Composeur (collé en bas, au-dessus de la barre de navigation) */}
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
            {/* Suggestion fantôme : la fin de la commande, en gris derrière la saisie. */}
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
              placeholder={configured ? `Pose ta question… (tape ${tagPrefs.trigger} pour une commande)` : "IA non configurée"}
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
