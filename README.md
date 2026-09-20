# Orbs — journal

Un carnet calme pour écrire chaque jour. La boussole du produit : **minimiser la
friction pour écrire et pour revenir**. L'interface s'efface devant l'écriture.

Ce dépôt contient la **Phase 1 (MVP)**, fonctionnelle et testée.

## Stack

- **Next.js 16** (App Router) + **React 19** + **TypeScript**
- **Tailwind CSS v4** (thème clair/sombre piloté par classe)
- **Prisma 6** + **SQLite** en développement
- Authentification par **sessions signées (`jose`) + cookies httpOnly + `bcrypt`**
- **Markdown** léger (`react-markdown`) pour l'écriture et la lecture

### Deux adaptations assumées par rapport au brief

1. **Base de données.** SQLite en dev (zéro configuration, tourne partout). Le
   schéma est écrit pour basculer vers **Postgres** en changeant une seule ligne
   dans `prisma/schema.prisma` (`provider = "sqlite"` → `"postgresql"`) et
   `DATABASE_URL`. Aucun enum natif ni type spécifique n'a été utilisé.
2. **Authentification.** Le brief suggérait NextAuth/Auth.js. Ces bibliothèques
   ne sont pas fiables sur Next 16 + React 19 aujourd'hui. On utilise donc le
   **pattern d'authentification officiel de Next.js** (sessions `jose`), plus
   simple et sans couplage de version. Migrer vers Auth.js reste possible plus tard.

## Mise en route

```bash
# 1. Dépendances
npm install

# 2. Variables d'environnement
cp .env.example .env
# puis éditer .env et générer un secret :
#   openssl rand -base64 32   ->  SESSION_SECRET

# 3. Base de données (crée le fichier SQLite + applique les migrations)
npx prisma migrate dev

# 4. Démarrer
npm run dev
# http://localhost:3000
```

### Scripts

| Script              | Rôle                                            |
| ------------------- | ----------------------------------------------- |
| `npm run dev`       | Serveur de développement                        |
| `npm run build`     | Build de production (+ vérification TypeScript)  |
| `npm start`         | Serveur de production                           |
| `npm run typecheck` | Vérification des types seule                     |
| `npm run db:migrate`| Crée/applique une migration                      |
| `npm run db:studio` | Explorateur de base Prisma                       |

## Ce qui est livré (Phase 1)

- Inscription / connexion / déconnexion (comptes, mots de passe hachés)
- **Écran d'écriture** plein écran, sans distraction :
  - **sauvegarde automatique** continue (débattue), + filet localStorage tant
    que l'entrée n'est pas encore créée (ne jamais perdre ce qui est écrit) ;
  - prompt suggéré en haut, **ignorable** ;
  - métadonnées repliées : humeur (1–5 + emoji), tags, lieu, date.
- **Timeline** : accueil chronologique, invitation « écrire aujourd'hui »,
  entrées épinglées, regroupement par mois, aperçu (titre, extrait, humeur, date).
- **Lecture d'une entrée** : rendu Markdown, favori / épingle, édition en un tap,
  suppression avec confirmation.
- **Recherche** plein texte + filtres (humeur, tag, période).
- **Thème sombre** (idéal pour l'écriture du soir).
- **Export libre** des données (JSON + Markdown), jamais bloqué.

## Modèle de données

`prisma/schema.prisma` — `User`, `Settings` (préférences), `Entry` (contenu,
titre, dates, humeur, tags, lieu, météo, favori/épinglé, verrou, trackers), `Tag`,
`MediaAttachment`. Certains champs (météo, trackers, verrou PIN, médias) sont déjà
dans le schéma mais leur interface arrive en Phase 2/3.

## Sécurité & confidentialité — état et feuille de route

Aujourd'hui : mots de passe hachés (bcrypt), sessions signées httpOnly, isolation
stricte par utilisateur (chaque entrée vérifie son propriétaire), export libre.

**Important — pas encore de chiffrement de bout en bout.** Le serveur peut lire
les entrées. Le E2E (AES-256 côté client, clé dérivée du secret utilisateur), le
verrou par PIN/biométrie et la stratégie de récupération sont prévus en **Phase 3**
(voir ci-dessous). L'export reste, en attendant, la meilleure sauvegarde.

## Feuille de route

- **Phase 1 — MVP** ✅ (ce livrable)
- **Phase 2** — prompts guidés complets, rappels configurables, streaks,
  insights/heatmap de régularité, « il y a un an ».
- **Phase 3** — chiffrement E2E, verrou PIN/biométrie & récupération, médias /
  dictée vocale, templates, offline-first complet, (éventuellement) couche IA.

## Notes

`AGENTS.md` / `CLAUDE.md` sont maintenus par `next dev` (règles Next.js 16) et
volontairement conservés dans le dépôt.
