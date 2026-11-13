import { describe, it, expect } from "vitest";
import {
  AI_TAGS,
  TAG_CATEGORIES,
  TAG_BY_ID,
  extractTags,
  matchTags,
  normalizeTag,
} from "@/lib/ai/tags";
import { buildSystemPrompt } from "@/lib/ai/persona";

// Tests des 35 commandes « # » de l'assistant IA.
// On teste la DÉTECTION (extractTags), la SUGGESTION (matchTags) et le
// DÉCLENCHEMENT du comportement (buildSystemPrompt injecte la consigne du tag
// dans le prompt système envoyé au modèle). L'appel au modèle lui-même n'est
// pas testé ici : il dépend d'une clé API externe et consomme des crédits.

describe("Catalogue des commandes", () => {
  it("contient exactement 35 commandes", () => {
    expect(AI_TAGS.length).toBe(35);
  });

  it("chaque commande a un id unique, un libellé, un emoji, une catégorie valide et une description", () => {
    const ids = new Set<string>();
    for (const t of AI_TAGS) {
      expect(t.id, "id non vide").toBeTruthy();
      expect(ids.has(t.id), `id dupliqué: ${t.id}`).toBe(false);
      ids.add(t.id);
      expect(t.label.trim().length, `label de ${t.id}`).toBeGreaterThan(0);
      expect(t.emoji.trim().length, `emoji de ${t.id}`).toBeGreaterThan(0);
      expect(t.desc.trim().length, `desc de ${t.id}`).toBeGreaterThan(10);
      expect(TAG_CATEGORIES, `catégorie de ${t.id}`).toContain(t.category);
    }
    expect(ids.size).toBe(35);
  });

  it("TAG_BY_ID retrouve chaque commande", () => {
    for (const t of AI_TAGS) expect(TAG_BY_ID.get(t.id)).toBe(t);
  });
});

describe("Détection : symbole + commande", () => {
  for (const t of AI_TAGS) {
    it(`#${t.id} est détecté dans un message`, () => {
      expect(extractTags(`#${t.id} peux-tu m'aider ?`, "#")).toContain(t.id);
    });
  }

  it("fonctionne avec les trois déclencheurs (#, /, ;)", () => {
    expect(extractTags("/agenda", "/")).toEqual(["agenda"]);
    expect(extractTags(";agenda", ";")).toEqual(["agenda"]);
    expect(extractTags("#agenda", "#")).toEqual(["agenda"]);
  });

  it("ignore les accents (#réviser → reviser)", () => {
    expect(extractTags("#réviser mes maths", "#")).toContain("reviser");
  });

  it("détecte plusieurs commandes et déduplique", () => {
    expect(extractTags("#agenda puis #devoirs et encore #agenda", "#")).toEqual([
      "agenda",
      "devoirs",
    ]);
  });
});

describe("Déclenchement réel du comportement (prompt système)", () => {
  const profile = { firstName: "Alex", schoolClass: "3e" };
  for (const t of AI_TAGS) {
    it(`#${t.id} injecte sa consigne dans le prompt`, () => {
      const prompt = buildSystemPrompt(profile, undefined, [t.id]);
      expect(prompt).toContain("Modes activés par l'élève");
      expect(prompt).toContain(`#${t.id} : ${t.desc}`);
    });
  }

  it("déduplique une commande répétée dans le prompt", () => {
    const prompt = buildSystemPrompt({}, undefined, ["agenda", "agenda"]);
    const occurrences = prompt.split("#agenda :").length - 1;
    expect(occurrences).toBe(1);
  });

  it("n'injecte aucune section de modes sans commande", () => {
    const prompt = buildSystemPrompt({ firstName: "Alex" }, undefined, []);
    expect(prompt).not.toContain("Modes activés par l'élève");
  });
});

describe("Suggestion (autocomplétion)", () => {
  it("propose la commande à partir de son id complet", () => {
    const res = matchTags("agenda", [], 6).map((t) => t.id);
    expect(res).toContain("agenda");
  });

  it("propose à partir d'un préfixe partiel", () => {
    const res = matchTags("agen", [], 6).map((t) => t.id);
    expect(res).toContain("agenda");
  });

  it("fait remonter les favoris en premier", () => {
    const res = matchTags("", ["orbs"], 6).map((t) => t.id);
    expect(res[0]).toBe("orbs");
  });
});

describe("Commande inconnue ou mal formulée", () => {
  it("une commande inconnue n'est pas détectée", () => {
    expect(extractTags("#inconnuxyz fais ceci", "#")).toEqual([]);
    expect(matchTags("zzzzzz", [], 6)).toEqual([]);
  });

  it("un déclencheur seul ou suivi d'un espace n'active rien", () => {
    expect(extractTags("#", "#")).toEqual([]);
    expect(extractTags("# agenda", "#")).toEqual([]);
  });

  it("le mauvais déclencheur n'active rien", () => {
    expect(extractTags("/agenda", "#")).toEqual([]);
    expect(extractTags("agenda sans symbole", "#")).toEqual([]);
  });

  it("une commande inconnue passée au prompt est simplement ignorée", () => {
    const prompt = buildSystemPrompt({}, undefined, ["inconnuxyz"]);
    expect(prompt).not.toContain("Modes activés par l'élève");
  });

  it("normalizeTag met en minuscule et retire les accents", () => {
    expect(normalizeTag("Réviser")).toBe("reviser");
    expect(normalizeTag("ORBS")).toBe("orbs");
  });
});
