# Abonnements & crédits IA — architecture et mise en place

Ce document décrit le système d'abonnement commercial d'Orbs (offres **Plus** et
**Ultimate**), son portefeuille de crédits IA unique, et **les étapes de
configuration externe et de validation humaine** nécessaires pour encaisser de
vrais paiements en production.

> L'offre **Muse** est réservée à une évolution future : elle n'est volontairement
> pas implémentée.

## 1. Vue d'ensemble

```
Navigateur ──> Server Actions (app/actions/billing.ts) ──> Stripe (API HTTPS)
     │                                                          │
     │  (redirection vers Checkout / Portail hébergés)          │ webhooks signés
     ▼                                                          ▼
Page /abonnement <────────────── /api/billing/webhook  <────────┘
                      réconcilie l'abonnement + le portefeuille de crédits
```

- **Aucune clé secrète côté navigateur.** La clé `STRIPE_SECRET_KEY` n'est lue
  que côté serveur (`lib/billing/stripe.ts`). Le paiement se fait sur les pages
  **hébergées par Stripe** (Checkout + Billing Portal) : aucune donnée de carte
  ne transite par Orbs (conformité PCI à la charge de Stripe).
- **Source de vérité = les webhooks Stripe.** L'activation, le renouvellement
  des crédits (cycle de facturation), les changements d'offre, la résiliation et
  l'expiration sont pilotés par les événements Stripe, vérifiés par signature.
- **Pas de SDK.** Comme pour OpenAI et Brevo, on parle à l'API Stripe par de
  simples requêtes HTTPS `fetch` : aucune dépendance supplémentaire, compatible
  avec un proxy HTTPS.
- **Dégradation propre.** Sans configuration Stripe, l'app continue de
  fonctionner. En **développement**, les abonnements sont **simulés** (aucune
  vraie transaction) pour tester tout le parcours ; en **production**, la
  souscription échoue proprement avec un message clair.

## 2. Le portefeuille de crédits (unique)

Un **seul** solde de crédits (`CreditWallet.balance`) finance **toutes** les
consommations d'IA :

| Action | Moteur | Coût par défaut |
| --- | --- | --- |
| Message de chat « moyen » | **Core** (Luna) | 1 crédit |
| Message de chat « poussé » | **Ultra** (Terra) | 9 crédits |
| Génération de fiches par IA | Ultra | 6 crédits |
| Dictée vocale (voix → texte) | — | 2 crédits |
| Lecture à voix haute (texte → voix) | — | 2 crédits |

Les coûts ne sont **pas fixés arbitrairement** : ils sont **dérivés des coûts API
réels** dans `lib/billing/pricing.ts` à partir de (1) prix des modèles
(€/million de tokens), (2) consommation moyenne estimée par action, (3) valeur
d'un crédit. **Tout est configurable** par variables d'environnement (voir
`.env.example`), donc changer un tarif de modèle recalcule tout automatiquement.

### Allocations mensuelles (par défaut, configurables)

| Offre | Prix | Crédits / mois | Coût API plafond* |
| --- | --- | --- | --- |
| Gratuit | 0 € | 300 | 0,60 € |
| **Plus** | 12,99 € | 2 500 | 5,00 € |
| **Ultimate** | 21,99 € | 5 000 | 10,00 € |

\* *Allocation × valeur d'un crédit (0,002 €). Plafond théorique si 100 % des
crédits sont dépensés : la marge réelle est bien supérieure, peu d'utilisateurs
épuisant leur allocation.* Les allocations sont réglables via
`CREDITS_MONTHLY_FREE` / `_PLUS` / `_ULTIMATE`.

### Renouvellement des crédits

- **Comptes payants** : à chaque **cycle de facturation** (webhook `invoice.paid`
  de renouvellement), le solde est **ramené** à l'allocation de l'offre
  (modèle « use-it-or-lose-it », pas de cumul).
- **Comptes gratuits** : rafraîchissement **mensuel « paresseux »** au fil des
  requêtes (aucune tâche planifiée requise).

### Droits par offre

| Droit | Gratuit | Plus | Ultimate |
| --- | --- | --- | --- |
| Moteur **Core** (réflexion moyenne) | ✅ | ✅ | ✅ |
| Moteur **Ultra** (réflexion poussée) | 🔒 | ✅ | ✅ |
| Assistant vocal | ✅ | ✅ | ✅ |
| Fiches par IA | ✅ | ✅ | ✅ |
| Débit IA (req./min · req./jour) | 12 · 300 | 20 · 600 | 30 · 1200 |
| Support prioritaire | — | — | ✅ |

## 3. Configuration externe (⚠️ validation humaine requise)

Ces étapes se font **dans le Dashboard Stripe** par un humain et ne peuvent pas
être automatisées depuis le code. Elles sont nécessaires pour de **vrais
paiements**.

### Étape 1 — Compte Stripe & clés API
1. Créer un compte sur [stripe.com](https://stripe.com).
2. *Developers → API keys* : récupérer la **clé secrète** (`sk_test_…` en test,
   `sk_live_…` une fois le compte activé) → `STRIPE_SECRET_KEY`.
   (La clé **publishable** n'est pas nécessaire : Orbs n'utilise pas Stripe.js.)

### Étape 2 — Produits & Prix (le montant exact est une décision humaine)
1. *Product catalog → Add product* : créer **Orbs Plus**, prix **récurrent
   mensuel 12,99 € EUR** → copier l'identifiant de Price (`price_…`) dans
   `STRIPE_PRICE_PLUS`.
2. Idem **Orbs Ultimate**, **21,99 €/mois** → `STRIPE_PRICE_ULTIMATE`.
3. Vérifier que `SUBSCRIPTION_PLUS_PRICE_EUR` / `_ULTIMATE_PRICE_EUR` (affichage)
   **correspondent** aux montants réels des Price (sinon l'UI mentirait).

### Étape 3 — Webhook
1. *Developers → Webhooks → Add endpoint* : URL
   `https://VOTRE_DOMAINE/api/billing/webhook`.
2. Événements à écouter : `checkout.session.completed`,
   `customer.subscription.created`, `customer.subscription.updated`,
   `customer.subscription.deleted`, `invoice.paid`, `invoice.payment_failed`.
3. Copier le **secret de signature** (`whsec_…`) → `STRIPE_WEBHOOK_SECRET`.

### Étape 4 — Billing Portal
1. *Settings → Billing → Customer portal* : **activer** le portail et autoriser la
   mise à jour du moyen de paiement, l'accès aux factures et la résiliation.

### Étape 5 — Passage en production (validation humaine)
1. Compléter l'**activation du compte** Stripe (informations légales, compte
   bancaire, vérifications KYC) — étape **humaine** obligatoire.
2. Recréer les Produits/Prix et le Webhook en mode **live**, basculer les
   variables sur les clés `live`.
3. Définir `APP_BASE_URL` sur le domaine de production (URLs de retour Checkout).

## 4. Tester en local

### Sans Stripe (simulation)
Laisser `STRIPE_SECRET_KEY` vide et lancer `npm run dev` : la page
**/abonnement** permet de **simuler** une souscription, un changement d'offre,
une résiliation et l'expiration (bouton « Simuler l'expiration »). Aucune vraie
transaction. Idéal pour vérifier la logique de crédits et d'UI.

### Avec Stripe (mode test)
1. Renseigner `STRIPE_SECRET_KEY` (test), `STRIPE_PRICE_*`, et
   `STRIPE_WEBHOOK_SECRET`.
2. Relayer les webhooks en local avec la CLI Stripe :
   ```bash
   stripe listen --forward-to localhost:3000/api/billing/webhook
   ```
   (le `whsec_…` affiché par la commande est celui à mettre dans
   `STRIPE_WEBHOOK_SECRET` pour le dev).
3. Souscrire avec une **carte de test** (`4242 4242 4242 4242`, date future,
   CVC quelconque).

## 5. Sécurité — points clés

- `STRIPE_SECRET_KEY` et `STRIPE_WEBHOOK_SECRET` restent **côté serveur**
  (jamais dans le bundle navigateur, jamais dans Git).
- Le webhook **vérifie la signature** (`lib/billing/stripe.ts →
  verifyWebhookSignature`) avant tout traitement : un POST non signé est rejeté.
- **Idempotence** : chaque `event.id` traité est mémorisé
  (`ProcessedWebhookEvent`) et les octrois de crédits sont indexés sur le début
  de période → rejouer un événement ne double jamais les crédits.
- Les **débits de crédits sont atomiques** (le solde ne peut jamais devenir
  négatif) et **remboursés** si l'appel IA échoue avant d'avoir rendu un résultat.

## 6. Où se trouve quoi (code)

| Fichier | Rôle |
| --- | --- |
| `lib/billing/pricing.ts` | Économie de crédits dérivée des coûts API réels (configurable). |
| `lib/billing/plans.ts` | Offres, droits, allocations, prix, Price Stripe. |
| `lib/billing/stripe.ts` | Client Stripe (fetch) + vérification de signature. **Serveur.** |
| `lib/billing/store.ts` | Portefeuille + cycle de vie de l'abonnement + dépense/remboursement. |
| `lib/billing/webhook.ts` | Traduction des événements Stripe → état local. |
| `app/api/billing/webhook/route.ts` | Réception des webhooks (corps brut + signature). |
| `app/actions/billing.ts` | Server actions : Checkout, Portail, changement d'offre, résiliation. |
| `app/(app)/abonnement/page.tsx` | Comparaison des offres + gestion + jauge de crédits. |
| Routes `app/api/ai/*` | Intégration : droits de l'offre + débit du portefeuille. |
