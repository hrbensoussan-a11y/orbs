// Groupe B — B5 : conservation des conversations avec l'assistant.
//
// Les conversations vivent dans l'espace local du compte (lib/ai/history) ;
// le serveur ne les stocke ni ne les journalise. On vérifie :
//   - l'historique existant est préservé à la mise à jour (aucune suppression
//     du seul fait du nouveau réglage) ;
//   - « 30 jours » : suppression d'après la DERNIÈRE ACTIVITÉ ;
//   - « ne pas conserver » : rien de nouveau n'est enregistré, l'existant
//     n'est pas effacé en silence, seules les suppressions sont écrites ;
//   - « Supprimer l'historique » : appliqué une fois par appareil, sans
//     toucher aux discussions créées ensuite ni aux autres comptes ;
//   - actions serveur validées et cloisonnées ; la route de chat n'enregistre
//     ni ne journalise le contenu des messages.

import { describe, it, expect, beforeEach, afterEach, afterAll, vi } from "vitest";
import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

const ctx = vi.hoisted(() => ({ user: null as null | Record<string, unknown> }));
vi.mock("@/lib/auth", () => ({
  getCurrentUser: async () => ctx.user,
  requireUser: async () => {
    if (!ctx.user) throw new Error("NEXT_REDIRECT");
    return ctx.user;
  },
}));
const revalidated = vi.hoisted(() => [] as string[]);
vi.mock("next/cache", () => ({ revalidatePath: (p: string, t?: string) => void revalidated.push(`${p}|${t ?? ""}`) }));
vi.mock("@/lib/ai/config", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/ai/config")>();
  return { ...actual, aiConfigured: () => true };
});
vi.mock("@/lib/ai/openai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/ai/openai")>();
  return {
    ...actual,
    streamChatCompletion: async () =>
      new ReadableStream({
        start(c) {
          c.enqueue(new TextEncoder().encode("Réponse"));
          c.close();
        },
      }),
  };
});
vi.mock("@/lib/billing/store", () => ({
  getBillingState: async () => ({
    hasPaidAccess: true,
    entitlements: { rateMaxPerMin: 1000, rateMaxPerDay: 100000, engines: ["core", "ultra"] },
  }),
  reserve: async () => ({ ok: true, reservationId: "r" }),
  settle: async () => {},
  release: async () => {},
}));

import {
  AI_CLEARED_KEY,
  AI_HISTORY_EVENT,
  AI_STORE_KEY,
  applyRetention,
  countExpiring,
  enforceRetention,
  loadHistory,
  parseHistory,
  persistDeletionsOnly,
  recallVisit,
  rememberVisit,
  saveHistory,
  type AiHistory,
} from "@/lib/ai/history";
import { DAY_MS, toAiRetention } from "@/lib/ai/retention";
import { installBrowser, type FakeBrowser } from "./helpers/browser";
import { setActiveUser, userKey } from "@/lib/userStorage";
import { clearAiHistory, getAiHistoryRule, setAiRetention } from "@/app/actions/assistant";
import { POST as chat } from "@/app/api/ai/chat/route";

const NOW = new Date(2026, 10, 23, 12, 0, 0).getTime();
const A = "user_hist_a";
const B = "user_hist_b";
const msg = (content: string) => [{ role: "user" as const, content }, { role: "assistant" as const, content: "ok" }];

function history(convs: [string, number][], threads: [string, number][] = []): AiHistory {
  return {
    convs: convs.map(([id, at]) => ({ id, title: id, messages: msg(id), updatedAt: at })),
    threads: Object.fromEntries(threads.map(([s]) => [s, msg(s)])),
    threadsAt: Object.fromEntries(threads),
  };
}

let browser: FakeBrowser;
const raw = (user: string) => browser.localStorage.getItem(userKey(user, AI_STORE_KEY));

beforeEach(() => {
  browser = installBrowser();
  setActiveUser(A);
});
afterEach(() => {
  setActiveUser(null);
  vi.unstubAllGlobals();
});

describe("historique existant préservé à la mise à jour", () => {
  it("un ancien historique (sans dates) est daté d'aujourd'hui, rien n'est supprimé", () => {
    const old = { version: 3, threads: { Maths: msg("fractions") }, convs: [{ id: "c1", title: "Ancienne", messages: msg("bonjour") }] };
    browser.localStorage.setItem(userKey(A, AI_STORE_KEY), JSON.stringify(old));
    const h = loadHistory(NOW);
    expect(h.convs).toEqual([{ id: "c1", title: "Ancienne", messages: msg("bonjour"), updatedAt: NOW }]);
    expect(h.threads.Maths).toEqual(msg("fractions"));
    expect(h.threadsAt.Maths).toBe(NOW);
    // La date est enregistrée : le délai ne repart pas à chaque lecture.
    expect(loadHistory(NOW + 5 * DAY_MS).convs[0].updatedAt).toBe(NOW);
    // Même passée en « 30 jours », la conversation reste 30 jours de plus.
    expect(enforceRetention("30d", null, NOW + 29 * DAY_MS)).toEqual({ convs: [], threads: [] });
  });

  it("données altérées : lecture défensive, jamais d'erreur", () => {
    expect(parseHistory({ convs: [null, { id: 3 }, { id: "ok", messages: [{ role: "system", content: "x" }] }] }, NOW).history.convs).toEqual([
      { id: "ok", title: "", messages: [], updatedAt: NOW },
    ]);
    browser.localStorage.setItem(userKey(A, AI_STORE_KEY), "{pas du json");
    expect(loadHistory(NOW)).toEqual({ threads: {}, threadsAt: {}, convs: [] });
  });
});

describe("règle des 30 jours (dernière activité)", () => {
  it("supprime seulement ce qui est inactif depuis plus de 30 jours", () => {
    const h = history(
      [
        ["vieille-mais-active", NOW - 2 * DAY_MS], // créée il y a longtemps, active récemment
        ["inactive-31j", NOW - 31 * DAY_MS],
        ["juste-30j", NOW - 30 * DAY_MS + 60000],
      ],
      [["SVT", NOW - 45 * DAY_MS], ["Maths", NOW - DAY_MS]],
    );
    const { history: kept, removed } = applyRetention(h, "30d", NOW);
    expect(removed).toEqual({ convs: ["inactive-31j"], threads: ["SVT"] });
    expect(kept.convs.map((c) => c.id)).toEqual(["vieille-mais-active", "juste-30j"]);
    expect(Object.keys(kept.threads)).toEqual(["Maths"]);
  });

  it("« conserver » et « ne pas conserver » ne suppriment rien automatiquement", () => {
    const h = history([["tres-vieille", NOW - 400 * DAY_MS]]);
    expect(applyRetention(h, "keep", NOW).removed.convs).toEqual([]);
    expect(applyRetention(h, "none", NOW).removed.convs).toEqual([]);
  });

  it("appliquée au stockage de l'appareil, avec un compte des suppressions à venir", () => {
    saveHistory(history([["a", NOW - 40 * DAY_MS], ["b", NOW]]));
    expect(countExpiring("30d", NOW)).toBe(1);
    const events: unknown[] = [];
    browser.window.addEventListener(AI_HISTORY_EVENT, (e) => events.push((e as CustomEvent).detail));
    expect(enforceRetention("30d", null, NOW)).toEqual({ convs: ["a"], threads: [] });
    expect(loadHistory(NOW).convs.map((c) => c.id)).toEqual(["b"]);
    expect(events).toEqual([{ convs: ["a"], threads: [] }]); // l'assistant ouvert est prévenu
  });
});

describe("« ne pas conserver »", () => {
  it("une nouvelle discussion n'est jamais écrite ; l'existant reste", () => {
    saveHistory(history([["ancienne", NOW]]));
    const current = history([["nouvelle", NOW], ["ancienne", NOW]]);
    current.convs[1].messages = [...current.convs[1].messages, ...msg("suite non conservée")];
    persistDeletionsOnly(current);
    const stored = loadHistory(NOW);
    expect(stored.convs.map((c) => c.id)).toEqual(["ancienne"]);
    expect(JSON.stringify(stored)).not.toContain("nouvelle");
    expect(JSON.stringify(stored)).not.toContain("suite non conservée");
  });

  it("une suppression demandée par l'élève est bien enregistrée", () => {
    saveHistory(history([["x", NOW], ["y", NOW]], [["Maths", NOW]]));
    persistDeletionsOnly({ convs: [], threads: { Maths: [] }, threadsAt: {} });
    expect(loadHistory(NOW)).toEqual({ threads: {}, threadsAt: {}, convs: [] });
  });

  it("une discussion supprimée par la règle des 30 jours ne revient pas par la mémoire de visite", () => {
    saveHistory(history([["vieille", NOW - 40 * DAY_MS], ["recente", NOW]], [["SVT", NOW - 40 * DAY_MS]]));
    rememberVisit(history([["vieille", NOW - 40 * DAY_MS], ["recente", NOW], ["visite", NOW]], [["SVT", NOW - 40 * DAY_MS]]));
    enforceRetention("30d", null, NOW);
    expect(recallVisit()?.convs.map((c) => c.id)).toEqual(["recente", "visite"]);
    expect(recallVisit()?.threads).toEqual({});
  });

  it("la discussion de la visite reste en mémoire seulement (propre au compte)", () => {
    const h = history([["visite", NOW]]);
    rememberVisit(h);
    expect(recallVisit()).toEqual(h);
    expect(raw(A)).toBeNull(); // rien sur le disque
    setActiveUser(B);
    expect(recallVisit()).toBeNull(); // un autre compte ne la voit pas
  });
});

describe("« Supprimer l'historique »", () => {
  it("efface tout une fois par appareil, pas ce qui est créé ensuite", () => {
    saveHistory(history([["a", NOW], ["b", NOW]], [["Maths", NOW]]));
    rememberVisit(history([["a", NOW]]));
    const clearedAt = NOW + 1000;
    expect(enforceRetention("keep", clearedAt, NOW + 2000)).toEqual({ convs: ["a", "b"], threads: ["Maths"] });
    expect(loadHistory(NOW).convs).toEqual([]);
    expect(recallVisit()).toBeNull();
    expect(browser.localStorage.getItem(userKey(A, AI_CLEARED_KEY))).toBe(String(clearedAt));
    // Nouvelle discussion après l'effacement : elle n'est plus touchée.
    saveHistory(history([["apres", NOW + 3000]]));
    expect(enforceRetention("keep", clearedAt, NOW + 4000)).toEqual({ convs: [], threads: [] });
    expect(loadHistory(NOW).convs.map((c) => c.id)).toEqual(["apres"]);
  });

  it("une demande périmée (onglet resté ouvert, page en cache) ne relance jamais l'effacement", () => {
    // 1re demande appliquée, puis 2e demande appliquée sur cet appareil.
    saveHistory(history([["a", NOW]]));
    enforceRetention("keep", NOW + 1000, NOW + 1500);
    enforceRetention("keep", NOW + 5000, NOW + 5500);
    // L'élève recommence à discuter…
    saveHistory(history([["apres-2e-demande", NOW + 6000]]));
    // … et un composant encore porteur de l'ANCIENNE date repasse : rien.
    expect(enforceRetention("keep", NOW + 1000, NOW + 7000)).toEqual({ convs: [], threads: [] });
    expect(loadHistory(NOW).convs.map((c) => c.id)).toEqual(["apres-2e-demande"]);
    // La date retenue reste la plus récente : la vraie suivante n'efface pas non plus.
    expect(browser.localStorage.getItem(userKey(A, AI_CLEARED_KEY))).toBe(String(NOW + 5000));
    expect(enforceRetention("keep", NOW + 5000, NOW + 8000)).toEqual({ convs: [], threads: [] });
    expect(loadHistory(NOW).convs).toHaveLength(1);
  });

  it("ne touche jamais l'historique d'un autre compte de l'appareil", () => {
    setActiveUser(B);
    saveHistory(history([["de-b", NOW]]));
    setActiveUser(A);
    saveHistory(history([["de-a", NOW]]));
    enforceRetention("keep", NOW + 1, NOW + 2);
    expect(loadHistory(NOW).convs).toEqual([]);
    setActiveUser(B);
    expect(loadHistory(NOW).convs.map((c) => c.id)).toEqual(["de-b"]);
  });

  it("sans compte actif : rien n'est lu ni effacé", () => {
    saveHistory(history([["a", NOW]]));
    setActiveUser(null);
    expect(enforceRetention("30d", NOW + 1, NOW + 100 * DAY_MS)).toEqual({ convs: [], threads: [] });
    setActiveUser(A);
    expect(loadHistory(NOW).convs).toHaveLength(1);
  });
});

describe("actions serveur et route de chat", () => {
  const created: string[] = [];
  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: { in: created } } });
  });
  async function makeUser() {
    const id = `test_b5_${crypto.randomUUID().replace(/-/g, "")}`.slice(0, 40);
    await prisma.user.create({ data: { id, email: `${id}@test.local`, passwordHash: "x" } });
    created.push(id);
    return { id, email: `${id}@test.local`, name: null, firstName: null, lastName: null, schoolClass: null, school: null, avatar: null, role: "student", shareMood: false };
  }

  it("préférence non renseignée : « conserver » ; changement enregistré, inconnu refusé", async () => {
    const u = await makeUser();
    ctx.user = u;
    expect(toAiRetention((await prisma.settings.findUnique({ where: { userId: u.id } }))?.aiRetention)).toBe("keep");
    expect(await setAiRetention("30d")).toEqual({ ok: true });
    expect((await prisma.settings.findUnique({ where: { userId: u.id } }))?.aiRetention).toBe("30d");
    expect(await setAiRetention("forever")).toEqual({ ok: false, error: "Choix inconnu." });
    expect((await prisma.settings.findUnique({ where: { userId: u.id } }))?.aiRetention).toBe("30d");
  });

  it("« Supprimer l'historique » ne concerne que le compte de la session", async () => {
    const a = await makeUser();
    const b = await makeUser();
    ctx.user = a;
    const res = await clearAiHistory();
    expect(res.ok).toBe(true);
    expect((await prisma.settings.findUnique({ where: { userId: a.id } }))?.aiHistoryClearedAt).toBeInstanceOf(Date);
    expect((await prisma.settings.findUnique({ where: { userId: b.id } }))?.aiHistoryClearedAt ?? null).toBeNull();
    ctx.user = null;
    await expect(clearAiHistory()).rejects.toThrow();
  });

  it("les changements rafraîchissent le layout ; la règle actuelle est relue pour le compte de la session", async () => {
    const a = await makeUser();
    const b = await makeUser();
    ctx.user = a;
    revalidated.length = 0;
    await setAiRetention("30d");
    expect(revalidated).toEqual(["/|layout"]);
    const res = await clearAiHistory();
    expect(revalidated).toEqual(["/|layout", "/|layout"]);
    expect(await getAiHistoryRule()).toEqual({ retention: "30d", clearedAt: res.ok ? res.clearedAt : -1 });
    // Changée ailleurs : relue telle quelle (jamais l'ancienne).
    await setAiRetention("keep");
    expect((await getAiHistoryRule())?.retention).toBe("keep");
    ctx.user = b;
    expect(await getAiHistoryRule()).toEqual({ retention: "keep", clearedAt: null });
    ctx.user = null;
    expect(await getAiHistoryRule()).toBeNull();
  });

  it("aucune table de conversations côté serveur", () => {
    const names = Prisma.dmmf.datamodel.models.map((m) => m.name.toLowerCase());
    expect(names.some((n) => /conversation|message|chat/.test(n))).toBe(false);
  });

  it("la route de chat répond sans enregistrer ni journaliser le contenu", async () => {
    const u = await makeUser();
    ctx.user = u;
    const secret = "Mon secret très personnel 7319";
    const logs: string[] = [];
    const spies = (["log", "info", "warn", "error"] as const).map((k) =>
      vi.spyOn(console, k).mockImplementation((...args: unknown[]) => void logs.push(args.map(String).join(" "))),
    );
    const before = await prisma.entry.count();
    try {
      const res = await chat(
        new NextRequest("http://localhost/api/ai/chat", {
          method: "POST",
          body: JSON.stringify({ message: secret, history: [{ role: "user", content: `${secret} (historique)` }] }),
          headers: { "content-type": "application/json" },
        }),
      );
      expect(res.status).toBe(200);
      expect(await res.text()).toBe("Réponse");
    } finally {
      for (const s of spies) s.mockRestore();
    }
    expect(logs.join("\n")).not.toContain(secret);
    expect(await prisma.entry.count()).toBe(before);
    const settings = await prisma.settings.findUnique({ where: { userId: u.id } });
    expect(JSON.stringify(settings ?? {})).not.toContain(secret);
  });
});
