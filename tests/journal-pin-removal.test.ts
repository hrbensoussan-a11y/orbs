// Groupe B — B1 : suppression du verrouillage PIN du journal.
//
// Il n'existait ni écran de PIN ni contrôle d'accès : seulement trois colonnes
// dormantes (Settings.pinLockEnabled, Settings.pinHash, Entry.locked). On
// vérifie :
//   - que la migration les retire SANS perdre une seule entrée (rejouée sur
//     une base vierge construite avec toutes les migrations du projet) ;
//   - que le journal reste accessible normalement (vraies routes) et
//     cloisonné entre comptes ;
//   - qu'aucune trace du verrou ne subsiste (API, export).

import fs from "node:fs";
import path from "node:path";
import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { NextRequest } from "next/server";
import { PrismaClient, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

const session = vi.hoisted(() => ({ user: null as null | { id: string } }));
vi.mock("@/lib/auth", () => ({ getCurrentUser: async () => session.user }));

import { GET as listEntries } from "@/app/api/entries/route";
import { GET as getEntry, PATCH as patchEntry } from "@/app/api/entries/[id]/route";
import { exportAccountData } from "@/lib/account";

const ROOT = path.resolve(__dirname, "..");
const created: string[] = [];

async function makeUser(): Promise<string> {
  const id = `test_b1_${crypto.randomUUID().replace(/-/g, "")}`.slice(0, 40);
  await prisma.user.create({ data: { id, email: `${id}@test.local`, passwordHash: "x" } });
  created.push(id);
  return id;
}
const ctx = (id: string) => ({ params: Promise.resolve({ id }) }) as never;

afterAll(async () => {
  await prisma.user.deleteMany({ where: { id: { in: created } } });
});
beforeEach(() => {
  session.user = null;
});

describe("schéma : plus aucune colonne du verrou PIN", () => {
  it("Settings et Entry n'ont plus pinLockEnabled, pinHash ni locked", () => {
    const fields = (model: string) =>
      Prisma.dmmf.datamodel.models.find((m) => m.name === model)?.fields.map((f) => f.name) ?? [];
    expect(fields("Settings")).not.toContain("pinLockEnabled");
    expect(fields("Settings")).not.toContain("pinHash");
    expect(fields("Entry")).not.toContain("locked");
    // Le journal lui-même est intact.
    expect(fields("Entry")).toEqual(expect.arrayContaining(["title", "content", "entryDate", "mood", "favorite", "pinned", "tags", "media"]));
  });

  it("la migration retire les colonnes sans perdre d'entrée (rejouée sur une base vierge)", async () => {
    const dir = path.join(ROOT, "tests/.tmp");
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `replay-${Date.now()}.db`);
    const db = new PrismaClient({ datasources: { db: { url: `file:${file}` } } });
    const run = async (sql: string) => {
      const statements = sql
        .split("\n")
        .filter((l) => !l.trim().startsWith("--"))
        .join("\n")
        .split(";")
        .map((s) => s.trim())
        .filter(Boolean);
      for (const s of statements) await db.$executeRawUnsafe(s);
    };
    try {
      const migrations = fs
        .readdirSync(path.join(ROOT, "prisma/migrations"))
        .filter((d) => /^\d+_/.test(d))
        .sort();
      const groupB = migrations.find((d) => d.endsWith("_groupe_b_reglages"));
      expect(groupB).toBeTruthy();
      // Toutes les migrations AVANT le Groupe B : l'ancien schéma, avec le verrou.
      for (const m of migrations.filter((d) => d < (groupB as string)))
        await run(fs.readFileSync(path.join(ROOT, "prisma/migrations", m, "migration.sql"), "utf8"));
      await db.$executeRawUnsafe(`INSERT INTO "User" (id,email,"passwordHash","createdAt","updatedAt") VALUES ('u1','u1@test.local','x',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`);
      await db.$executeRawUnsafe(`INSERT INTO "Settings" (id,"userId","fontSize","pinLockEnabled","pinHash","updatedAt") VALUES ('s1','u1','lg',1,'hash',CURRENT_TIMESTAMP)`);
      for (let i = 1; i <= 4; i++)
        await db.$executeRawUnsafe(
          `INSERT INTO "Entry" (id,"userId",title,content,mood,favorite,locked,"entryDate","createdAt","updatedAt") VALUES ('e${i}','u1','Page ${i}','Texte ${i} : é à ü',${i},${i % 2},${i === 3 ? 1 : 0},CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`,
        );
      const before = await db.$queryRawUnsafe(`SELECT id,title,content,mood,favorite FROM "Entry" ORDER BY id`);

      await run(fs.readFileSync(path.join(ROOT, "prisma/migrations", groupB as string, "migration.sql"), "utf8"));

      const after = await db.$queryRawUnsafe(`SELECT id,title,content,mood,favorite FROM "Entry" ORDER BY id`);
      expect(after).toEqual(before);
      expect((after as unknown[]).length).toBe(4);
      const settings = (await db.$queryRawUnsafe(`SELECT * FROM "Settings"`)) as Record<string, unknown>[];
      expect(settings[0].fontSize).toBe("lg");
      expect(settings[0]).not.toHaveProperty("pinHash");
      expect(settings[0]).not.toHaveProperty("pinLockEnabled");
      expect(settings[0].aiRetention).toBe("keep");
      expect(settings[0].lineSpacing).toBe("normal");
      const entryCols = (await db.$queryRawUnsafe(`SELECT name FROM pragma_table_info('Entry')`)) as { name: string }[];
      expect(entryCols.map((c) => c.name)).not.toContain("locked");
    } finally {
      await db.$disconnect();
      for (const f of [file, `${file}-journal`]) fs.rmSync(f, { force: true });
    }
  });
});

describe("le journal reste accessible normalement", () => {
  it("liste et lecture d'une page par son auteur, sans écran de déverrouillage", async () => {
    const a = await makeUser();
    const entry = await prisma.entry.create({ data: { userId: a, title: "Lundi", content: "J'ai bien travaillé." } });
    session.user = { id: a };
    const list = await listEntries(new NextRequest("http://localhost/api/entries"));
    expect(list.status).toBe(200);
    const items = (await list.json()) as { id: string }[];
    expect(items.map((e) => e.id)).toContain(entry.id);
    const one = await getEntry(new NextRequest(`http://localhost/api/entries/${entry.id}`), ctx(entry.id));
    expect(one.status).toBe(200);
    const body = (await one.json()) as Record<string, unknown>;
    expect(body.content).toBe("J'ai bien travaillé.");
    expect(body).not.toHaveProperty("locked");
  });

  it("un ancien champ « locked » envoyé par un client est simplement ignoré", async () => {
    const a = await makeUser();
    const entry = await prisma.entry.create({ data: { userId: a, content: "Avant" } });
    session.user = { id: a };
    const res = await patchEntry(
      new NextRequest(`http://localhost/api/entries/${entry.id}`, {
        method: "PATCH",
        body: JSON.stringify({ locked: true, content: "Après" }),
        headers: { "content-type": "application/json" },
      }),
      ctx(entry.id),
    );
    expect(res.status).toBe(200);
    expect((await prisma.entry.findUnique({ where: { id: entry.id } }))?.content).toBe("Après");
  });

  it("toujours cloisonné : un autre compte ne lit ni ne modifie la page", async () => {
    const a = await makeUser();
    const b = await makeUser();
    const entry = await prisma.entry.create({ data: { userId: a, content: "Privé" } });
    session.user = { id: b };
    const one = await getEntry(new NextRequest(`http://localhost/api/entries/${entry.id}`), ctx(entry.id));
    expect(one.status).toBe(404);
    const list = (await (await listEntries(new NextRequest("http://localhost/api/entries"))).json()) as { id: string }[];
    expect(list.map((e) => e.id)).not.toContain(entry.id);
    session.user = null;
    expect((await listEntries(new NextRequest("http://localhost/api/entries"))).status).toBe(401);
  });

  it("l'archive « Mes données » contient les pages, sans aucune trace du verrou", async () => {
    const a = await makeUser();
    await prisma.entry.create({ data: { userId: a, title: "Mardi", content: "Exposé fini." } });
    const data = await exportAccountData(a);
    expect(data.journal.entrees).toHaveLength(1);
    const blob = JSON.stringify(data);
    expect(blob).toContain("Exposé fini.");
    expect(blob).not.toMatch(/verrouille|"locked"|pinHash|pinLock|code PIN/);
  });
});
