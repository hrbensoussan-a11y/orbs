// Réglages : catalogue des catégories et recherche (lib/settings/catalog).
// Chaque entrée de la recherche doit pointer vers une VRAIE ligne de la page
// (ancre `reglage-<id>` présente dans le code des Réglages) : la recherche ne
// promet jamais un réglage qui n'existe pas.

import fs from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";
import {
  DEFAULT_CATEGORY,
  SETTINGS_CATEGORIES,
  SETTINGS_INDEX,
  normalizeSearch,
  searchSettings,
  settingAnchor,
  toCategoryId,
} from "@/lib/settings/catalog";

const ROOT = path.resolve(__dirname, "..");
const SOURCES = [
  "app/(app)/settings/page.tsx",
  "components/settings/AppearanceSettings.tsx",
  "components/settings/LearningSettings.tsx",
  "components/settings/AssistantSettings.tsx",
  "components/settings/LearningProfileSettings.tsx",
  "components/settings/AiHistorySettings.tsx",
  "components/agenda/NotificationSettings.tsx",
  "components/ai/AiOrbSettings.tsx",
  "components/ai/AiTagsSettings.tsx",
].map((f) => fs.readFileSync(path.join(ROOT, f), "utf8"));

describe("catégories des Réglages", () => {
  it("identifiants uniques, catégorie par défaut connue", () => {
    const ids = SETTINGS_CATEGORIES.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain(DEFAULT_CATEGORY);
  });

  it("aucune catégorie ne contient un seul réglage", () => {
    for (const c of SETTINGS_CATEGORIES) {
      expect(SETTINGS_INDEX.filter((e) => e.category === c.id).length, c.id).toBeGreaterThanOrEqual(2);
    }
  });

  it("toCategoryId n'accepte que les catégories connues", () => {
    expect(toCategoryId("agenda")).toBe("agenda");
    expect(toCategoryId("inconnue")).toBeNull();
    expect(toCategoryId(null)).toBeNull();
    expect(toCategoryId("__proto__")).toBeNull();
  });
});

describe("index de recherche", () => {
  it("chaque réglage recherchable correspond à une ligne réelle de la page", () => {
    for (const e of SETTINGS_INDEX) {
      const found = SOURCES.some((src) => src.includes(`id="${e.id}"`));
      expect(found, `ancre manquante pour « ${e.title} » (id="${e.id}")`).toBe(true);
    }
  });

  it("identifiants uniques", () => {
    const ids = SETTINGS_INDEX.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(settingAnchor("theme")).toBe("reglage-theme");
  });
});

describe("searchSettings", () => {
  const ids = (q: string) => searchSettings(q).map((e) => e.id);

  it("ignore les accents et la casse", () => {
    expect(normalizeSearch("Luminosité  ÉCRAN")).toBe("luminosite ecran");
    expect(ids("LUMINOSITE")).toContain("luminosite");
    expect(ids("thème")).toContain("theme");
  });

  it("trouve un réglage par un synonyme", () => {
    expect(ids("mode sombre")[0]).toBe("theme");
    expect(ids("pomodoro")).toEqual(["minuteur"]);
    expect(ids("mot de passe")).toContain("centre-compte");
    expect(ids("samedi")).toEqual(["devoirs-week-end", "jours-repos"]);
    expect(ids("repos")[0]).toBe("jours-repos");
    expect(ids("guide")).toEqual(["style-ia"]);
    expect(ids("demain")).toEqual(["preparer-demain"]);
    expect(ids("difficultés")).toContain("profil-classe");
    expect(ids("détaillé")).toEqual(["commandes"]);
  });

  it("tous les mots doivent correspondre ; le titre passe en premier", () => {
    expect(ids("volume pomodoro")).toEqual([]);
    expect(ids("volume sonnerie")[0]).toBe("volume");
    expect(ids("sonnerie")[0]).toBe("sonnerie");
    expect(ids("voix")[0]).toBe("voix");
  });

  it("compare des débuts de mots, pas des fragments", () => {
    expect(ids("son")).toContain("sonnerie");
    expect(ids("son")).not.toContain("export-journal"); // « json » ne compte pas
    expect(ids("week")).toEqual(["devoirs-week-end", "jours-repos"]);
  });

  it("recherche vide : aucun résultat ; résultats bornés", () => {
    expect(searchSettings("")).toEqual([]);
    expect(searchSettings("   ")).toEqual([]);
    expect(searchSettings("e", 5).length).toBeLessThanOrEqual(5);
  });
});
