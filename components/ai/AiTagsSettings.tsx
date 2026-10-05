"use client";

// Réglages des commandes « # » de l'assistant IA.
// - Choisir le déclencheur : #, / ou ;.
// - Voir tous les tags disponibles, groupés par catégorie.
// - Mettre un tag en favori (★) : les favoris ressortent en priorité dans
//   les suggestions du chat.
// Tout est stocké en localStorage et appliqué en direct (évènement "orbs:aitags").

import { useEffect, useMemo, useState } from "react";
import { Search, Star } from "lucide-react";
import {
  AI_TAGS,
  TAG_CATEGORIES,
  TRIGGERS,
  type Trigger,
  normalizeTag,
  loadTagPrefs,
  saveTagPrefs,
} from "@/lib/ai/tags";

export function AiTagsSettings() {
  const [trigger, setTrigger] = useState<Trigger>("#");
  const [favorites, setFavorites] = useState<string[]>([]);
  const [query, setQuery] = useState("");

  useEffect(() => {
    const p = loadTagPrefs();
    /* eslint-disable react-hooks/set-state-in-effect */
    setTrigger(p.trigger);
    setFavorites(p.favorites);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  function changeTrigger(t: Trigger) {
    setTrigger(t);
    saveTagPrefs({ trigger: t, favorites });
  }
  function toggleFav(id: string) {
    const next = favorites.includes(id) ? favorites.filter((f) => f !== id) : [...favorites, id];
    setFavorites(next);
    saveTagPrefs({ trigger, favorites: next });
  }

  const q = normalizeTag(query);
  const filtered = useMemo(
    () =>
      AI_TAGS.filter(
        (t) =>
          !q ||
          normalizeTag(t.id).includes(q) ||
          normalizeTag(t.label).includes(q) ||
          normalizeTag(t.desc).includes(q),
      ),
    [q],
  );

  return (
    <div className="flex flex-col gap-4">
      {/* Déclencheur */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <p>Symbole de commande</p>
          <p className="text-sm text-ink-2">Tape ce symbole dans le chat pour ouvrir les commandes.</p>
        </div>
        <div className="flex gap-1.5" role="group" aria-label="Symbole de commande">
          {TRIGGERS.map((t) => (
            <button
              key={t}
              type="button"
              aria-pressed={trigger === t}
              onClick={() => changeTrigger(t)}
              className="h-10 w-10 rounded-xl font-semibold text-lg"
              style={
                trigger === t
                  ? { background: "color-mix(in srgb, var(--green) 16%, transparent)", color: "var(--green-ink)", boxShadow: "inset 0 0 0 1px var(--green)" }
                  : { background: "var(--fill-2)", color: "var(--ink-2)" }
              }
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* Recherche */}
      <div className="border-t border-line pt-4">
        <div className="relative">
          <Search size={16} aria-hidden className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-3" />
          <input
            className="input !pl-9"
            placeholder="Chercher une commande…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Chercher une commande"
          />
        </div>
        <p className="text-xs text-ink-3 mt-2">
          ★ Mets une commande en favori : elle sera proposée en premier. {favorites.length > 0 && `(${favorites.length} favori${favorites.length > 1 ? "s" : ""})`}
        </p>
      </div>

      {/* Liste groupée par catégorie */}
      {TAG_CATEGORIES.map((cat) => {
        const items = filtered.filter((t) => t.category === cat);
        if (!items.length) return null;
        return (
          <div key={cat}>
            <h3 className="text-sm font-semibold text-ink-2 mb-1.5">{cat}</h3>
            <div className="flex flex-col">
              {items.map((t) => {
                const fav = favorites.includes(t.id);
                return (
                  <div key={t.id} className="flex items-start gap-2.5 py-2 border-t border-line first:border-t-0">
                    <span className="text-lg leading-6" aria-hidden>{t.emoji}</span>
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">
                        <span className="text-ink-3">{trigger}</span>{t.id}
                      </p>
                      <p className="text-xs text-ink-3">{t.desc}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => toggleFav(t.id)}
                      aria-pressed={fav}
                      aria-label={fav ? `Retirer ${t.label} des favoris` : `Mettre ${t.label} en favori`}
                      className="flex-none p-1.5 rounded-lg"
                      style={{ color: fav ? "var(--amber)" : "var(--ink-3)" }}
                    >
                      <Star size={18} fill={fav ? "currentColor" : "none"} aria-hidden />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
