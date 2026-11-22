// Données personnelles de l'APPAREIL (lib/localAccountData.ts) : export
// combiné serveur + appareil, effacement ciblé après suppression, ordre des
// opérations, nettoyage des autres appareils. Faux navigateur en mémoire
// (tests/helpers/browser) + base SQLite jetable pour la partie serveur.

import { describe, it, expect, beforeEach, afterEach, afterAll, beforeAll, vi } from "vitest";
import { installBrowser, type FakeBrowser } from "./helpers/browser";
import { prisma } from "@/lib/prisma";
import {
  ACTIVE_USER_KEY,
  TOMBSTONES_KEY,
  setActiveUser,
  getActiveUser,
  userKey,
  readUserItem,
  writeUserItem,
  isTombstoned,
} from "@/lib/userStorage";
import { LEGACY_STATUS_KEY } from "@/lib/legacyStorage";
import {
  LOCAL_DATA_CATALOG,
  accountKeys,
  collectLocalData,
  buildFullExport,
  purgeAccountLocalData,
  purgeTombstoned,
  listDeviceAccountIds,
  applyGoneIds,
  runAccountDeletion,
  sweepDue,
  markSwept,
  SWEEP_INTERVAL_MS,
  type ServerExport,
} from "@/lib/localAccountData";
import { exportAccountData } from "@/lib/account";
import { saveAgenda, emptyAgenda } from "@/lib/agenda/store";

const A = "cmuseraaaa0001";
const B = "cmuserbbbb0002";

let browser: FakeBrowser;

/** Remplit l'espace local d'un compte avec une donnée par clé connue. */
function fillAccount(id: string, tag: string): void {
  for (const key of Object.keys(LOCAL_DATA_CATALOG)) {
    browser.localStorage.setItem(userKey(id, key), JSON.stringify({ proprietaire: tag, key }));
  }
}

beforeEach(() => {
  browser = installBrowser();
  setActiveUser(null);
});

afterEach(() => {
  setActiveUser(null);
  vi.unstubAllGlobals();
});

afterAll(async () => {
  await prisma.$disconnect();
});

// ---------------------------------------------------------------------------
describe("collectLocalData — export des données de l'appareil", () => {
  it("rassemble TOUTES les données locales du compte, et seulement les siennes", () => {
    fillAccount(A, "A");
    fillAccount(B, "B");
    browser.localStorage.setItem(userKey(A, "orbs.cle.future"), "valeur future");

    const local = collectLocalData(browser.localStorage, A);
    const blob = JSON.stringify(local);

    expect(local.source).toBe("appareil");
    expect(local.elements).toBe(Object.keys(LOCAL_DATA_CATALOG).length + 1);
    expect(blob).not.toContain('"B"');
    // Chaque domaine attendu est bien présent à sa place.
    expect(local.agenda).toMatchObject({ proprietaire: "A", key: "orbs.agenda.v1" });
    expect(local.notes).toMatchObject({ key: "orbs.grades.v1" });
    expect(local.apprendre).toMatchObject({ key: "orbs.learn.v1" });
    expect(local.conversationsIA).toMatchObject({ key: "orbs.ai.v2" });
    expect(local.brouillonJournal).toMatchObject({ key: "orbs:draft:new" });
    expect((local.rappels as Record<string, unknown>).reglages).toMatchObject({ key: "orbs.agenda.notif.v1" });
    expect((local.preferences as Record<string, unknown>).apparence).toMatchObject({ key: "orbs.appearance" });
    // Une clé inconnue (ajoutée plus tard) n'est pas perdue.
    expect((local.autres as Record<string, unknown>)["orbs.cle.future"]).toBe("valeur future");
  });

  it("ne confond pas deux comptes dont l'identifiant de l'un préfixe l'autre", () => {
    browser.localStorage.setItem(userKey("abc", "orbs.agenda.v1"), '"de abc"');
    browser.localStorage.setItem(userKey("abcd", "orbs.agenda.v1"), '"de abcd"');
    expect(collectLocalData(browser.localStorage, "abc").agenda).toBe("de abc");
    expect(accountKeys(browser.localStorage, "abc")).toEqual([userKey("abc", "orbs.agenda.v1")]);
  });

  it("n'inclut jamais les anciennes données orphelines (propriétaire inconnu), mais le signale", () => {
    browser.localStorage.setItem("orbs.agenda.v1", '{"secret":"orphelin"}');
    browser.localStorage.setItem(LEGACY_STATUS_KEY, "orphan");
    const local = collectLocalData(browser.localStorage, A);
    expect(JSON.stringify(local)).not.toContain("orphelin");
    expect(local.anciennesDonneesNonRattachees).toMatch(/pas incluses/);
  });

  it("inclut les anciennes données en cours de transfert vers CE compte", () => {
    browser.localStorage.setItem("orbs.grades.v1", '{"note":"ancienne de A"}');
    browser.localStorage.setItem(LEGACY_STATUS_KEY, `owner:${A}`);
    expect(JSON.stringify(collectLocalData(browser.localStorage, A))).toContain("ancienne de A");
    expect(JSON.stringify(collectLocalData(browser.localStorage, B))).not.toContain("ancienne de A");
  });

  it("n'exporte aucune donnée technique d'appareil (marqueurs, registre des suppressions)", () => {
    fillAccount(A, "A");
    browser.localStorage.setItem(ACTIVE_USER_KEY, A);
    browser.localStorage.setItem(TOMBSTONES_KEY, JSON.stringify([B]));
    const blob = JSON.stringify(collectLocalData(browser.localStorage, A));
    expect(blob).not.toContain("orbs.device.");
    expect(blob).not.toContain(B);
  });
});

// ---------------------------------------------------------------------------
describe("buildFullExport — archive complète serveur + appareil", () => {
  it("assemble l'export RÉEL du serveur et les données locales du même compte, sans secret ni autre compte", async () => {
    const id = `test_${crypto.randomUUID()}`;
    await prisma.user.create({
      data: { id, email: `${id}@test.local`, passwordHash: "hash-secret-ne-doit-pas-fuiter", settings: { create: {} } },
    });
    await prisma.entry.create({ data: { userId: id, content: "Page du journal (serveur)" } });

    // Données locales réelles, écrites par le vrai magasin de l'agenda.
    setActiveUser(id);
    saveAgenda({
      ...emptyAgenda(),
      homework: [{ id: "h1", title: "Devoir local uniquement", subject: "Maths", due: "2026-12-01", done: false }],
    });
    browser.localStorage.setItem(userKey(B, "orbs.ai.v2"), '"conversation de B"');

    const server = JSON.parse(JSON.stringify(await exportAccountData(id))) as ServerExport;
    const built = buildFullExport(server, browser.localStorage, getActiveUser());
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    const blob = JSON.stringify(built.archive);

    expect(blob).toContain("Page du journal (serveur)"); // Prisma
    expect(blob).toContain("Devoir local uniquement"); // appareil
    expect(blob).not.toContain("conversation de B"); // autre compte
    expect(blob).not.toContain("hash-secret-ne-doit-pas-fuiter"); // secret
    const sources = built.archive.sources as { serveur: string; appareil: string };
    expect(sources.serveur).toMatch(/serveur/);
    expect(sources.appareil).toMatch(/appareil/);
    expect((built.archive.donneesDeCetAppareil as { source: string }).source).toBe("appareil");

    await prisma.user.delete({ where: { id } });
  });

  it("refuse d'assembler si l'appareil n'a pas ouvert l'espace du MÊME compte", () => {
    fillAccount(B, "B");
    const server = { compte: { id: A } } as ServerExport;
    expect(buildFullExport(server, browser.localStorage, B).ok).toBe(false);
    expect(buildFullExport(server, browser.localStorage, null).ok).toBe(false);
    expect(buildFullExport({ compte: { id: "x:y" } } as ServerExport, browser.localStorage, "x:y").ok).toBe(false);
  });
});

// ---------------------------------------------------------------------------
describe("purgeAccountLocalData — effacement sur l'appareil actuel", () => {
  it("efface tout l'espace du compte supprimé et rien d'autre", () => {
    fillAccount(A, "A");
    fillAccount(B, "B");
    browser.localStorage.setItem(userKey("cmuseraaaa00010", "orbs.agenda.v1"), '"voisin"'); // préfixe proche
    const bBefore = accountKeys(browser.localStorage, B).map((k) => [k, browser.localStorage.getItem(k)]);

    const report = purgeAccountLocalData(browser.localStorage, A);

    expect(report.removedKeys.length).toBe(Object.keys(LOCAL_DATA_CATALOG).length);
    expect(accountKeys(browser.localStorage, A)).toEqual([]);
    expect(accountKeys(browser.localStorage, B).map((k) => [k, browser.localStorage.getItem(k)])).toEqual(bBefore);
    expect(browser.localStorage.getItem(userKey("cmuseraaaa00010", "orbs.agenda.v1"))).toBe('"voisin"');
  });

  it("anciennes données : efface celles attribuées au compte supprimé, jamais les orphelines ni celles d'un autre", () => {
    // Attribuées à A (transfert inachevé) : effacées.
    browser.localStorage.setItem("orbs.agenda.v1", '"ancien A"');
    browser.localStorage.setItem(LEGACY_STATUS_KEY, `owner:${A}`);
    expect(purgeAccountLocalData(browser.localStorage, A).legacyKeysRemoved).toEqual(["orbs.agenda.v1"]);
    expect(browser.localStorage.getItem("orbs.agenda.v1")).toBeNull();
    expect(browser.localStorage.getItem(LEGACY_STATUS_KEY)).toBeNull();

    // Attribuées à B : intactes.
    browser.localStorage.setItem("orbs.grades.v1", '"ancien B"');
    browser.localStorage.setItem(LEGACY_STATUS_KEY, `owner:${B}`);
    purgeAccountLocalData(browser.localStorage, A);
    expect(browser.localStorage.getItem("orbs.grades.v1")).toBe('"ancien B"');
    expect(browser.localStorage.getItem(LEGACY_STATUS_KEY)).toBe(`owner:${B}`);

    // Orphelines : intactes.
    browser.localStorage.setItem(LEGACY_STATUS_KEY, "orphan");
    purgeAccountLocalData(browser.localStorage, A);
    expect(browser.localStorage.getItem("orbs.grades.v1")).toBe('"ancien B"');
    expect(browser.localStorage.getItem(LEGACY_STATUS_KEY)).toBe("orphan");
  });

  it("réinitialise le compte actif s'il s'agissait du compte supprimé, pas sinon", () => {
    browser.localStorage.setItem(ACTIVE_USER_KEY, A);
    setActiveUser(A);
    purgeAccountLocalData(browser.localStorage, A);
    expect(getActiveUser()).toBeNull();
    expect(browser.localStorage.getItem(ACTIVE_USER_KEY)).toBe("");

    browser.localStorage.setItem(ACTIVE_USER_KEY, B);
    setActiveUser(B);
    purgeAccountLocalData(browser.localStorage, A);
    expect(getActiveUser()).toBe(B);
    expect(browser.localStorage.getItem(ACTIVE_USER_KEY)).toBe(B);
  });

  it("les données supprimées ne réapparaissent pas : un onglet resté ouvert ne peut plus écrire", () => {
    setActiveUser(A);
    writeUserItem("orbs.agenda.v1", '"avant"');
    purgeAccountLocalData(browser.localStorage, A);
    expect(isTombstoned(A)).toBe(true);

    // L'onglet périmé croit encore être sur A.
    setActiveUser(A);
    expect(writeUserItem("orbs.agenda.v1", '"réécrit après suppression"')).toBe(false);
    expect(readUserItem("orbs.agenda.v1")).toBeNull();
    expect(accountKeys(browser.localStorage, A)).toEqual([]);
  });

  it("au chargement suivant, les restes d'un compte supprimé sont effacés", () => {
    purgeAccountLocalData(browser.localStorage, A);
    // Écriture brute arrivée entre deux instants (ancien code, autre onglet).
    browser.localStorage.setItem(userKey(A, "orbs.ai.v2"), '"reste"');
    browser.localStorage.setItem(userKey(B, "orbs.ai.v2"), '"de B"');
    expect(purgeTombstoned(browser.localStorage)).toEqual([userKey(A, "orbs.ai.v2")]);
    expect(browser.localStorage.getItem(userKey(B, "orbs.ai.v2"))).toBe('"de B"');
  });
});

// ---------------------------------------------------------------------------
describe("runAccountDeletion — ordre des opérations", () => {
  function deps(submit: () => Promise<unknown>) {
    const order: string[] = [];
    return {
      order,
      run: () =>
        runAccountDeletion({
          submit: async () => {
            order.push("submit");
            return (await submit()) as never;
          },
          purge: (id) => order.push(`purge:${id}`),
          leave: () => order.push("leave"),
        }),
    };
  }

  it("serveur OK : efface le compte CONFIRMÉ par le serveur, puis quitte la page", async () => {
    const d = deps(async () => ({ ok: true, deletedUserId: A }));
    expect(await d.run()).toEqual({ ok: true });
    expect(d.order).toEqual(["submit", `purge:${A}`, "leave"]);
  });

  it("erreur serveur (refus, abonnement, mauvais mot de passe) : AUCUN effacement local", async () => {
    const d = deps(async () => ({ ok: false, error: "Mot de passe incorrect." }));
    expect(await d.run()).toEqual({ ok: false, error: "Mot de passe incorrect." });
    expect(d.order).toEqual(["submit"]);
  });

  it("coupure réseau ou exception : AUCUN effacement local", async () => {
    const d = deps(async () => {
      throw new TypeError("Failed to fetch");
    });
    const res = await d.run();
    expect(res.ok).toBe(false);
    expect(d.order).toEqual(["submit"]);
  });

  it("réponse vide ou identifiant invalide : AUCUN effacement local", async () => {
    for (const reply of [undefined, { ok: true, deletedUserId: "" }, { ok: true, deletedUserId: "a:b" }]) {
      const d = deps(async () => reply);
      expect((await d.run()).ok).toBe(false);
      expect(d.order).toEqual(["submit"]);
    }
  });

  it("de bout en bout avec le vrai stockage : échec serveur → données intactes ; succès → effacées", async () => {
    fillAccount(A, "A");
    const before = browser.localStorage.snapshot();
    await runAccountDeletion({
      submit: async () => ({ ok: false, error: "Paiement en attente" }),
      purge: (id) => purgeAccountLocalData(browser.localStorage, id),
      leave: () => {},
    });
    expect(browser.localStorage.snapshot()).toEqual(before);

    await runAccountDeletion({
      submit: async () => ({ ok: true, deletedUserId: A }),
      purge: (id) => purgeAccountLocalData(browser.localStorage, id),
      leave: () => {},
    });
    expect(accountKeys(browser.localStorage, A)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
describe("autres appareils", () => {
  it("liste les comptes présents sur l'appareil (hors comptes déjà supprimés)", () => {
    fillAccount(A, "A");
    fillAccount(B, "B");
    browser.localStorage.setItem(LEGACY_STATUS_KEY, "owner:cmuserlegacy03");
    expect(listDeviceAccountIds(browser.localStorage).sort()).toEqual([A, B, "cmuserlegacy03"].sort());
    purgeAccountLocalData(browser.localStorage, A);
    expect(listDeviceAccountIds(browser.localStorage)).not.toContain(A);
  });

  it("n'efface que les comptes que le serveur déclare disparus ET qui ont été demandés — jamais le compte connecté", () => {
    fillAccount(A, "A");
    fillAccount(B, "B");
    const C = "cmusercccc0003";
    fillAccount(C, "C");
    // B est connecté ; il demande pour A et C. Le serveur répond A, B (!) et X.
    const purged = applyGoneIds(browser.localStorage, [A, C], [A, B, "cmuserxxxx0009"], B);
    expect(purged).toEqual([A]);
    expect(accountKeys(browser.localStorage, A)).toEqual([]);
    expect(accountKeys(browser.localStorage, B).length).toBeGreaterThan(0);
    expect(accountKeys(browser.localStorage, C).length).toBeGreaterThan(0);
    // Réponse malformée : rien.
    expect(applyGoneIds(browser.localStorage, [C], "n'importe quoi", B)).toEqual([]);
  });

  it("vérification au plus toutes les 12 h", () => {
    const t = 1_800_000_000_000;
    expect(sweepDue(browser.localStorage, t)).toBe(true);
    markSwept(browser.localStorage, t);
    expect(sweepDue(browser.localStorage, t + SWEEP_INTERVAL_MS - 1)).toBe(false);
    expect(sweepDue(browser.localStorage, t + SWEEP_INTERVAL_MS)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
describe("jeton signé « compte disparu »", () => {
  let session: typeof import("@/lib/session");
  beforeAll(async () => {
    process.env.SESSION_SECRET ??= "secret-de-test-uniquement-0123456789abcdef";
    session = await import("@/lib/session");
  });

  it("le jeton émis par le serveur prouve la disparition de CE compte", async () => {
    const token = await session.signAccountGone(A);
    expect(await session.verifyAccountGone(token)).toBe(A);
  });

  it("une session ne vaut pas preuve, et le jeton ne vaut pas session", async () => {
    const sessionToken = await session.encrypt({ userId: A, expiresAt: new Date(Date.now() + 60_000).toISOString() });
    expect(await session.verifyAccountGone(sessionToken)).toBeNull();
    const gone = await session.signAccountGone(A);
    expect(await session.decrypt(gone)).toBeNull();
  });

  it("un jeton falsifié, modifié ou absent ne prouve rien (une URL fabriquée n'efface rien)", async () => {
    const token = await session.signAccountGone(A);
    const [h, , sig] = token.split(".");
    const forgedPayload = Buffer.from(JSON.stringify({ purpose: "account-gone", goneUserId: B })).toString("base64url");
    expect(await session.verifyAccountGone(`${h}.${forgedPayload}.${sig}`)).toBeNull();
    expect(await session.verifyAccountGone(B)).toBeNull();
    expect(await session.verifyAccountGone(undefined)).toBeNull();
  });
});
