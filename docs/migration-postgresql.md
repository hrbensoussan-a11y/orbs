# Migration SQLite → PostgreSQL — étude et plan d'exécution

> **Statut : étude (lot 1 d'Orbs 3.0). Aucune migration n'a été exécutée.**
> Le schéma, les migrations et la configuration restent sur SQLite. L'exécution
> (lot 2 bis) requiert une **autorisation explicite** et suit le plan du §6.

## 1. Pourquoi migrer

- **Hébergement de production.** L'application iOS/Android chargera le site Orbs
  depuis un serveur HTTPS unique ; ce serveur a besoin d'une base robuste,
  sauvegardée, accessible depuis plusieurs processus. SQLite est un fichier
  local : pas de connexion réseau, verrou d'écriture global, sauvegardes
  artisanales, aucune haute disponibilité.
- **Concurrence.** Les webhooks Stripe (puis Apple/Google), le streaming IA et
  les actions utilisateur écrivent simultanément. Les transactions
  `$transaction([...])` en mode *batch* ont été choisies précisément pour
  contourner les délais d'attente de SQLite ; PostgreSQL lève cette contrainte.
- **Fournisseurs multiples d'abonnement (lot 5)** : davantage de webhooks
  concurrents, mêmes garanties d'idempotence à tenir.

## 2. État actuel (vérifié le 11 novembre 2026)

| Élément | Constat |
| --- | --- |
| `prisma/schema.prisma` | `datasource db { provider = "sqlite" }` |
| `prisma/migrations/migration_lock.toml` | `provider = "sqlite"` |
| Historique | 7 migrations, 329 lignes de SQL **spécifique à SQLite** (`DATETIME`, `BOOLEAN`, `CREATE TABLE … PRAGMA`-style, redéfinitions de tables) |
| Modèles | 14 : `User`, `Subscription`, `CreditWallet`, `CreditLedger`, `CreditReservation`, `ProcessedWebhookEvent`, `EmailCode`, `FamilyLink`, `Cheer`, `Challenge`, `Settings`, `Entry`, `Tag`, `MediaAttachment` |
| Types utilisés | `String`, `Int`, `Float?`, `Boolean`, `DateTime` ; aucun `Json`, `Bytes`, `BigInt`, `Decimal`, aucun `enum`, aucun attribut `@db.*` |
| Clés | `cuid()` générés par le client, `@updatedAt` géré par le client |
| Index | `@unique` simples et composés (`[userId, cycleKey]`, `[parentId, childId]`, `[userId, name]`), `@@index` |
| Requêtes brutes | **Aucune** (`$queryRaw` / `$executeRaw` absents) |
| Transactions | 2 `$transaction([...])` batch dans `lib/billing/store.ts` ; aucune transaction interactive |
| Tests | `tests/setup/global.ts` **copie `prisma/dev.db`** vers `tests/.tmp/test.db` ; `fileParallelism: false` |
| CI | `.github/workflows/ci.yml` crée `prisma/dev.db` par `prisma migrate deploy` avant `npm test` |
| Variables | `DATABASE_URL="file:./dev.db"` (`.env.example`) |
| Données de production | **Aucune connue** : Stripe non configuré, mode simulation ; pas de déploiement identifié |

## 3. Inventaire des points de vigilance (audit du code)

| # | Point | Où | Impact PostgreSQL | Action prévue |
| --- | --- | --- | --- | --- |
| 1 | **Historique de migrations lié à SQLite.** Prisma n'autorise qu'un fournisseur par historique (`migration_lock.toml`). | `prisma/migrations/*` | Les migrations existantes **ne doivent jamais** être rejouées sur PostgreSQL. | Nouvelle **baseline** unique (`init_postgresql`), ancien historique archivé (voir §6). |
| 2 | **Recherche `contains` sensible à la casse.** SQLite `LIKE` ignore la casse (ASCII) ; PostgreSQL `LIKE` la respecte. | `lib/entries.ts:68` (`title`/`content`) | Régression UX : « maths » ne trouverait plus « Maths ». | Ajouter `mode: "insensitive"` (supporté par PostgreSQL, pas par SQLite → à faire **au moment** de la bascule). |
| 3 | `startsWith: "spend_"` | `lib/billing/store.ts:239` | Préfixe exact, insensible à la casse inutile. | Aucun. |
| 4 | **Index unique avec `NULL`** (`cycleKey` nul hors octroi). | `CreditLedger @@unique([userId, cycleKey])` | PostgreSQL autorise plusieurs `NULL` dans un index unique (`NULLS DISTINCT` par défaut) — **identique** à SQLite. L'idempotence des octrois est préservée. | Re-tester (tests existants). |
| 5 | **Violation d'unicité `P2002`** | `isUniqueViolation`, `getOrCreateWallet`, `grantCycleOnce` | Même code d'erreur Prisma. En PostgreSQL une erreur **annule toute la transaction** : déjà le comportement voulu (batch). | Aucun. |
| 6 | **Transactions batch** | `lib/billing/store.ts:327, 396` | Fonctionnent ; les délais d'attente SQLite disparaissent. Les transactions interactives redeviennent possibles si besoin. | Aucun (ne pas réintroduire d'interactif sans raison). |
| 7 | **Types de colonnes** | tout le schéma | `DateTime` → `timestamp(3)`, `Boolean` natif, `Float` → `double precision`, `Int` → `integer`, `String` → `text`. Aucune perte. | Aucun. |
| 8 | **Tri des chaînes** | `lib/entries.ts:91` (`Tag.name asc`) | Collation PostgreSQL (`en_US.UTF-8` ou `C`) ≠ ordre binaire SQLite : ordre des accents/majuscules peut varier légèrement. | Choisir la collation `fr_FR.UTF-8`/`und-x-icu` à la création de la base si l'ordre importe ; sinon accepter. |
| 9 | **E-mail unique** | `User.email @unique` | Les e-mails sont déjà normalisés en minuscules (`app/actions/auth.ts`), donc l'unicité sensible à la casse de PostgreSQL ne change rien. | Aucun. |
| 10 | **Tests sur copie de `dev.db`** | `tests/setup/global.ts`, `vitest.config.ts` | Impossible avec PostgreSQL. | Nouveau `globalSetup` : `prisma migrate reset --force --skip-seed` (ou `migrate deploy` + nettoyage) sur une base `orbs_test` ; garder `fileParallelism: false`. |
| 11 | **CI** | `.github/workflows/ci.yml` | Le job `test` doit disposer d'un PostgreSQL. | Service GitHub Actions `postgres:16` (+ `pg_isready`), `DATABASE_URL` de test. |
| 12 | **Développement local** | `.env.example`, README | Un seul fournisseur possible : le dev passe aussi sur PostgreSQL. | `docker compose` (service `postgres:16`, volume) + scripts `db:up` / `db:down` ; alternative : base de dev managée gratuite. |
| 13 | **Pool de connexions** | `lib/prisma.ts` (singleton ✓) | Prisma ouvre par défaut `num_cpus × 2 + 1` connexions ; serveurs *serverless* → épuisement. | Hébergement Node persistant recommandé (déjà requis par le rate limit en mémoire et les flux IA). Si *pooler* (PgBouncer, Neon, Supabase) : `connection_limit`, `pgbouncer=true`, et `directUrl` pour `prisma migrate`. |
| 14 | **TLS** | `DATABASE_URL` | Bases managées exigent `sslmode=require`. | Documenter l'URL type (voir §5). |
| 15 | **Sauvegardes / restauration** | exploitation | `pg_dump` / sauvegardes automatiques du fournisseur, rétention, test de restauration. | Choisir un fournisseur avec sauvegardes quotidiennes et *point-in-time recovery*. |
| 16 | **Prisma 6 → 7 (futur)** | `package.json` | Prisma 7 change le client (adaptateurs pilote). Hors périmètre. | Rester en Prisma 6 pour la migration ; évaluer Prisma 7 séparément. |
| 17 | **README** | `README.md:17` « prêt pour Postgres en une ligne » | Inexact : la ligne du `provider` ne suffit pas (points 1, 2, 10–12). | Mettre à jour au moment de la bascule. |

Conclusion de l'audit : **le code applicatif est quasiment agnostique**. Les
seuls changements de code nécessaires sont le `mode: "insensitive"` de la
recherche et le `globalSetup` des tests ; tout le reste est de la configuration,
de l'historique de migrations et de l'exploitation.

## 4. Choix d'hébergement (à décider, lot 0)

Critères : région **UE** (RGPD, public mineur), sauvegardes automatiques,
TLS, tarif de départ faible, compatibilité Prisma sans adaptateur.

| Option | Remarques |
| --- | --- |
| PostgreSQL managé du même hébergeur que l'app (Scaleway, OVHcloud, Railway, Fly.io, Render) | Latence minimale app ↔ base, facturation unique. Recommandé si l'app tourne sur une instance Node persistante. |
| Neon / Supabase (Postgres managé, région UE disponible) | Très rapide à démarrer, *pooler* intégré → prévoir `directUrl` pour les migrations. |
| PostgreSQL auto-hébergé (VPS) | Moins cher, mais sauvegardes et mises à jour à notre charge. Déconseillé au départ. |

## 5. Cible de configuration (ne pas appliquer avant autorisation)

```prisma
// prisma/schema.prisma — cible
datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")
  // directUrl = env("DIRECT_URL") // seulement derrière un pooler (PgBouncer, Neon, Supabase)
}
```

```ini
# .env — exemples (valeurs fictives)
DATABASE_URL="postgresql://orbs:motdepasse@localhost:5432/orbs?schema=public"
# Production (base managée) :
# DATABASE_URL="postgresql://USER:PASSWORD@HOST:5432/orbs?schema=public&sslmode=require&connection_limit=10"
# DIRECT_URL="postgresql://USER:PASSWORD@HOST-DIRECT:5432/orbs?schema=public&sslmode=require"
```

```yaml
# docker-compose.yml — développement local (cible)
services:
  db:
    image: postgres:16
    environment:
      POSTGRES_USER: orbs
      POSTGRES_PASSWORD: orbs
      POSTGRES_DB: orbs
    ports: ["5432:5432"]
    volumes: ["orbs-pg:/var/lib/postgresql/data"]
volumes:
  orbs-pg: {}
```

```yaml
# .github/workflows/ci.yml — job test (cible)
services:
  postgres:
    image: postgres:16
    env: { POSTGRES_USER: orbs, POSTGRES_PASSWORD: orbs, POSTGRES_DB: orbs_test }
    ports: ["5432:5432"]
    options: >-
      --health-cmd pg_isready --health-interval 5s --health-timeout 5s --health-retries 10
env:
  DATABASE_URL: postgresql://orbs:orbs@localhost:5432/orbs_test?schema=public
```

```ts
// tests/setup/global.ts — cible
// Remplace la copie de dev.db : (re)crée le schéma dans la base de test.
execSync("npx prisma migrate reset --force --skip-seed", { stdio: "inherit" });
```

## 6. Plan d'exécution proposé

### Option A — base neuve (recommandée : aucune donnée de production à conserver)

1. **Décisions** : hébergeur + région, création de la base de production et d'une
   base de test, secrets dans l'environnement d'hébergement (jamais dans Git).
2. **Branche dédiée** `feat/postgresql`, CI verte comme point de départ.
3. `prisma/schema.prisma` : `provider = "postgresql"` (+ `directUrl` si pooler).
4. **Nouvel historique** : déplacer `prisma/migrations/` vers
   `prisma/migrations-sqlite-archive/` (lecture seule, mémoire du projet) ;
   `npx prisma migrate dev --name init_postgresql` contre la base locale Docker →
   une seule migration `init_postgresql` + nouveau `migration_lock.toml`.
5. **Code** : `mode: "insensitive"` dans `lib/entries.ts` ; `tests/setup/global.ts`
   → `migrate reset` ; `vitest.config.ts` → `DATABASE_URL` de test (plus de
   fichier `.db`).
6. **Outillage** : `docker-compose.yml`, scripts `db:up`/`db:down`, `.env.example`,
   README (mise en route, suppression de « en une ligne »), CI (service Postgres,
   `prisma migrate deploy` conservé).
7. **Validation** : `npm run typecheck`, `npm run lint`, `npm test` (les tests de
   simultanéité des webhooks s'exécutent désormais avec une **vraie**
   concurrence : vérifier qu'au plus un octroi par période subsiste), `npm run
   build`, fumée HTTP comme au lot 1, recherche insensible à la casse vérifiée à
   la main.
8. **Production** : `npx prisma migrate deploy` au déploiement (jamais `migrate
   dev` ni `db push` en production), vérification des sauvegardes.

Effort : **1–2 jours**.

### Option B — avec données existantes

Si une instance SQLite est déjà utilisée par de vrais utilisateurs :

1. Option A, puis **gel des écritures** (page de maintenance) le temps du transfert.
2. Script ponctuel `scripts/migrate-sqlite-to-postgres.ts` : lecture via un client
   Prisma généré sur l'ancien schéma SQLite, écriture via le nouveau client, en
   respectant l'ordre des clés étrangères : `User` → `Settings`, `Subscription`,
   `CreditWallet` → `CreditLedger`, `CreditReservation` → `Entry` → `Tag`,
   `MediaAttachment` → `FamilyLink`, `Cheer`, `Challenge` → `EmailCode`,
   `ProcessedWebhookEvent`. Identifiants `cuid` conservés tels quels.
3. **Contrôles** : comptages par table identiques, sommes des `CreditLedger.delta`
   égales aux `CreditWallet.balance`, unicités respectées, échantillon d'entrées
   comparé.
4. Bascule de `DATABASE_URL`, levée du gel, conservation de l'ancien fichier
   SQLite chiffré pendant 30 jours puis suppression.

Effort : **2–4 jours**. Alternative sans code : `pgloader` (nécessite une
correspondance de types manuelle ; moins contrôlable).

## 7. Risques et parades

| Risque | Parade |
| --- | --- |
| Rejouer l'historique SQLite sur PostgreSQL | Archivage de l'ancien historique, `migration_lock.toml` régénéré, CI qui exécute `migrate deploy` sur PostgreSQL. |
| Régression de la recherche (casse) | `mode: "insensitive"` + vérification manuelle dans le plan de validation. |
| Épuisement du pool de connexions | Instance Node persistante, `connection_limit`, singleton Prisma conservé. |
| Latence app ↔ base | Même région / même fournisseur. |
| Perte de données (option B) | Gel des écritures, contrôles de comptage, conservation de l'ancien fichier. |
| Secrets de connexion | Variables d'environnement de l'hébergeur uniquement ; `.env*` déjà ignoré par Git. |

## 8. Critères d'acceptation de la migration

- [ ] `provider = "postgresql"`, un seul historique de migrations, CI verte sur
      PostgreSQL (typecheck, lint, 23+ tests, build).
- [ ] Recherche d'entrées insensible à la casse.
- [ ] Tests de rejeu et de simultanéité des webhooks verts avec une vraie
      concurrence.
- [ ] Déploiement de production : `migrate deploy` exécuté, sauvegardes
      automatiques actives et restauration testée une fois.
- [ ] README, `.env.example`, `docs/abonnements.md` (section « Tester en
      local ») mis à jour.

## 9. Questions ouvertes (à trancher avant d'exécuter)

1. Existe-t-il aujourd'hui des **données réelles** à conserver (option A ou B) ?
2. Quel **hébergeur / région** pour l'application et la base ?
3. Faut-il un **pooler** (serverless) ou une instance Node persistante (recommandée) ?
4. Collation souhaitée pour le tri des libellés (par défaut acceptable) ?
