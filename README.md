# Orbs

Assistant scolaire pour élève, en un seul endroit : **scolarité** (Pronote /
École Directe), **mode IA**, **apprendre** (réviser cours & définitions),
**journal** et **agenda/tâches**. Style **glassmorphism « Verre & Jardin »**
(voir [`direction-artistique.md`](./direction-artistique.md)).

> État actuel : le **shell** (accueil + navigation) et le **journal** sont en
> place et **fonctionnels**. Les modules **Apprendre / IA / Agenda** sont des
> écrans **de préparation** (non fonctionnels). La **scolarité** (Pronote) et
> l'**IA** sont portées par l'équipe IA.

## Stack

- **Next.js 16** (App Router) · **React 19** · **TypeScript**
- **Tailwind CSS v4** + socle de la direction artistique (tokens, verre, motion)
- **Prisma 6** + **SQLite** en dev (schéma prêt pour Postgres en une ligne)
- Auth : sessions signées (`jose`) + cookies httpOnly + `bcrypt`
- Icônes **Lucide** · polices **General Sans** + **Clash Grotesk** (Fontshare)

## Mise en route

```bash
npm install
cp .env.example .env         # puis SESSION_SECRET : openssl rand -base64 32
npx prisma migrate dev
npm run dev                  # http://localhost:3000
```

## Navigation (barre en verre, en bas)

| Onglet | Route | État |
| --- | --- | --- |
| Menu (accueil) | `/accueil` | Maquette (données scolarité = équipe Pronote) |
| Apprendre | `/apprendre` | En préparation |
| IA | `/ia` | En préparation (équipe IA) |
| Journal | `/timeline` | **Fonctionnel** |
| Agenda | `/agenda` | En préparation |

## Le module Journal (fonctionnel)

- Comptes (inscription / connexion), isolation stricte par utilisateur
- Écriture plein écran, **sauvegarde automatique** (+ filet localStorage),
  prompt suggéré ignorable, métadonnées repliées (humeur, tags, lieu, date)
- Timeline (épinglées, regroupement par mois), lecture Markdown, favori/épingle,
  édition en un tap, suppression confirmée
- Recherche plein texte + filtres (humeur, tag, période)
- **Export libre** (JSON + Markdown)

## Direction artistique

Le contrat visuel complet est dans [`direction-artistique.md`](./direction-artistique.md).
Le socle (tokens de couleur, verre `.glass`, rayons, ombres, motion, fond vivant)
est dans `app/globals.css`. Fond pastel « mesh » animé lentement + grain +
vignette ; surfaces en verre dépoli ; vert `#38C172` en couleur primaire.

## Modèle de données

`prisma/schema.prisma` — `User`, `Settings`, `Entry` (contenu, humeur, tags,
lieu, favori/épinglé, verrou, trackers…), `Tag`, `MediaAttachment`.

## Sécurité — état et suite

Mots de passe hachés (bcrypt), sessions signées httpOnly, isolation par
utilisateur, export libre. **Pas encore de chiffrement de bout en bout** : prévu
plus tard (le serveur peut lire les entrées aujourd'hui). L'export reste la
meilleure sauvegarde.

## Notes

`AGENTS.md` / `CLAUDE.md` sont maintenus par `next dev` (règles Next.js 16).
