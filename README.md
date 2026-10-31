# Orbs

Assistant scolaire pour élève, en un seul endroit : **scolarité** (Pronote /
École Directe), **mode IA**, **apprendre** (réviser cours & définitions),
**journal** et **agenda/tâches**. Style **glassmorphism « Verre & Jardin »**
(voir [`direction-artistique.md`](./direction-artistique.md)).

> État actuel : le **shell** (accueil + navigation) et le **journal** sont en
> place et **fonctionnels**, ainsi que **Apprendre**, **Journal** et le
> **mode IA** (assistant OpenAI). Le module **Agenda** et la **scolarité**
> (Pronote) restent en préparation.

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
| Apprendre | `/apprendre` | **Fonctionnel** (5 types de fiches) |
| IA | `/ia` | **Fonctionnel** (assistant OpenAI, clé serveur requise) |
| Journal | `/timeline` | **Fonctionnel** |
| Agenda | `/agenda` | En préparation |

## Le module Apprendre (fonctionnel)

Moteur de révision **local** (localStorage, aucun compte/serveur), style DA.

- Paquets par matière ; création en **collant un cours** (détection du
  séparateur) ou à la main ; favoris, édition, suppression.
- Planificateur **répétition espacée SM-2** (grade/intervalles, file des dues).
- **5 types de fiches**, chacun avec ses activités :
  - **Définitions** : révision intelligente, recto-verso, QCM, écrire, associer,
    vrai/faux, fiche.
  - **Questions de cours** : interro + fiche.
  - **Texte à trous** : clique les mots à cacher, puis remplis-les en contexte
    (vérification tolérante, réussite ≥ 60 %).
  - **Apprendre par cœur** : masquage progressif (0/25/50/75/100 %, déterministe),
    et mode test (tout masqué, révélation ligne par ligne).
  - **Remettre dans l'ordre** : réordonne les éléments mélangés.
- Création en **collant un cours** ou éditeur dédié par type ; **import photo**
  manuel (aperçu de la photo, tu recopies — aucun service externe).
- **Progression** : XP, niveaux, série (streak), objectif quotidien, badges,
  maîtrise par carte/paquet. **Pomodoro** (concentration) nourrit la progression.
- **Export / import** (fusion) et **partage** d'un paquet par code.
- Vérification tolérante (accents/ponctuation/casse ignorés).

## Le module Journal (fonctionnel)

- Comptes (inscription / connexion), isolation stricte par utilisateur
- Écriture plein écran, **sauvegarde automatique** (+ filet localStorage),
  prompt suggéré ignorable, métadonnées repliées (humeur, tags, lieu, date)
- Timeline (épinglées, regroupement par mois), lecture Markdown, favori/épingle,
  édition en un tap, suppression confirmée
- Recherche plein texte + filtres (humeur, tag, période)
- **Export libre** (JSON + Markdown)

## Le module IA (assistant scolaire, fonctionnel)

Assistant de conversation branché sur **OpenAI**. Architecture :
**navigateur → notre backend `/api/ai/chat` → OpenAI → réponse → navigateur**.
La clé API reste **uniquement côté serveur** (jamais dans le HTML/JS ni dans Git).

- Frontend : `components/ai/AiChat.tsx` (rendu par `app/(app)/ia/page.tsx`).
  Conversation, historique en `localStorage`, nouvelle conversation, suppression,
  copie, rendu Markdown, actions rapides, états « réflexion » et erreurs.
- Backend : `app/api/ai/chat/route.ts` (auth requise, validation `zod`,
  limitation de débit par utilisateur, timeout, erreurs propres).
- Logique isolée dans `lib/ai/` : `config.ts` (variables d'env), `persona.ts`
  (personnalité + contexte), `openai.ts` (appel), `ratelimit.ts`, `types.ts`.

### Configuration

Dans `.env` (voir `.env.example` pour toutes les options) :

```bash
OPENAI_API_KEY="sk-..."       # SECRET, côté serveur uniquement
OPENAI_MODEL="gpt-5.6-terra"  # changer de modèle = changer cette ligne
```

Sans clé, l'IA s'affiche comme « non configurée » et **le reste d'Orbs
fonctionne normalement**. Le modèle utilisé est un modèle de raisonnement
(Chat Completions, `max_completion_tokens` + `reasoning_effort`, sans
`temperature`).

### Assistant vocal (l'élève parle, l'IA répond à voix haute)

L'élève peut **parler** (bouton micro « appuyer pour parler ») et **écouter**
la réponse. Bilingue **FR/EN** (langue détectée automatiquement). Trois voix au
choix (Nova / Alloy / Shimmer) et une option « lire les réponses
automatiquement », mémorisées en `localStorage`.

Même principe de sécurité que le chat : tout passe par **notre backend**, la
clé reste côté serveur. Deux routes :

- `app/api/ai/voice/transcribe/route.ts` — voix → texte (modèle `OPENAI_STT_MODEL`).
- `app/api/ai/voice/speak/route.ts` — texte → voix MP3 (modèle `OPENAI_TTS_MODEL`).

Côté client : `components/ai/useSpeech.ts` (micro via `MediaRecorder`, lecture
audio), `components/ai/VoicePicker.tsx` (choix de la voix), métadonnées des voix
dans `lib/ai/voices.ts`, appels audio serveur dans `lib/ai/audio.ts`. Le micro
n'utilise que des **API web standard**, compatibles avec un empaquetage natif
**Capacitor** (App Store / Play Store) — il restera alors à déclarer la
permission micro (`NSMicrophoneUsageDescription` sur iOS, `RECORD_AUDIO` sur
Android). Réutilise la **même** `OPENAI_API_KEY` (accès audio requis) ; sans
clé, la voix se désactive proprement comme le reste de l'IA.

## L'espace famille (fonctionnel)

- À l'inscription : **Élève** ou **Parent**. Un parent arrive sur `/parent`
  (sans la barre élève) ; un élève ne peut pas ouvrir `/parent`.
- **Liaison** : l'élève génère un **code famille** (6 caractères, 24 h, usage
  unique) dans *Mon compte → Espace famille* ; le parent le saisit. L'élève voit
  ses parents liés et peut en retirer un.
- **Fiche de l'enfant** (`/parent/[id]`) : avatar dans un anneau d'XP + niveau,
  série 🔥, actions de la semaine, cartes maîtrisées, **jardin** des 14 derniers
  jours (une plante qui pousse selon l'activité), matières, **collection de
  badges**, pages de journal écrites.
- **Défis** lancés par le parent (série, cartes révisées/maîtrisées,
  concentration, journal) avec une **récompense promise** ; progression
  calculée côté serveur, trophée + confettis quand c'est réussi.
- **Encouragements** : stickers + petit mot, affichés sur l'accueil de l'élève
  (« Merci ! » les marque comme vus ; le parent voit « 👀 vu »).
- **Vie privée** : le contenu du journal n'est **jamais** partagé (seulement le
  nombre de pages). L'humeur n'est visible que si l'élève l'active.
- La progression Apprendre reste locale, mais un **résumé chiffré** (XP, série,
  badges, nombre de cartes par paquet — jamais le contenu des fiches) est
  synchronisé vers le serveur à chaque sauvegarde (`User.learnSnapshot`).

## Connexion par e-mail (codes à usage unique)

Orbs envoie un **code à 6 chiffres** par e-mail pour trois usages, en plus de la
connexion classique par mot de passe :

- **Inscription** : le compte n'est créé **qu'après** la saisie du code reçu
  (vérifie l'adresse, empêche les comptes fantômes et le « squat » d'adresse).
- **Connexion par code** : « Recevoir un code par e-mail » → connexion sans mot
  de passe (pratique pour revenir sans rien retenir).
- **Mot de passe oublié** : code par e-mail → choix d'un nouveau mot de passe.

Sécurité : code tiré d'une source **cryptographique**, **jamais stocké en clair**
(haché bcrypt), **expiration 10 min**, **5 tentatives** max, **cooldown 45 s** +
**quota horaire** d'envoi, un seul code actif par usage, réponses **uniformes**
(pas d'énumération de comptes). Logique dans `lib/codes.ts` ; server actions dans
`app/actions/auth.ts` ; UI dans `components/AuthForm.tsx`.

### Configuration de l'envoi

Architecture : **navigateur → server action → service e-mail (API HTTPS)**. La
clé reste **côté serveur**. Fournisseur : **Brevo** (`lib/mail/`), via son API
HTTPS (pas de SMTP — passe même derrière un proxy HTTPS).

```bash
BREVO_API_KEY="xkeysib-…"               # SECRET, côté serveur uniquement
MAIL_FROM_EMAIL="orbs.support@gmail.com" # expéditeur VÉRIFIÉ chez Brevo
MAIL_FROM_NAME="Orbs"
```

Mise en place côté Brevo (gratuit, 300 e-mails/j) :

1. Créer un compte sur [brevo.com](https://www.brevo.com) avec `orbs.support@gmail.com`.
2. *Senders, Domains & Dedicated IPs* → **ajouter l'expéditeur** `orbs.support@gmail.com`
   et cliquer le lien de confirmation reçu dans cette boîte.
3. *SMTP & API* → **API Keys** → générer une clé (`xkeysib-…`) → la mettre dans `.env`.

> **Sans clé** : l'app fonctionne normalement. En **développement**, les codes
> s'affichent dans la **console du serveur** (`npm run dev`), donc tout le flux
> est testable sans aucun service externe. En **production**, l'envoi échoue
> proprement avec un message clair.
>
> **Délivrabilité** : envoyer *depuis* une adresse `@gmail.com` via un tiers peut
> parfois tomber en spam (gmail.com n'est pas un domaine qu'on possède). Pour une
> délivrabilité parfaite plus tard, brancher un **domaine dédié** (SPF/DKIM/DMARC)
> et régler `MAIL_FROM_EMAIL` dessus + `MAIL_REPLY_TO="orbs.support@gmail.com"` —
> **sans changer le code**.

## Direction artistique

Le contrat visuel complet est dans [`direction-artistique.md`](./direction-artistique.md).
Le socle (tokens de couleur, verre `.glass`, rayons, ombres, motion, fond vivant)
est dans `app/globals.css`. Fond pastel « mesh » animé lentement + grain +
vignette ; surfaces en verre dépoli ; vert `#38C172` en couleur primaire.

## Modèle de données

`prisma/schema.prisma` — `User` (+ rôle, code famille, résumé Apprendre),
`Settings`, `Entry` (contenu, humeur, tags, lieu, favori/épinglé, verrou,
trackers…), `Tag`, `MediaAttachment`, `FamilyLink`, `Cheer`, `Challenge`.

## Sécurité — état et suite

Mots de passe hachés (bcrypt), **vérification de l'e-mail à l'inscription** et
**codes à usage unique** (hachés, expirants, limités — voir « Connexion par
e-mail »), sessions signées httpOnly, isolation par utilisateur, export libre.
**Pas encore de chiffrement de bout en bout** : prévu
plus tard (le serveur peut lire les entrées aujourd'hui). L'export reste la
meilleure sauvegarde.

## Notes

`AGENTS.md` / `CLAUDE.md` sont maintenus par `next dev` (règles Next.js 16).
