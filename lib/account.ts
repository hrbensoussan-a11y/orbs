// Centre de gestion du compte — logique SERVEUR, testable sans contexte de
// requête (chaque fonction prend un `userId` explicite ; aucune ne lit les
// cookies). Les server actions de app/actions/account.ts ne font que
// résoudre l'utilisateur courant (requireUser) puis appeler ce module.
//
// Trois responsabilités :
//   - export des données personnelles DU SERVEUR (« Mes données ») — le
//     navigateur y ajoute ensuite celles de l'appareil (lib/localAccountData) ;
//   - changement de mot de passe (comptes avec un mot de passe réel) ;
//   - suppression de compte côté serveur (bloquée tant que Stripe, interrogé
//     directement, ne confirme pas qu'aucun abonnement ne sera plus facturé ;
//     vérification d'identité adaptée au type de compte).
//
// Aucune de ces fonctions n'ÉCRIT chez Stripe ni ne touche aux webhooks ou
// aux règles de crédits : la vérification Stripe est en lecture seule.

import { styleLabel, toAiStyle } from "@/lib/ai/style";
import { parseLearningProfile, profileForExport } from "@/lib/ai/learningProfile";
import bcrypt from "bcryptjs";
import { prisma } from "./prisma";
import { isProAccountEmail } from "./proAccess";
import { PRO_DELETE_CONFIRM_PHRASE } from "./accountConstants";
import {
  checkStripeBeforeDeletion,
  defaultStripeGateway,
  stripeBlockMessage,
  type StripeBlockReason,
  type StripeDeletionCheck,
  type StripeReadGateway,
} from "./accountStripeCheck";
import { PLANS, type PlanId } from "./billing/plans";
import { parseAvatar } from "./avatar/config";
import { readSummary, displayName } from "./family";

// ---------------------------------------------------------------------------
// Export des données personnelles
// ---------------------------------------------------------------------------

export type AccountExport = {
  exportedAt: string;
  avertissement: string;
  /**
   * Provenance des données. `appareil` vaut `null` tant que le navigateur
   * n'a pas ajouté les données enregistrées sur l'appareil (voir
   * lib/localAccountData → buildFullExport) : le serveur ne peut pas les lire.
   */
  sources: { serveur: string; appareil: string | null };
  compte: {
    id: string;
    email: string;
    type: "élève" | "parent" | "professionnel (démonstration)";
    nom: string | null;
    prenom: string | null;
    nomAffiche: string | null;
    classe: string | null;
    etablissement: string | null;
    emailVerifie: string | null;
    creeLe: string;
    misAJourLe: string;
    note?: string;
  };
  avatar: unknown;
  preferences: {
    theme: string;
    langue: string;
    police: string;
    tailleTexte: string;
    rappelsActifs: boolean;
    heureRappel: string | null;
    frequenceRappel: string | null;
    objectifSerie: number | null;
    styleAssistant: string;
    espacementTexte: string;
    conservationConversations: string;
    profilApprentissage: ReturnType<typeof profileForExport>;
  } | null;
  journal: {
    entrees: unknown[];
  };
  apprentissage: {
    resume: unknown;
    synchroniseLe: string | null;
  };
  famille: {
    role: string;
    partageHumeur: boolean;
    parents: { nom: string; email: string; lieDepuis: string }[];
    enfants: { nom: string; email: string; lieDepuis: string }[];
    encouragementsEnvoyes: unknown[];
    encouragementsRecus: unknown[];
    defisEnvoyes: unknown[];
    defisRecus: unknown[];
  };
  abonnement: unknown;
  creditsPortefeuille: unknown;
  mouvementsCredits: unknown[];
};

function planLabel(plan: string): string {
  return plan in PLANS ? PLANS[plan as PlanId].name : plan;
}

/**
 * Archive JSON complète des données appartenant à `userId`. Ne contient
 * JAMAIS : mot de passe (hash), code famille (jeton d'invitation), ni aucun
 * code de vérification par e-mail — ce sont des moyens
 * d'authentification, jamais des données personnelles à exporter.
 */
export async function exportAccountData(userId: string): Promise<AccountExport> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      settings: true,
      entries: { include: { tags: true, media: true }, orderBy: { entryDate: "asc" } },
      parents: { include: { parent: { select: { name: true, firstName: true, email: true, createdAt: true } } } },
      children: { include: { child: { select: { name: true, firstName: true, email: true, createdAt: true } } } },
      cheersSent: { include: { to: { select: { name: true, firstName: true, email: true } } } },
      cheersReceived: { include: { from: { select: { name: true, firstName: true, email: true } } } },
      challengesSet: { include: { to: { select: { name: true, firstName: true, email: true } } } },
      challengesToDo: { include: { from: { select: { name: true, firstName: true, email: true } } } },
      subscription: true,
      wallet: true,
    },
  });
  if (!user) throw new Error("Utilisateur introuvable.");
  // Historique des crédits COMPLET (aucune limite arbitraire), lu par pages.
  const ledger = await readFullCreditLedger(userId);

  const pro = isProAccountEmail(user.email);
  const type: AccountExport["compte"]["type"] = pro
    ? "professionnel (démonstration)"
    : user.role === "parent"
      ? "parent"
      : "élève";

  return {
    exportedAt: new Date().toISOString(),
    avertissement:
      "Cette archive contient tes données personnelles. Elle ne contient jamais " +
      "ton mot de passe, ton code famille ni aucun code de " +
      "vérification : ce sont des moyens de connexion, pas des données à exporter.",
    sources: {
      serveur:
        "Données enregistrées sur le serveur d'Orbs : compte, avatar, préférences du " +
        "compte, journal, résumé de progression Apprendre, espace famille, abonnement " +
        "et crédits. Identiques depuis tous tes appareils.",
      appareil: null,
    },
    compte: {
      id: user.id,
      email: user.email,
      type,
      nom: user.lastName,
      prenom: user.firstName,
      nomAffiche: user.name,
      classe: user.schoolClass,
      etablissement: user.school,
      emailVerifie: user.emailVerified?.toISOString() ?? null,
      creeLe: user.createdAt.toISOString(),
      misAJourLe: user.updatedAt.toISOString(),
      ...(pro
        ? {
            note:
              "Adresse générée automatiquement pour un accès par code " +
              "professionnel : elle ne reçoit aucun e-mail réel.",
          }
        : {}),
    },
    avatar: parseAvatar(user.avatar),
    preferences: user.settings
      ? {
          theme: user.settings.theme,
          langue: user.settings.locale,
          police: user.settings.font,
          tailleTexte: user.settings.fontSize,
          rappelsActifs: user.settings.reminderEnabled,
          heureRappel: user.settings.reminderTime,
          frequenceRappel: user.settings.reminderFrequency,
          objectifSerie: user.settings.streakGoal,
          styleAssistant: styleLabel(toAiStyle(user.settings.aiStyle)),
          espacementTexte: user.settings.lineSpacing,
          conservationConversations: user.settings.aiRetention,
          profilApprentissage: profileForExport(parseLearningProfile(user.settings.learningProfile)),
        }
      : null,
    journal: {
      entrees: user.entries.map((e) => ({
        id: e.id,
        titre: e.title,
        contenu: e.content,
        dateDuJournal: e.entryDate.toISOString(),
        creeLe: e.createdAt.toISOString(),
        misAJourLe: e.updatedAt.toISOString(),
        humeur: e.mood,
        humeurEmoji: e.moodEmoji,
        lieu: e.location,
        meteo: e.weather,
        favori: e.favorite,
        epingle: e.pinned,
        energie: e.energy,
        heuresSommeil: e.sleepHours,
        activites: e.activities,
        personnes: e.people,
        tags: e.tags.map((t) => t.name),
        medias: e.media.map((m) => ({
          type: m.type,
          url: m.url,
          largeur: m.width,
          hauteur: m.height,
          legende: m.caption,
        })),
      })),
    },
    apprentissage: {
      resume: readSummary(user.learnSnapshot),
      synchroniseLe: user.learnSyncedAt?.toISOString() ?? null,
    },
    famille: {
      role: user.role,
      partageHumeur: user.shareMood,
      parents: user.parents.map((link) => ({
        nom: displayName(link.parent),
        email: link.parent.email,
        lieDepuis: link.createdAt.toISOString(),
      })),
      enfants: user.children.map((link) => ({
        nom: displayName(link.child),
        email: link.child.email,
        lieDepuis: link.createdAt.toISOString(),
      })),
      encouragementsEnvoyes: user.cheersSent.map((c) => ({
        a: displayName(c.to),
        sticker: c.sticker,
        message: c.message,
        envoyeLe: c.createdAt.toISOString(),
      })),
      encouragementsRecus: user.cheersReceived.map((c) => ({
        de: displayName(c.from),
        sticker: c.sticker,
        message: c.message,
        recuLe: c.createdAt.toISOString(),
        vuLe: c.seenAt?.toISOString() ?? null,
      })),
      defisEnvoyes: user.challengesSet.map((c) => ({
        a: displayName(c.to),
        type: c.kind,
        objectif: c.target,
        recompense: c.reward,
        creeLe: c.createdAt.toISOString(),
        termineLe: c.completedAt?.toISOString() ?? null,
        annule: c.cancelled,
      })),
      defisRecus: user.challengesToDo.map((c) => ({
        de: displayName(c.from),
        type: c.kind,
        objectif: c.target,
        recompense: c.reward,
        creeLe: c.createdAt.toISOString(),
        termineLe: c.completedAt?.toISOString() ?? null,
        annule: c.cancelled,
      })),
    },
    abonnement: user.subscription
      ? {
          offre: planLabel(user.subscription.plan),
          statut: user.subscription.status,
          debutPeriode: user.subscription.currentPeriodStart?.toISOString() ?? null,
          finPeriode: user.subscription.currentPeriodEnd?.toISOString() ?? null,
          resiliationProgrammee: user.subscription.cancelAtPeriodEnd,
          resilieLe: user.subscription.canceledAt?.toISOString() ?? null,
          offreProgrammee: user.subscription.scheduledPlan,
          // Références Stripe : NON secrètes (identifiants opaques, pas des
          // clés ni des jetons), utiles pour savoir ce qui est lié ailleurs.
          referenceClientStripe: user.subscription.stripeCustomerId,
          referenceAbonnementStripe: user.subscription.stripeSubscriptionId,
        }
      : null,
    creditsPortefeuille: user.wallet
      ? {
          solde: user.wallet.balance,
          allocation: user.wallet.allowance,
          debutCycle: user.wallet.cycleStart.toISOString(),
          finCycle: user.wallet.cycleEnd?.toISOString() ?? null,
        }
      : null,
    mouvementsCredits: ledger.map((l) => ({
      variation: l.delta,
      soldeApres: l.balanceAfter,
      raison: l.reason,
      moteur: l.engine,
      // Détails enregistrés par le serveur (offre, modèle, mode…) : jamais de
      // contenu de conversation ni de secret, uniquement la nature de l'usage.
      details: parseLedgerMeta(l.meta),
      date: l.createdAt.toISOString(),
    })),
  };
}

/** Taille d'une page de lecture de l'historique des crédits. */
export const LEDGER_EXPORT_PAGE_SIZE = 2000;

type LedgerRow = {
  id: string;
  delta: number;
  balanceAfter: number;
  reason: string;
  engine: string | null;
  meta: string | null;
  createdAt: Date;
};

/**
 * TOUT l'historique des crédits de `userId`, du plus récent au plus ancien,
 * lu par pages de LEDGER_EXPORT_PAGE_SIZE (pagination « keyset » sur
 * l'index (userId, createdAt) : chaque page coûte autant que la première,
 * même après des centaines de milliers de lignes). Le filtre `userId`
 * figure dans CHAQUE requête : aucune page ne peut contenir une ligne d'un
 * autre compte. L'ordre (createdAt, id) est total : ni doublon ni oubli,
 * même pour des mouvements enregistrés à la même milliseconde.
 */
export async function readFullCreditLedger(
  userId: string,
  pageSize = LEDGER_EXPORT_PAGE_SIZE,
): Promise<LedgerRow[]> {
  const select = {
    id: true,
    delta: true,
    balanceAfter: true,
    reason: true,
    engine: true,
    meta: true,
    createdAt: true,
  } as const;
  const all: LedgerRow[] = [];
  let last: LedgerRow | undefined;
  for (;;) {
    const page: LedgerRow[] = await prisma.creditLedger.findMany({
      where: last
        ? {
            userId,
            OR: [
              { createdAt: { lt: last.createdAt } },
              { createdAt: last.createdAt, id: { lt: last.id } },
            ],
          }
        : { userId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: pageSize,
      select,
    });
    all.push(...page);
    if (page.length < pageSize) return all;
    last = page[page.length - 1];
  }
}

function parseLedgerMeta(meta: string | null): unknown {
  if (meta == null) return null;
  try {
    return JSON.parse(meta);
  } catch {
    return meta;
  }
}

// ---------------------------------------------------------------------------
// Mot de passe
// ---------------------------------------------------------------------------

export type ChangePasswordResult = { ok: true } | { ok: false; error: string };

/**
 * Change le mot de passe après vérification de l'ACTUEL (preuve d'identité).
 * Refuse pour un compte professionnel : son mot de passe est aléatoire et
 * jamais connu de l'utilisateur — rien à « confirmer », et aucune e-mail
 * réelle pour un futur oubli. On ne simule pas cette fonctionnalité : on
 * explique clairement qu'elle ne s'applique pas à ce type de compte.
 */
export async function changeUserPassword(
  userId: string,
  currentPassword: string,
  newPassword: string,
): Promise<ChangePasswordResult> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true, passwordHash: true },
  });
  if (!user) return { ok: false, error: "Compte introuvable." };

  if (isProAccountEmail(user.email)) {
    return {
      ok: false,
      error:
        "Ce compte professionnel se connecte uniquement par code : il n'a pas " +
        "de mot de passe personnel à modifier.",
    };
  }

  if (newPassword.length < 8) {
    return { ok: false, error: "Le nouveau mot de passe doit faire au moins 8 caractères." };
  }

  const ok = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!ok) return { ok: false, error: "Mot de passe actuel incorrect." };

  const passwordHash = await bcrypt.hash(newPassword, 10);
  await prisma.user.update({ where: { id: userId }, data: { passwordHash } });
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Suppression de compte
// ---------------------------------------------------------------------------

export type DeletionBlock = StripeDeletionCheck;

/**
 * La suppression est-elle sûre du point de vue de la facturation ?
 *
 * Si le compte est relié à Stripe (client ou abonnement), on interroge
 * STRIPE DIRECTEMENT (lecture seule) et on ne se fie jamais au seul état
 * local : voir lib/accountStripeCheck.ts. Toute incertitude bloque.
 *
 * Un compte sans référence Stripe (compte professionnel par code, simulation
 * de développement) n'est facturé par personne : jamais bloqué, même avec
 * l'offre Ultimate.
 */
export async function canDeleteAccount(
  userId: string,
  gateway: StripeReadGateway = defaultStripeGateway,
): Promise<DeletionBlock> {
  const local = await prisma.subscription.findUnique({ where: { userId } });
  return checkStripeBeforeDeletion(userId, local, gateway);
}

export type DeletionResult =
  | { ok: true; deletedUserId: string }
  | {
      ok: false;
      reason: StripeBlockReason | "bad_proof" | "not_found";
      error: string;
    };

export { PRO_DELETE_CONFIRM_PHRASE };

/**
 * Supprime DÉFINITIVEMENT le compte côté serveur. Vérifie d'abord :
 *   1. auprès de Stripe, qu'aucun abonnement ne continuera à être facturé ;
 *   2. une preuve d'identité adaptée au compte — le mot de passe actuel pour
 *      un compte normal, la phrase de confirmation pour un compte
 *      professionnel (qui n'a pas de mot de passe connu).
 * Puis, dans UNE transaction :
 *   - les codes e-mail de son adresse EXACTE (connexion, vérification,
 *     réinitialisation : EmailCode n'a pas de relation avec User, la cascade
 *     ne les atteindrait pas) ;
 *   - le compte et tout ce qui lui est rattaché (cascade du schéma).
 * N'écrit RIEN si une vérification échoue (pas de suppression partielle), et
 * n'annule jamais rien chez Stripe.
 *
 * Renvoie l'identifiant supprimé, confirmé par le serveur : c'est lui, et lui
 * seul, que le navigateur effacera ensuite de l'appareil.
 */
export async function requestAccountDeletion(
  userId: string,
  proof: string,
  gateway: StripeReadGateway = defaultStripeGateway,
): Promise<DeletionResult> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, passwordHash: true },
  });
  if (!user) return { ok: false, reason: "not_found", error: "Compte introuvable." };

  const block = await canDeleteAccount(userId, gateway);
  if (block.blocked) {
    return {
      ok: false,
      reason: block.reason,
      error: stripeBlockMessage(block.reason, block.planName),
    };
  }

  if (isProAccountEmail(user.email)) {
    if (proof.trim() !== PRO_DELETE_CONFIRM_PHRASE) {
      return {
        ok: false,
        reason: "bad_proof",
        error: `Tape exactement « ${PRO_DELETE_CONFIRM_PHRASE} » pour confirmer.`,
      };
    }
  } else {
    const ok = await bcrypt.compare(proof, user.passwordHash);
    if (!ok) {
      return { ok: false, reason: "bad_proof", error: "Mot de passe incorrect." };
    }
  }

  // Adresse exacte telle qu'enregistrée (toujours en minuscules à l'écriture,
  // côté User comme côté EmailCode) : aucun code d'une autre adresse touché.
  const emails = [...new Set([user.email, user.email.toLowerCase()])];
  await prisma.$transaction([
    prisma.emailCode.deleteMany({ where: { email: { in: emails } } }),
    prisma.user.delete({ where: { id: userId } }),
  ]);
  return { ok: true, deletedUserId: user.id };
}

/**
 * Parmi des identifiants de comptes trouvés dans le stockage d'un appareil,
 * lesquels n'existent plus ? Sert au nettoyage des AUTRES appareils (voir
 * app/api/account/local-check). Une erreur de base de données LÈVE : on ne
 * déclare jamais un compte disparu par défaut.
 */
export async function findGoneUserIds(ids: string[]): Promise<string[]> {
  if (ids.length === 0) return [];
  const found = await prisma.user.findMany({
    where: { id: { in: ids } },
    select: { id: true },
  });
  const alive = new Set(found.map((u) => u.id));
  return ids.filter((id) => !alive.has(id));
}
