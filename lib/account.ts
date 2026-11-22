// Centre de gestion du compte — logique SERVEUR, testable sans contexte de
// requête (chaque fonction prend un `userId` explicite ; aucune ne lit les
// cookies). Les server actions de app/actions/account.ts ne font que
// résoudre l'utilisateur courant (requireUser) puis appeler ce module.
//
// Trois responsabilités :
//   - export complet des données personnelles (« Mes données ») ;
//   - changement de mot de passe (comptes avec un mot de passe réel) ;
//   - suppression de compte (bloquée tant qu'un abonnement Stripe réel est
//     actif et non résilié ; vérification d'identité adaptée au type de
//     compte).
//
// Aucune de ces fonctions ne touche à Stripe, aux webhooks ni aux règles de
// crédits : la suppression s'appuie uniquement sur `getBillingState`, déjà
// exporté en lecture par lib/billing/store.ts.

import bcrypt from "bcryptjs";
import { prisma } from "./prisma";
import { isProAccountEmail } from "./proAccess";
import { getBillingState } from "./billing/store";
import { PLANS, type PlanId } from "./billing/plans";
import { parseAvatar } from "./avatar/config";
import { readSummary, displayName } from "./family";

// ---------------------------------------------------------------------------
// Export des données personnelles
// ---------------------------------------------------------------------------

export type AccountExport = {
  exportedAt: string;
  avertissement: string;
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
 * JAMAIS : mot de passe (hash), code famille (jeton d'invitation), code PIN
 * (hash), ni aucun code de vérification par e-mail — ce sont des moyens
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
      ledger: { orderBy: { createdAt: "desc" }, take: 5000 },
    },
  });
  if (!user) throw new Error("Utilisateur introuvable.");

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
      "ton mot de passe, ton code PIN, ton code famille ni aucun code de " +
      "vérification : ce sont des moyens de connexion, pas des données à exporter.",
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
          // pinHash volontairement exclu : c'est un moyen d'authentification.
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
        verrouille: e.locked,
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
    mouvementsCredits: user.ledger.map((l) => ({
      variation: l.delta,
      soldeApres: l.balanceAfter,
      raison: l.reason,
      moteur: l.engine,
      date: l.createdAt.toISOString(),
    })),
  };
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

export type DeletionBlock =
  | { blocked: false }
  | { blocked: true; reason: "subscription_active"; planName: string };

/**
 * Un abonnement Stripe RÉEL (stripeSubscriptionId non nul) encore actif et
 * pas déjà programmé pour résiliation bloque la suppression : supprimer le
 * compte romprait la référence locale sans rien dire à Stripe, qui
 * continuerait de facturer un compte qui n'existe plus côté Orbs. On ne
 * touche à aucun code Stripe ici : on demande d'utiliser le parcours de
 * résiliation existant (page Abonnement) avant de revenir.
 *
 * Un abonnement « Ultimate » sans référence Stripe (compte professionnel par
 * code, ou simulation de développement sans Stripe configuré) ne bloque rien
 * : aucun tiers ne facture réellement ce compte.
 */
export async function canDeleteAccount(userId: string): Promise<DeletionBlock> {
  const billing = await getBillingState(userId);
  const hasRealStripeSub = !!billing.subscription?.stripeSubscriptionId;
  if (hasRealStripeSub && billing.hasPaidAccess && !billing.cancelAtPeriodEnd) {
    return { blocked: true, reason: "subscription_active", planName: planLabel(billing.plan) };
  }
  return { blocked: false };
}

export type DeletionResult =
  | { ok: true }
  | { ok: false; reason: "subscription_active" | "bad_proof" | "not_found"; error: string };

/** Phrase à saisir pour confirmer la suppression d'un compte professionnel. */
export const PRO_DELETE_CONFIRM_PHRASE = "SUPPRIMER";

/**
 * Supprime DÉFINITIVEMENT le compte et tout ce qui lui est rattaché (journal,
 * notes, progression, abonnement local, portefeuille, liens famille…) via la
 * suppression en cascade définie dans le schéma. Vérifie d'abord :
 *   1. qu'aucun abonnement Stripe réel actif n'empêche la suppression ;
 *   2. une preuve d'identité adaptée au compte — le mot de passe actuel pour
 *      un compte normal, la phrase de confirmation pour un compte
 *      professionnel (qui n'a pas de mot de passe connu).
 * N'écrit RIEN si l'une de ces vérifications échoue (pas de suppression
 * partielle).
 */
export async function requestAccountDeletion(
  userId: string,
  proof: string,
): Promise<DeletionResult> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true, passwordHash: true },
  });
  if (!user) return { ok: false, reason: "not_found", error: "Compte introuvable." };

  const block = await canDeleteAccount(userId);
  if (block.blocked) {
    return {
      ok: false,
      reason: "subscription_active",
      error: `Ton abonnement ${block.planName} est actif. Résilie-le d'abord depuis la page Abonnement, puis reviens supprimer ton compte.`,
    };
  }

  const pro = isProAccountEmail(user.email);
  if (pro) {
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

  // Suppression en cascade (voir prisma/schema.prisma : onDelete: Cascade sur
  // toutes les relations de User). Aucune donnée partielle laissée derrière.
  await prisma.user.delete({ where: { id: userId } });
  return { ok: true };
}
