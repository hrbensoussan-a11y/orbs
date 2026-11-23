"use client";

// Coque des Réglages : navigation intérieure, recherche, catégorie affichée.
//
// Ordinateur (≥ 1024 px) : menu latéral propre aux Réglages + catégorie
// ouverte à droite. Mobile et tablette : liste de catégories façon iOS, puis
// la catégorie en plein écran avec un retour « Réglages ».
//
// La catégorie ouverte vit dans l'URL (`/settings?c=agenda`) : le bouton
// Retour du téléphone ramène à la liste, et un lien peut ouvrir directement
// une catégorie. Toutes les catégories restent montées (masquées quand elles
// ne sont pas affichées) : chacune garde son état et la recherche peut
// atteindre n'importe quelle ligne.

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  Bell,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  GraduationCap,
  Palette,
  Search,
  Sparkles,
  UserRound,
  X,
} from "lucide-react";
import {
  DEFAULT_CATEGORY,
  SETTINGS_CATEGORIES,
  categoryById,
  searchSettings,
  settingAnchor,
  toCategoryId,
  type SettingEntry,
  type SettingsCategoryId,
} from "@/lib/settings/catalog";

const ICONS: Record<SettingsCategoryId, (size: number) => ReactNode> = {
  apparence: (s) => <Palette size={s} aria-hidden />,
  notifications: (s) => <Bell size={s} aria-hidden />,
  agenda: (s) => <CalendarDays size={s} aria-hidden />,
  apprentissage: (s) => <GraduationCap size={s} aria-hidden />,
  assistant: (s) => <Sparkles size={s} aria-hidden />,
  compte: (s) => <UserRound size={s} aria-hidden />,
};

function prefersReducedMotion(): boolean {
  try {
    return (
      document.documentElement.getAttribute("data-motion") === "reduced" ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    );
  } catch {
    return false;
  }
}

export function SettingsShell({
  sections,
  account,
}: {
  sections: Record<SettingsCategoryId, ReactNode>;
  /** Résumé du compte pour l'en-tête de la liste mobile. */
  account: { name: string; email: string; avatar: ReactNode };
}) {
  const params = useSearchParams();
  const open = toCategoryId(params.get("c"));
  // Sur ordinateur, sans catégorie choisie, la première est affichée.
  const shown: SettingsCategoryId = open ?? DEFAULT_CATEGORY;

  const [query, setQuery] = useState("");
  const results = useMemo(() => searchSettings(query), [query]);
  const searching = query.trim().length > 0;
  const searchRef = useRef<HTMLInputElement>(null);
  // Résultat mis en avant au clavier (↑ ↓ puis Entrée).
  const [activeIdx, setActiveIdx] = useState(0);
  // Raccourci affiché dans le champ de recherche (ordinateur), selon le système.
  const [kbd, setKbd] = useState<string | null>(null);
  // Grand écran : champ étroit (menu latéral) → libellé court, raccourci affiché.
  const [wide, setWide] = useState(false);
  // Mobile : le grand titre de la catégorie est sorti de l'écran → la barre de
  // retour devient une barre de verre portant le nom de la catégorie.
  const [stuck, setStuck] = useState(false);
  const catHeadRef = useRef<HTMLElement>(null);

  function changeQuery(q: string) {
    setQuery(q);
    setActiveIdx(0);
  }

  // Vrai quand la catégorie a été ouverte depuis la liste de CETTE page : le
  // retour peut alors simplement revenir en arrière dans l'historique. Après
  // un lien direct (`/settings?c=agenda`), on revient à la liste sans quitter
  // les Réglages.
  const openedHere = useRef(false);

  function go(id: SettingsCategoryId | null) {
    const url = id ? `/settings?c=${id}` : "/settings";
    window.history.pushState(null, "", url);
    openedHere.current = id !== null;
    window.scrollTo({ top: 0 });
  }

  function back() {
    if (openedHere.current) {
      openedHere.current = false;
      window.history.back();
    } else {
      window.history.replaceState(null, "", "/settings");
    }
    window.scrollTo({ top: 0 });
  }

  function reveal(entry: SettingEntry) {
    changeQuery("");
    window.history.pushState(null, "", `/settings?c=${entry.category}`);
    openedHere.current = true;
    // Après l'affichage de la catégorie : défilement + mise en évidence.
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        const el = document.getElementById(settingAnchor(entry.id));
        if (!el) return;
        el.scrollIntoView({ block: "center", behavior: prefersReducedMotion() ? "auto" : "smooth" });
        el.classList.remove("st-flash");
        void el.offsetWidth; // relance l'animation si on revient sur la même ligne
        el.classList.add("st-flash");
        window.setTimeout(() => el.classList.remove("st-flash"), 1900);
      }),
    );
  }

  // « / » ou Ctrl/Cmd+K : rechercher un réglage (ordinateur).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing = target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);
      if ((e.key === "k" && (e.metaKey || e.ctrlKey)) || (e.key === "/" && !typing)) {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    try {
      const mac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setKbd(mac ? "⌘ K" : "Ctrl K");
      const mq = window.matchMedia("(min-width: 1100px)");
      const sync = () => setWide(mq.matches);
      sync();
      mq.addEventListener("change", sync);
      return () => mq.removeEventListener("change", sync);
    } catch {
      /* pas d'indication */
    }
  }, []);

  // Grand titre visible ou non (mobile, catégorie ouverte).
  useEffect(() => {
    const el = catHeadRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([e]) => setStuck(!e.isIntersecting), {
      rootMargin: "-56px 0px 0px 0px",
    });
    io.observe(el);
    return () => io.disconnect();
  }, [shown]);

  const category = categoryById(shown);
  const activeResult = results[Math.min(activeIdx, results.length - 1)];

  return (
    <div className="st-shell" data-view={open ? "detail" : "list"} data-stuck={open && stuck ? "true" : undefined}>
      {/* ---------------- Navigation intérieure ---------------- */}
      <aside className="st-aside" aria-label="Catégories des réglages">
        <header className="st-page-head">
          <Link href="/accueil" className="btn-ghost !px-2.5 st-home-back" aria-label="Retour à l’accueil">
            <ArrowLeft size={18} aria-hidden />
          </Link>
          <div>
            <h1 className="st-page-title">Réglages</h1>
            <p className="st-page-sub">Fais d’Orbs ton espace.</p>
          </div>
        </header>

        <div className="st-search">
          <Search size={16} aria-hidden className="st-search-icon" />
          <input
            ref={searchRef}
            type="search"
            className="st-search-input"
            placeholder={wide ? "Rechercher" : "Rechercher un réglage"}
            value={query}
            onChange={(e) => changeQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") changeQuery("");
              else if (e.key === "ArrowDown" && results.length) {
                e.preventDefault();
                setActiveIdx((i) => (i + 1) % results.length);
              } else if (e.key === "ArrowUp" && results.length) {
                e.preventDefault();
                setActiveIdx((i) => (i - 1 + results.length) % results.length);
              } else if (e.key === "Enter" && activeResult) reveal(activeResult);
            }}
            role="combobox"
            aria-expanded={searching}
            aria-label="Rechercher un réglage"
            aria-controls="st-search-results"
            aria-activedescendant={searching && activeResult ? `st-res-${activeResult.id}` : undefined}
            autoComplete="off"
          />
          {kbd && (
            <kbd className="st-kbd" aria-hidden>
              {kbd}
            </kbd>
          )}
          {searching && (
            <button type="button" className="st-search-clear" onClick={() => changeQuery("")} aria-label="Effacer la recherche">
              <X size={14} aria-hidden />
            </button>
          )}
        </div>

        {searching ? (
          <div id="st-search-results" className="st-results" role="listbox" aria-label="Réglages trouvés">
            {results.length === 0 ? (
              <p className="st-results-empty" role="status">
                Aucun réglage ne correspond à « {query.trim()} ».
                <span className="st-results-hint">Essaie un autre mot, par exemple « thème » ou « rappel ».</span>
              </p>
            ) : (
              results.map((r) => {
                const cat = categoryById(r.category);
                const active = r === activeResult;
                return (
                  <button
                    key={r.id}
                    id={`st-res-${r.id}`}
                    type="button"
                    role="option"
                    aria-selected={active}
                    className={`st-result${active ? " is-active" : ""}`}
                    onClick={() => reveal(r)}
                    onMouseEnter={() => setActiveIdx(results.indexOf(r))}
                  >
                    <span className={`st-chip st-chip--${cat.tone}`} aria-hidden>
                      {ICONS[cat.id](16)}
                    </span>
                    <span className="min-w-0 flex-1 text-left">
                      <span className="st-result-title">{r.title}</span>
                      <span className="st-result-cat">{cat.label}</span>
                    </span>
                    <ChevronRight size={16} aria-hidden className="st-chevron" />
                  </button>
                );
              })
            )}
          </div>
        ) : (
          <>
            {/* Résumé du compte (liste mobile uniquement) */}
            <button type="button" className="st-account" onClick={() => go("compte")}>
              <span className="st-account-avatar" aria-hidden>
                {account.avatar}
              </span>
              <span className="min-w-0 flex-1 text-left">
                <span className="st-account-name">{account.name}</span>
                <span className="st-account-mail">{account.email}</span>
              </span>
              <ChevronRight size={18} aria-hidden className="st-chevron" />
            </button>

            <nav className="st-nav">
              {SETTINGS_CATEGORIES.map((c) => {
                const active = c.id === shown;
                return (
                  <button
                    key={c.id}
                    type="button"
                    className={`st-nav-item${active ? " is-active" : ""}`}
                    aria-current={active ? "page" : undefined}
                    onClick={() => go(c.id)}
                  >
                    <span className={`st-chip st-chip--${c.tone}`} aria-hidden>
                      {ICONS[c.id](17)}
                    </span>
                    <span className="min-w-0 flex-1 text-left">
                      <span className="st-nav-label">{c.label}</span>
                      <span className="st-nav-desc">{c.desc}</span>
                    </span>
                    <ChevronRight size={17} aria-hidden className="st-chevron" />
                  </button>
                );
              })}
            </nav>
          </>
        )}
      </aside>

      {/* ---------------- Catégorie ouverte ---------------- */}
      <div className="st-main">
        <div className="st-detail-bar">
          <button type="button" className="st-back" onClick={back}>
            <ChevronLeft size={21} aria-hidden /> Réglages
          </button>
          <span className="st-bar-title" aria-hidden>
            {category.label}
          </span>
        </div>
        <header className="st-cat-head" ref={catHeadRef}>
          <span className={`st-chip st-chip--lg st-chip--${category.tone}`} aria-hidden>
            {ICONS[category.id](22)}
          </span>
          <div className="min-w-0">
            <h2 className="st-cat-title">{category.label}</h2>
            <p className="st-cat-desc">{category.desc}</p>
          </div>
        </header>

        {SETTINGS_CATEGORIES.map((c) => (
          <div key={c.id} hidden={c.id !== shown} className="st-panel">
            {sections[c.id]}
          </div>
        ))}
      </div>
    </div>
  );
}
