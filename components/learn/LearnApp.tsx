"use client";

import {
  useCallback,
  useEffect,
  useReducer,
  useRef,
  useState,
} from "react";
import {
  GraduationCap,
  Plus,
  Timer,
  Flame,
  Star,
  Pencil,
  Trash2,
  Share2,
  Upload,
  Download,
  SlidersHorizontal,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import type { Deck, State } from "@/lib/learn/types";
import { KIND_META, SUBJECT_TONE } from "@/lib/learn/types";
import {
  load,
  save as storeSave,
  listDecks,
  deleteDeck,
  toggleFav,
} from "@/lib/learn/store";
import { deckProgress, dueCount } from "@/lib/learn/sm2";
import {
  levelFromXp,
  levelProgress,
  dailyProgress,
} from "@/lib/learn/progress";
import {
  exportJSON,
  importJSON,
  encodeDeckShare,
  decodeDeckShare,
  deckFromShare,
} from "@/lib/learn/share";
import { summarize } from "@/lib/learn/summary";
import { syncLearnSummary } from "@/app/actions/family";
import type { LearnCtx } from "./ctx";
import { CreateDeck } from "./CreateDeck";
import { StudyPicker, type Mode } from "./StudyPicker";
import { StudySession } from "./StudySession";
import { FOCUS_OPEN_EVENT } from "@/lib/learn/focus";

/** Ouvre la fenêtre de concentration (minuteur global monté dans le layout). */
function openFocus() {
  try {
    window.dispatchEvent(new Event(FOCUS_OPEN_EVENT));
  } catch {
    /* hors navigateur */
  }
}

type View =
  | { name: "home" }
  | { name: "create"; editId?: string }
  | { name: "pick"; deckId: string }
  | { name: "study"; deckId: string; mode: Mode };

// Envoie un résumé (compteurs seulement) à l'espace famille, sans bloquer.
let syncTimer: ReturnType<typeof setTimeout> | null = null;
function scheduleSync(delay: number, s: State) {
  if (syncTimer) clearTimeout(syncTimer);
  syncTimer = setTimeout(() => {
    syncLearnSummary(summarize(s)).catch(() => {});
  }, delay);
}

export function LearnApp() {
  // Les paquets vivent dans localStorage (absent côté serveur) : on les charge après
  // l'affichage initial, sinon la page ne correspondrait pas au HTML du serveur.
  const [state, setState] = useState<State | null>(null);
  const [, force] = useReducer((x) => x + 1, 0);

  useEffect(() => {
    const s = load();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setState(s);
    scheduleSync(500, s);
  }, []);

  const save = useCallback(() => {
    if (state) {
      storeSave(state);
      scheduleSync(1500, state);
    }
    force();
  }, [state]);

  const [view, setView] = useState<View>({ name: "home" });
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flash = useCallback((m: string) => {
    setToast(m);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2400);
  }, []);

  if (!state) {
    return (
      <div className="mx-auto max-w-xl px-4 pt-24 text-center text-ink-3">
        Chargement…
      </div>
    );
  }

  const ctx: LearnCtx = { s: state, save };

  let body: React.ReactNode;
  if (view.name === "create") {
    body = (
      <CreateDeck ctx={ctx} editId={view.editId} onDone={() => setView({ name: "home" })} />
    );
  } else if (view.name === "pick") {
    const deck = ctx.s.decks[view.deckId];
    if (!deck) body = <Home ctx={ctx} setView={setView} flash={flash} />;
    else
      body = (
        <StudyPicker
          deck={deck}
          onStart={(mode) => setView({ name: "study", deckId: deck.id, mode })}
          onBack={() => setView({ name: "home" })}
          onEdit={() => setView({ name: "create", editId: deck.id })}
        />
      );
  } else if (view.name === "study") {
    const deck = ctx.s.decks[view.deckId];
    if (!deck) body = <Home ctx={ctx} setView={setView} flash={flash} />;
    else
      body = (
        <StudySession
          ctx={ctx}
          deck={deck}
          mode={view.mode}
          onDone={() => setView({ name: "pick", deckId: deck.id })}
        />
      );
  } else {
    body = <Home ctx={ctx} setView={setView} flash={flash} />;
  }

  return (
    <>
      {body}
      {toast && (
        <div
          className="fixed left-1/2 -translate-x-1/2 z-50 glass-strong rounded-full px-4 py-2 text-sm"
          style={{ bottom: "calc(90px + env(safe-area-inset-bottom,0px))" }}
        >
          {toast}
        </div>
      )}
    </>
  );
}

/* ---------------- Carte d'un paquet ---------------- */
function DeckCard({
  deck,
  ctx,
  setView,
  onShare,
}: {
  deck: Deck;
  ctx: LearnCtx;
  setView: (v: View) => void;
  onShare: (id: string) => void;
}) {
  const tone = SUBJECT_TONE[deck.subject] || "green";
  const due = dueCount(deck);
  const pct = Math.round(deckProgress(deck) * 100);
  return (
    <div className="card p-4">
      <button className="w-full text-left" onClick={() => setView({ name: "pick", deckId: deck.id })}>
        <div className="flex items-center justify-between gap-2">
          <span className="font-semibold leading-snug">{deck.name}</span>
          {due > 0 && (
            <span className="chip shrink-0" style={{ color: "var(--green-ink)" }}>
              {due} à réviser
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 mt-1.5 text-xs">
          <span
            className="rounded-full px-2 py-0.5 font-medium"
            style={{
              background: `color-mix(in srgb, var(--${tone}) 15%, transparent)`,
              color: `var(--${tone === "green" ? "green-ink" : tone})`,
            }}
          >
            {deck.subject}
          </span>
          <span className="text-ink-3">{KIND_META[deck.kind].label}</span>
          <span className="text-ink-3">· {deck.cards.length} cartes</span>
        </div>
        <div className="mt-3 h-1.5 rounded-full bg-fill overflow-hidden">
          <div className="h-full rounded-full bg-[var(--green)]" style={{ width: `${pct}%` }} />
        </div>
      </button>
      <div className="flex items-center gap-1 mt-3">
        <button className="btn-ghost !px-2.5 !py-1.5" onClick={() => { toggleFav(ctx.s, deck.id); ctx.save(); }} aria-label="Favori">
          <Star size={15} className={deck.fav ? "text-amber fill-[var(--amber)]" : ""} aria-hidden />
        </button>
        <button className="btn-ghost !px-2.5 !py-1.5" onClick={() => setView({ name: "create", editId: deck.id })} aria-label="Modifier">
          <Pencil size={14} aria-hidden />
        </button>
        <button className="btn-ghost !px-2.5 !py-1.5" onClick={() => onShare(deck.id)} aria-label="Partager">
          <Share2 size={14} aria-hidden />
        </button>
        <button
          className="btn-ghost !px-2.5 !py-1.5 ml-auto"
          onClick={() => {
            if (confirm(`Supprimer « ${deck.name} » ?`)) {
              deleteDeck(ctx.s, deck.id);
              ctx.save();
            }
          }}
          aria-label="Supprimer"
        >
          <Trash2 size={14} className="text-coral" aria-hidden />
        </button>
        <button className="btn-primary !py-1.5" onClick={() => setView({ name: "pick", deckId: deck.id })}>
          Étudier
        </button>
      </div>
    </div>
  );
}

type SortKey = "subject" | "recent" | "name" | "due";
const LEARN_UI_KEY = "orbs.learn.ui";

/* ---------------- Accueil du module ---------------- */
function Home({
  ctx,
  setView,
  flash,
}: {
  ctx: LearnCtx;
  setView: (v: View) => void;
  flash: (m: string) => void;
}) {
  const decks = listDecks(ctx.s);
  const xp = ctx.s.stats.xp;
  const level = levelFromXp(xp);
  const prog = levelProgress(xp);
  const goal = ctx.s.settings.dailyGoal;
  const today = dailyProgress(ctx.s);
  const [options, setOptions] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  // Tri / dossiers par matière (préférence mémorisée).
  const [sort, setSort] = useState<SortKey>("subject");
  const [folded, setFolded] = useState<Record<string, boolean>>({});
  useEffect(() => {
    try {
      const raw = localStorage.getItem(LEARN_UI_KEY);
      if (raw) {
        const o = JSON.parse(raw);
        /* eslint-disable react-hooks/set-state-in-effect */
        if (["subject", "recent", "name", "due"].includes(o?.sort)) setSort(o.sort);
        if (o?.fold && typeof o.fold === "object") setFolded(o.fold);
        /* eslint-enable react-hooks/set-state-in-effect */
      }
    } catch {
      /* préférences par défaut */
    }
  }, []);
  function persistUi(nextSort: SortKey, nextFold: Record<string, boolean>) {
    try {
      localStorage.setItem(LEARN_UI_KEY, JSON.stringify({ sort: nextSort, fold: nextFold }));
    } catch {
      /* ignore */
    }
  }
  function changeSort(v: SortKey) {
    setSort(v);
    persistUi(v, folded);
  }
  function toggleFold(sub: string) {
    const next = { ...folded, [sub]: !folded[sub] };
    setFolded(next);
    persistUi(sort, next);
  }

  function exportAll() {
    try {
      const blob = new Blob([exportJSON(ctx.s)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `orbs-apprendre-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      flash("Export impossible sur cet appareil.");
    }
  }
  async function onImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const n = importJSON(ctx.s, text);
    ctx.save();
    flash(n ? `${n} paquet${n > 1 ? "s" : ""} importé${n > 1 ? "s" : ""}` : "Rien à importer.");
    e.target.value = "";
  }
  function importShare() {
    const code = prompt("Colle le code de partage :");
    if (!code) return;
    const share = decodeDeckShare(code);
    if (!share) return flash("Code invalide.");
    deckFromShare(ctx.s, share);
    ctx.save();
    flash(`Paquet « ${share.name} » ajouté`);
  }
  function shareDeck(id: string) {
    const deck = ctx.s.decks[id];
    if (!deck) return;
    const code = encodeDeckShare(deck);
    navigator.clipboard?.writeText(code).then(
      () => flash("Code de partage copié"),
      () => flash("Copie impossible"),
    );
  }
  function setGoal(g: number) {
    // eslint-disable-next-line react-hooks/immutability
    ctx.s.settings.dailyGoal = g;
    ctx.save();
  }

  // Regroupement par matière (dossiers) + listes triées à plat.
  const groups: Record<string, Deck[]> = {};
  for (const d of decks) {
    const k = d.subject || "Autre";
    if (!groups[k]) groups[k] = [];
    groups[k].push(d);
  }
  for (const k in groups) {
    groups[k].sort((a, b) => (b.fav ? 1 : 0) - (a.fav ? 1 : 0) || b.updated - a.updated);
  }
  const groupedSubjects = Object.keys(groups).sort((a, b) => a.localeCompare(b, "fr"));
  const flatDecks = [...decks].sort((a, b) => {
    if (sort === "recent") return b.updated - a.updated;
    if (sort === "name") return (a.name || "").localeCompare(b.name || "", "fr");
    if (sort === "due") return dueCount(b) - dueCount(a) || b.updated - a.updated;
    return 0;
  });

  return (
    <div className="mx-auto max-w-xl px-4 pt-[calc(env(safe-area-inset-top,0px)+18px)]">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-semibold">Apprendre</h1>
        <button className="btn-ghost !py-1.5" onClick={openFocus}>
          <Timer size={16} aria-hidden /> Concentration
        </button>
      </div>

      {/* Tableau de bord */}
      <div className="card p-4 mb-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="icon-chip green">
              <GraduationCap size={22} strokeWidth={1.9} aria-hidden />
            </span>
            <div>
              <div className="font-semibold">Niveau {level}</div>
              <div className="text-sm text-ink-3">{xp} XP</div>
            </div>
          </div>
          <div className="flex items-center gap-4 text-sm">
            <span className="inline-flex items-center gap-1 text-amber">
              <Flame size={16} aria-hidden /> {ctx.s.stats.streak} j
            </span>
          </div>
        </div>
        <div className="mt-3 h-2 rounded-full bg-fill overflow-hidden">
          <div className="h-full rounded-full bg-[var(--green)]" style={{ width: `${Math.round(prog * 100)}%` }} />
        </div>
        <div className="mt-3 flex items-center justify-between text-sm">
          <span className="text-ink-2">Objectif du jour</span>
          <span className={today >= goal ? "text-green-ink font-semibold" : "text-ink-2"}>
            {today} / {goal}
            {today >= goal ? " ✓" : ""}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-2 mb-4">
        <button className="btn-primary" onClick={() => setView({ name: "create" })}>
          <Plus size={16} aria-hidden /> Nouveau paquet
        </button>
        <button className="btn-ghost !py-1.5 ml-auto" onClick={() => setOptions((o) => !o)}>
          <SlidersHorizontal size={15} aria-hidden /> Options
        </button>
      </div>

      {options && (
        <div className="card p-4 mb-5 flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm">Objectif quotidien</span>
            <select
              className="input max-w-32"
              value={goal}
              onChange={(e) => setGoal(Number(e.target.value))}
            >
              {[10, 20, 30, 50].map((g) => (
                <option key={g} value={g}>{g} cartes</option>
              ))}
            </select>
          </div>
          <div className="flex flex-wrap gap-2">
            <button className="btn-ghost !py-1.5" onClick={exportAll}>
              <Download size={15} aria-hidden /> Exporter
            </button>
            <button className="btn-ghost !py-1.5" onClick={() => fileRef.current?.click()}>
              <Upload size={15} aria-hidden /> Importer
            </button>
            <button className="btn-ghost !py-1.5" onClick={importShare}>
              <Share2 size={15} aria-hidden /> Importer un partage
            </button>
          </div>
          <input ref={fileRef} type="file" accept="application/json" hidden onChange={onImportFile} />
          <p className="text-xs text-ink-3">Tout est local à ce navigateur. Rien ne sort sauf export/partage.</p>
        </div>
      )}

      {decks.length === 0 ? (
        <div className="text-center py-14">
          <p className="text-xl font-semibold">Aucun paquet pour l’instant.</p>
          <p className="text-ink-2 mt-2">Crée ta première fiche à réviser.</p>
          <button className="btn-primary mt-6" onClick={() => setView({ name: "create" })}>
            <Plus size={16} aria-hidden /> Nouveau paquet
          </button>
        </div>
      ) : (
        <>
          <div className="flex items-center gap-2 mb-3 flex-wrap">
            <span className="text-sm text-ink-3">Trier</span>
            <select
              className="input max-w-56 !py-1.5"
              value={sort}
              onChange={(e) => changeSort(e.target.value as SortKey)}
              aria-label="Trier les paquets"
            >
              <option value="subject">Par matière (dossiers)</option>
              <option value="recent">Récents</option>
              <option value="name">Nom (A→Z)</option>
              <option value="due">À réviser d’abord</option>
            </select>
          </div>

          {sort === "subject" ? (
            <div className="flex flex-col gap-3.5">
              {groupedSubjects.map((sub) => {
                const arr = groups[sub];
                const dueSum = arr.reduce((n, d) => n + dueCount(d), 0);
                const tone = SUBJECT_TONE[sub] || "green";
                const col = `var(--${tone === "green" ? "green-ink" : tone})`;
                const collapsed = !!folded[sub];
                return (
                  <section key={sub} className="flex flex-col gap-2.5">
                    <button
                      onClick={() => toggleFold(sub)}
                      aria-expanded={!collapsed}
                      className="w-full flex items-center justify-between gap-2.5 rounded-2xl bg-fill px-4 py-3"
                    >
                      <span className="flex items-center gap-2.5 min-w-0">
                        <span className="w-3 h-3 rounded-full flex-none" style={{ background: col }} />
                        <span className="font-semibold truncate">{sub}</span>
                        <span className="text-sm text-ink-3 flex-none">
                          {arr.length} paquet{arr.length > 1 ? "s" : ""}
                        </span>
                      </span>
                      <span className="flex items-center gap-2.5 flex-none">
                        {dueSum > 0 && (
                          <span className="chip" style={{ color: "var(--green-ink)" }}>
                            {dueSum} à réviser
                          </span>
                        )}
                        {collapsed ? <ChevronDown size={18} aria-hidden /> : <ChevronUp size={18} aria-hidden />}
                      </span>
                    </button>
                    {!collapsed && (
                      <div className="flex flex-col gap-2.5">
                        {arr.map((d) => (
                          <DeckCard key={d.id} deck={d} ctx={ctx} setView={setView} onShare={shareDeck} />
                        ))}
                      </div>
                    )}
                  </section>
                );
              })}
            </div>
          ) : (
            <div className="flex flex-col gap-3 stagger">
              {flatDecks.map((d) => (
                <DeckCard key={d.id} deck={d} ctx={ctx} setView={setView} onShare={shareDeck} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
