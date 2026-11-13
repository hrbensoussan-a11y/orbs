# Orbs 3.0 — Plan global : application iOS & Android (Capacitor)

> Document de pilotage du chantier « Orbs 3.0 ». Il consigne l'architecture
> retenue, les décisions prises, l'ordre des lots et les fonctionnalités natives
> prévues. Il est mis à jour à chaque lot. État au 11 novembre 2026 : **lot 1 en
> cours**, Capacitor **non installé** (volontairement).

## 1. Vision et principes

1. **Le site web reste le produit principal et reste inchangé.** Orbs 3.0
   ajoute une application iOS/Android *autour* du site, jamais à sa place.
2. **Une seule base de code, une seule origine HTTPS.** L'application est une
   coque Capacitor (WebView native) qui charge le site Orbs déployé
   (`server.url`). Pages serveur, actions serveur, cookies de session, flux IA :
   tout fonctionne tel quel, `localStorage` reste sur une seule origine.
3. **Le natif est additif et isolé.** Tout code qui parle à iOS/Android passe
   par un module unique `lib/native/` (import dynamique de `@capacitor/*`
   derrière `isNative()`). Sur le web, chaque fonction est un no-op ou retombe
   sur le comportement actuel.
4. **Les évolutions web et app sont indépendantes.** Le web se déploie en
   continu et apparaît immédiatement dans l'app ; une soumission aux stores
   n'est nécessaire que pour un changement natif (plugin, permission, icône).
5. **Parité des abonnements.** Orbs Pro et Orbs Ultimate : mêmes prix
   (12,99 € et 21,99 €/mois) et mêmes avantages sur le site (Stripe), sur
   l'App Store et sur Google Play (achats intégrés). Le fonctionnement actuel
   des abonnements n'est pas modifié tant que le lot 5 n'est pas lancé.
6. **Chaque lot est livrable seul, site toujours vert** (CI obligatoire).

## 2. Décisions actées

| Date | Décision |
| --- | --- |
| 2026-11-11 | Architecture **C — coque distante d'abord** (voir §3), fondations préparant une éventuelle coque statique plus tard. |
| 2026-11-11 | Offres commerciales : **Orbs Pro** (12,99 €/mois, 2 500 crédits) et **Orbs Ultimate** (21,99 €/mois, 5 000 crédits). Le code libelle encore l'offre à 12,99 € « Orbs Plus » (identifiant interne `plus`, `lib/billing/plans.ts`) : le **renommage du libellé** est prévu au lot 2 ; l'identifiant interne `plus` et le fonctionnement restent inchangés (Stripe, BDD, tests). |
| 2026-11-11 | Lot 1 autorisé : CI GitHub Actions, étude PostgreSQL **sans migrer**, vérification du site, plan global. Pas d'installation de Capacitor. |
| 2026-11-11 | Fonctionnalités natives ajoutées au plan : **notifications Orbs Premium**, **Orbs Widget Studio** personnalisable, **Apple Watch** (phase ultérieure). |
| à décider | Achats intégrés : option **A** RevenueCat (recommandée) ou **B** intégration directe App Store Server API + Play Developer API. |
| à décider | Hébergeur et domaine de production, région UE (RGPD, public mineur), PostgreSQL managé. |
| à décider | Comptes développeur Apple / Google, identifiant de bundle (ex. `app.orbs.mobile`), cible d'âge et politique Familles. |

## 3. Architecture cible (résumé)

```
┌──────────────────────────── Serveur Orbs (Node 22, next start, HTTPS) ────────────────────────────┐
│ Next.js 16 : pages serveur · actions · /api/* (IA, entrées, export, webhooks) · Prisma → Postgres │
│ Détection de plateforme (User-Agent « OrbsApp/… ») → variante web (Stripe) ou app (IAP)          │
└───────────────┬──────────────────────────────┬──────────────────────────────┬────────────────────┘
                │ navigateur                   │ WebView Capacitor (server.url)│ API par jeton
        ┌───────┴──────┐              ┌────────┴────────┐              ┌───────┴───────┐
        │  Site web    │              │  App iOS/Android │              │ Apple Watch,  │
        │  (inchangé)  │              │  lib/native/ →   │              │ widgets (natif│
        └──────────────┘              │  plugins natifs  │              │ Swift/Kotlin) │
                                      └─────────────────┘              └───────────────┘
```

- **Disposition** : `capacitor.config.ts`, `ios/`, `android/` à la racine du dépôt,
  dépendances `@capacitor/*` dans le `package.json` racine (une seule source de
  versions). `next build` ignore ces dossiers.
- **Page hors-ligne embarquée** (dossier `webDir` minimal) affichée si le serveur
  est injoignable.
- **Périmètre de navigation** : `allowNavigation` limité au domaine Orbs ;
  Stripe, portail et liens externes via `@capacitor/browser` ; retour dans l'app
  par Universal Links / App Links (`/.well-known/`).
- **Contrat app ↔ web** : la coque envoie sa version dans le User-Agent ; le
  serveur peut afficher « mise à jour requise » si une rupture devient inévitable.
- **Abonnements multi-fournisseurs** : colonnes additives `provider`,
  `providerSubscriptionId`, `providerProductId` sur `Subscription` ;
  `applySubscriptionState` reste l'unique porte d'entrée ; l'idempotence par
  période `(userId, cycleKey)` s'applique telle quelle aux renouvellements
  Apple/Google. Un seul abonnement actif par utilisateur, quel que soit le canal.

Le détail de l'audit (compatibilités, incompatibilités, exigences des stores)
est dans l'historique du projet ; ce document n'en garde que les conséquences.

## 4. Fonctionnalités natives prévues

### 4.1 Notifications Orbs Premium

**Intention.** Des notifications riches et fiables, qui fonctionnent app fermée,
avec l'identité sonore d'Orbs : rappels de cours et de devoirs de l'agenda,
rappels de révision (Apprendre), encouragements et défis de l'espace famille,
alertes d'abonnement et de crédits. Les 8 sonneries actuelles (synthétisées en
Web Audio) deviennent de vrais sons de notification.

**Pourquoi « natif » est obligatoire.** L'API Web `Notification` n'existe ni
dans WKWebView ni dans la WebView Android : le planificateur actuel
(`components/agenda/NotificationScheduler.tsx`, `lib/agenda/notifications.ts`)
ne peut rien afficher dans l'app, et rien ne se passe app fermée.

**Technique.**
- **Locales** (`@capacitor/local-notifications`) : planification glissante des
  prochains rappels à chaque modification de l'agenda et à chaque reprise de
  l'app (limite iOS : 64 notifications en attente) ; permission Android 13+ ;
  alarmes exactes à justifier auprès de Google Play.
- **Sons** : sonneries pré-rendues en fichiers (iOS `.caf` ≤ 30 s ; Android
  `res/raw`) + **un canal de notification par sonnerie** (Android 8+) ; le
  réglage « silence » devient un canal muet.
- **Push** (`@capacitor/push-notifications`, APNs + FCM) pour tout ce qui vient
  du serveur (famille, facturation, rappels de révision calculés côté serveur) :
  nouveau modèle Prisma `PushDevice` (jeton, plateforme, userId), pipeline
  d'envoi, demande de permission contextuelle (iOS ne la pose qu'une fois).
- **Préférences serveur** (type de rappel, sonnerie, heures calmes) pour que les
  réglages suivent l'utilisateur d'un appareil à l'autre.

**Hypothèse à valider.** « Premium » = réservé (ou enrichi) pour les abonnés
Pro/Ultimate — par exemple sonneries exclusives, rappels de révision intelligents
et encouragements famille en push — tandis que les rappels d'agenda de base
restent disponibles à tous. À confirmer avant le lot 4.

**Lots** : locales au **lot 4**, push au **lot 7**. Effort : 3–4 j (locales +
sons + canaux) puis 5–8 j (push + serveur).

### 4.2 Orbs Widget Studio (personnalisable)

**Intention.** Des widgets d'écran d'accueil (et d'écran verrouillé / StandBy
sur iOS) que l'élève compose lui-même dans l'app : choix des **modules**
(prochain cours, devoirs du jour, série de révision, minuteur de concentration,
humeur du jour, progression Apprendre, crédits IA restants, citation/encouragement
du parent), de la **taille**, du **thème** (tokens de la direction artistique,
verre, couleurs de matière) et du **lien** ouvert au toucher.

**Pourquoi « natif » est obligatoire.** Les widgets ne peuvent pas être rendus
par une WebView : iOS impose **WidgetKit (SwiftUI)**, Android **Glance /
AppWidget (Kotlin)**. C'est, avec l'Apple Watch, le seul poste de **code natif
écrit à la main** du projet.

**Technique.**
- **Studio** (web, dans l'app) : éditeur de configuration en React, conforme à la
  DA ; la configuration est enregistrée côté serveur (préférences utilisateur)
  et poussée au natif.
- **Pont** : mini-plugin Capacitor `OrbsWidgets` (Swift + Kotlin) qui écrit les
  données et la configuration dans l'**App Group** (iOS) / `SharedPreferences`
  (Android) et déclenche le rafraîchissement (`WidgetCenter.reloadTimelines`,
  `AppWidgetManager.updateAppWidget`).
- **Rendu natif** : un moteur de rendu par plateforme qui interprète la
  configuration (modules, taille, thème) — pas un widget par module, pour que le
  Studio reste extensible.
- **Données** : alimentées par l'app à chaque ouverture et en arrière-plan via
  l'**API par jeton** (lot 2) ; budget de rafraîchissement WidgetKit limité
  (≈ 40–70 rafraîchissements/jour) → planification des *timelines*.
- **Liens profonds** du widget vers la page concernée (agenda, apprendre, ia).

**Prérequis** : coque Capacitor (lot 3), API par jeton (lot 2), stockage local
rendu durable et lisible par le natif (lot 4).

**Lot** : **lot 7** (après la première publication). Effort : 15–25 j (iOS +
Android, Studio compris). Complexité **élevée**.

### 4.3 Apple Watch (phase ultérieure)

Pas de WebView sur watchOS, pas de cible watchOS dans Capacitor : application
**native SwiftUI** ajoutée au projet Xcode généré, données via **WatchConnectivity**
(mini-plugin) ou l'API par jeton, complications via WidgetKit (mutualisées avec
le Widget Studio). MVP : prochain cours, devoirs du jour, série, minuteur de
concentration, humeur rapide. **Lot 8**, 15–25 j, après la cible iOS et l'API
par jeton.

## 5. Lots et ordre d'exécution

Chaque lot = une ou plusieurs PR livrables seules, site toujours vert.

| Lot | Contenu | État |
| --- | --- | --- |
| **0** | Décisions (nom des offres, IAP A/B, hébergeur, comptes développeur, bundle id, cible d'âge). | Partiellement acté (§2) |
| **1 — Garde-fous** | CI GitHub Actions (typecheck, lint, tests, build) · étude PostgreSQL (`docs/migration-postgresql.md`) · vérification du site · ce plan. | **En cours** |
| **2 — Fondations web** | `proxy.ts` : exclure `/.well-known/` + fichiers d'association · **suppression de compte** · session glissante · `lib/platform.ts` + squelette `lib/native/` (no-ops web) · **API par jeton** (Watch, widgets, futur) · renommage du libellé « Orbs Pro » · polices auto-hébergées (optionnel). | À venir |
| **2 bis — PostgreSQL** | Exécution de la migration étudiée au lot 1 (**autorisation explicite requise**). | À venir |
| **3 — Coque Capacitor** | Installation (`@capacitor/core`, CLI, iOS, Android), `capacitor.config.ts` (URL par environnement, `appendUserAgent`, `allowNavigation`), page hors-ligne, icônes/splash, StatusBar + edge-to-edge Android, Keyboard, App (`backButton`, `appUrlOpen`), permissions, tests simulateurs + appareils. | À venir (après autorisation) |
| **4 — Branches natives** | Export → Filesystem + Share · liens externes/Stripe → Browser · verrou PIN → biométrie · **notifications Orbs Premium (locales + sons + canaux)** · durabilité du stockage local (`@capacitor/preferences`). | À venir |
| **5 — Abonnements** | Migration additive `Subscription` (fournisseur) · webhook IAP → `applySubscriptionState` · variante app de `/abonnement` (achat natif, « Restaurer mes achats », gestion via le store) · variante web inchangée · tests (idempotence, exclusivité inter-fournisseurs, rejeu). | À venir |
| **6 — Conformité & soumission** | Produits dans App Store Connect / Play Console, confidentialité (mineurs), classification d'âge, Data safety, compte de démonstration, TestFlight + test fermé Play, review. | À venir |
| **7 — Natif avancé** | **Push** (APNs/FCM, `PushDevice`) · **Orbs Widget Studio**. | Phase ultérieure |
| **8 — Apple Watch** | Cible SwiftUI, WatchConnectivity, complications. | Phase ultérieure |

### Lot 1 — détail (réalisé)

- `.github/workflows/ci.yml` : quatre vérifications parallèles (typecheck, lint,
  test, build) sur chaque push et pull request, Node 22, `npm ci`, base SQLite
  jetable créée par `prisma migrate deploy` pour les tests, variables factices
  (aucun secret). Validé en simulation sur un checkout propre (sans `.env`, sans
  `prisma/dev.db`).
- `package.json` : `typecheck` = `next typegen && tsc --noEmit` (Next 16 génère
  les types de routes `PageProps`/`LayoutProps`/`RouteContext` ; sans `typegen`,
  `tsc` échoue sur un clone frais).
- `docs/migration-postgresql.md` : étude et plan d'exécution de la migration
  SQLite → PostgreSQL, **non exécutée**.
- Vérification du site : typecheck, lint, 131 tests (23 facturation + 108 agenda/IA
  arrivés en parallèle sur la branche), `next build`, serveur de
  production + fumée HTTP (redirections, 401 des API, webhook non configuré →
  503), rendu de `/login`, `/register` et redirection de `/accueil` dans Chromium
  sans erreur console.

## 6. Règles d'ingénierie du chantier

1. **Web d'abord** : aucune fonctionnalité ne doit régresser sur le site ; toute
   branche native est derrière `isNative()` et dispose d'un repli web.
2. **Pas de `output: 'export'`**, pas de réécriture des pages serveur.
3. **Migrations additives** avec valeurs par défaut ; jamais de suppression de
   colonne pendant le chantier.
4. **Secrets côté serveur uniquement** ; un bundle mobile est extractible.
5. **Tests** : tout nouveau comportement de facturation est couvert par des tests
   d'idempotence (rejeu, simultanéité), comme pour Stripe.
6. **Une PR par lot** (ou par sous-lot), CI verte obligatoire avant fusion.
7. **Autorisation explicite** avant : migration de base de données, installation
   de Capacitor, création de produits dans les stores, toute action payante.

## 7. Risques suivis

- Politique Apple 3.1.1 / Google Play Billing : achats intégrés obligatoires pour
  les abonnements dans l'app (commission 15–30 %) ; exceptions régionales à
  surveiller.
- Review Apple 4.2 (« site dans une coque ») : atténuée par notifications,
  biométrie, partage natif, liens profonds, widgets.
- Public mineur : classification d'âge, politique Familles, consentement parental
  (RGPD, 15 ans en France).
- Application *online-only* : page hors-ligne embarquée indispensable.
- Hébergement : rate limit en mémoire (`lib/ai/ratelimit.ts`) et flux IA de 60 s
  → instance Node persistante (ou Redis) ; PostgreSQL managé en région UE.
- Code natif (widgets, Watch) : compétences Swift/Kotlin, Mac + Xcode, cadences
  annuelles Apple/Google (SDK, `targetSdk`, pages mémoire 16 Ko).

## 8. Estimations

| Lot | Effort indicatif |
| --- | --- |
| 1 Garde-fous | 2–4 j (réalisé en 1 j hors migration) |
| 2 Fondations web (+ 2 bis PostgreSQL) | 4–6 j (+ 1–4 j) |
| 3 Coque Capacitor | 5–8 j |
| 4 Branches natives (dont notifications locales Premium) | 6–9 j |
| 5 Abonnements (option A RevenueCat / option B direct) | 8–12 j / 15–25 j |
| 6 Conformité & soumission | 6–11 j |
| **Première publication** | **≈ 7–10 semaines** |
| 7 Push + Orbs Widget Studio | 5–8 j + 15–25 j |
| 8 Apple Watch | 15–25 j |

Estimations pour un développeur maîtrisant la base ; les marges hautes couvrent
les itérations de review et les tests sur appareils réels.
