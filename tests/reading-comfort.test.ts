// Groupe B — B4 : confort de lecture (taille du texte + espacement).
//
// Les préférences sont enregistrées sur le compte (Settings) et appliquées
// par le layout sous forme de variables CSS, utilisées SEULEMENT par les
// zones de lecture (.reading, .writing-surface).

import fs from "node:fs";
import path from "node:path";
import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { prisma } from "@/lib/prisma";

const ctx = vi.hoisted(() => ({ user: null as null | { id: string } }));
vi.mock("@/lib/auth", () => ({
  requireUser: async () => {
    if (!ctx.user) throw new Error("NEXT_REDIRECT");
    return ctx.user;
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

import { setLineSpacing, setReadingSize } from "@/app/actions/settings";
import { readingStyle, toLineSpacing } from "@/lib/reading";

const created: string[] = [];
async function makeUser() {
  const id = `test_b4_${crypto.randomUUID().replace(/-/g, "")}`.slice(0, 40);
  await prisma.user.create({ data: { id, email: `${id}@test.local`, passwordHash: "x" } });
  created.push(id);
  return id;
}
afterAll(async () => {
  await prisma.user.deleteMany({ where: { id: { in: created } } });
});
beforeEach(() => {
  ctx.user = null;
});

describe("variables de lecture", () => {
  it("par défaut : seule la taille, l'interligne d'origine est conservé", () => {
    expect(readingStyle(undefined, undefined)).toEqual({ "--reading-size": "1.0625rem" });
    expect(readingStyle("base", "normal")).toEqual({ "--reading-size": "1.0625rem" });
  });
  it("taille et espacement choisis", () => {
    expect(readingStyle("lg", "large")).toEqual({ "--reading-size": "1.2rem", "--reading-leading": "2", "--reading-gap": "1.3em" });
    expect(readingStyle("sm", "compact")).toEqual({ "--reading-size": "0.95rem", "--reading-leading": "1.5", "--reading-gap": "0.75em" });
  });
  it("valeur inconnue ou altérée : comportement normal", () => {
    expect(readingStyle("xxl", "énorme")).toEqual({ "--reading-size": "1.0625rem" });
    expect(toLineSpacing(undefined)).toBe("normal");
  });
  it("seules les zones de lecture utilisent ces variables (pas les boutons ni les menus)", () => {
    const css = fs.readFileSync(path.resolve(__dirname, "../app/globals.css"), "utf8");
    const users = css.split("\n").filter((l) => /var\(--reading-(leading|gap|size)/.test(l));
    expect(users.length).toBeGreaterThanOrEqual(4);
    // Chaque usage est dans un bloc .reading ou .writing-surface.
    const blocks = css.match(/[^{}]+\{[^{}]*var\(--reading-(?:leading|gap|size)[^{}]*\}/g) ?? [];
    for (const b of blocks) expect(b.split("{")[0]).toMatch(/\.reading|\.writing-surface/);
    // Valeurs d'origine en repli : affichage inchangé sans réglage.
    expect(css).toContain("line-height: var(--reading-leading, 1.75)");
    expect(css).toContain("line-height: var(--reading-leading, 1.7)");
    expect(css).toContain("margin-top: var(--reading-gap, 1em)");
  });
});

describe("enregistrement sur le compte (actions serveur)", () => {
  it("espacement enregistré, relu au retour, valeur inconnue refusée", async () => {
    const a = await makeUser();
    ctx.user = { id: a };
    expect(await setLineSpacing("large")).toEqual({ ok: true });
    expect((await prisma.settings.findUnique({ where: { userId: a } }))?.lineSpacing).toBe("large");
    expect(await setLineSpacing("géant")).toEqual({ ok: false, error: "Espacement inconnu." });
    expect((await prisma.settings.findUnique({ where: { userId: a } }))?.lineSpacing).toBe("large");
  });

  it("la taille existante fonctionne toujours, sans toucher à l'espacement", async () => {
    const a = await makeUser();
    ctx.user = { id: a };
    await setLineSpacing("compact");
    expect(await setReadingSize("lg")).toEqual({ ok: true });
    const s = await prisma.settings.findUnique({ where: { userId: a } });
    expect(s?.fontSize).toBe("lg");
    expect(s?.lineSpacing).toBe("compact");
    expect(readingStyle(s?.fontSize, s?.lineSpacing)).toMatchObject({ "--reading-size": "1.2rem", "--reading-leading": "1.5" });
  });

  it("chaque compte garde ses préférences ; sans session, rien n'est écrit", async () => {
    const a = await makeUser();
    const b = await makeUser();
    ctx.user = { id: a };
    await setLineSpacing("large");
    ctx.user = { id: b };
    await setLineSpacing("compact");
    expect((await prisma.settings.findUnique({ where: { userId: a } }))?.lineSpacing).toBe("large");
    ctx.user = null;
    await expect(setLineSpacing("normal")).rejects.toThrow();
  });

  it("préférence non renseignée : « normal »", async () => {
    const a = await makeUser();
    const s = await prisma.settings.create({ data: { userId: a } });
    expect(s.lineSpacing).toBe("normal");
  });
});
