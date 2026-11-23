"use client";

// Réglages des commandes « # » de l'assistant IA.
// - Choisir le déclencheur : #, / ou ;.
// - Voir tous les tags disponibles, groupés par catégorie.
// - Mettre un tag en favori (★) : les favoris ressortent en priorité dans
//   les suggestions du chat.
// Tout est stocké en localStorage et appliqué en direct (évènement "orbs:aitags").

import { useEffect, useMemo, useState } from "react";
import { Search, Star, ChevronDown, ChevronUp } from "lucide-react";
import {
  AI_TAGS,
  TAG_CATEGORIES,
  TRIGGERS,
  type Trigger,
  normalizeTag,
  loadTagPrefs,
  saveTagPrefs,
} from "@/lib/ai/tags";
import { Segmented, SettingRow, SettingsGroup } from "@/components/settings/controls";

export function AiTagsSettings() {
  const [trigger, setTrigger] = useState<Trigger>("#");
  const [favorites, setFavorites] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [showAll, setShowAll] = useState(false);

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
          normalizeTag(t.desc).includes(q) ||
          normalizeTag(t.category).includes(q),
      ),
    [q],
  );

  return (
    <SettingsGroup
      title="Commandes"
      footer={
        <>
          Dans le chat, tape <strong className="text-ink">{trigger}</strong> pour donner un contexte
          ou un mode à l’assistant (par ex. {trigger}réviser, {trigger}agenda). {trigger}court et{" "}
          {trigger}détaillé règlent la longueur d’une seule réponse.
        </>
      }
    >
      <SettingRow
        id="commandes"
        title="Symbole de commande"
        desc="Ce que tu tapes dans le chat pour ouvrir les commandes."
      >
        <Segmented
          value={trigger}
          options={TRIGGERS.map((t) => ({ value: t, label: <span className="font-semibold text-base px-1">{t}</span> }))}
          onChange={changeTrigger}
          label="Symbole de commande"
        />
      </SettingRow>

      <SettingRow
        title={`Toutes les commandes (${AI_TAGS.length})`}
        desc={
          favorites.length > 0
            ? `${favorites.length} en favori${favorites.length > 1 ? "s" : ""} : proposée${favorites.length > 1 ? "s" : ""} en premier.`
            : "Mets tes préférées en favori : elles seront proposées en premier."
        }
      >
        <button type="button" onClick={() => setShowAll((v) => !v)} aria-expanded={showAll} className="btn-ghost">
          {showAll ? "Masquer" : "Afficher"}
          {showAll ? <ChevronUp size={15} aria-hidden /> : <ChevronDown size={15} aria-hidden />}
        </button>
      </SettingRow>

      {showAll && (
        <div className="st-row">
          <div className="relative mb-3">
            <Search size={16} aria-hidden className="st-search-icon" />
            <input
              className="st-search-input !h-10"
              placeholder="Chercher une commande…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Chercher une commande"
            />
          </div>

          {TAG_CATEGORIES.map((cat) => {
            const items = filtered.filter((t) => t.category === cat);
            if (!items.length) return null;
            return (
              <div key={cat} className="mt-3 first:mt-0">
                <h4 className="st-group-title !ml-0 !mb-1">{cat}</h4>
                <div className="flex flex-col">
                  {items.map((t) => {
                    const fav = favorites.includes(t.id);
                    return (
                      <div key={t.id} className="flex items-start gap-2.5 py-2 [&+&]:border-t" style={{ borderColor: "var(--st-hair)" }}>
                        <span className="text-lg leading-6" aria-hidden>{t.emoji}</span>
                        <div className="min-w-0 flex-1">
                          <p className="font-medium">
                            <span style={{ color: "var(--st-desc)" }}>{trigger}</span>{t.id}
                          </p>
                          <p className="text-xs" style={{ color: "var(--st-desc)" }}>{t.desc}</p>
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
          {filtered.length === 0 && <p className="text-sm text-center py-3" style={{ color: "var(--st-desc)" }}>Aucune commande trouvée.</p>}
        </div>
      )}
    </SettingsGroup>
  );
}
