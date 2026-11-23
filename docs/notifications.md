# Notifications et rappels d'Orbs

Ce document décrit ce que font **réellement** les rappels d'Orbs aujourd'hui,
et ce qu'il manque pour recevoir un rappel quand Orbs est **complètement fermé**.

Rappels concernés (Réglages → Notifications et Réglages → Agenda) :

- avant un cours (emploi du temps) ;
- résumé des devoirs du jour (avec ou sans le week-end) ;
- **« Préparer ma journée de demain »** (Groupe A, A4) : chaque soir à l'heure
  choisie, un récapitulatif des cours, devoirs à rendre, devoirs à terminer et
  affaires à préparer pour le lendemain.

## 1. Ce qui fonctionne aujourd'hui (sans aucune configuration)

Tout est local à l'appareil : réglages, agenda, suivi « déjà envoyé », dans
l'espace local du compte connecté (`lib/userStorage`).

| Situation | Comportement |
| --- | --- |
| Orbs ouvert et visible | Sonnerie + notification système (si autorisée) + bandeau dans Orbs pour le récapitulatif du soir. |
| Orbs ouvert dans un onglet en arrière-plan (ordinateur) | Même chose : le planificateur continue de tourner (les navigateurs le ralentissent à environ une vérification par minute, suffisant pour un rappel à la minute). |
| Plusieurs onglets d'Orbs ouverts | Un seul onglet déclenche (Web Locks, `runExclusive`) et le rappel est noté « envoyé » avant l'envoi : jamais de doublon. Navigateur sans Web Locks : seul l'onglet visible déclenche, comme avant. |
| Orbs fermé à l'heure du récapitulatif, rouvert plus tard le même soir | Le récapitulatif est proposé **discrètement** dans Orbs (bandeau, sans sonnerie ni notification système), jusqu'à minuit. Au-delà de 15 minutes de retard, plus de sonnerie. |
| Rien de prévu le lendemain (ni cours, ni devoir à rendre) | Aucun rappel ce soir-là. |
| Notifications refusées par le navigateur | Pas de notification système ; la sonnerie et le bandeau dans Orbs restent. Les Réglages l'indiquent. |
| Activer le récapitulatif (ou changer son heure) après l'heure du jour | Il commence le lendemain : pas de notification surprise juste après le réglage. L'aperçu reste disponible dans les Réglages. |
| Fuseau horaire | Heure locale de l'appareil (celle de l'élève). |

Notification système : elle passe par le **service worker d'Orbs** quand il est
actif (`registration.showNotification`) — c'est la seule voie possible sur
Android, et la notification reste dans le centre de notifications. Sinon,
repli sur l'API `Notification` de la page. Toucher la notification ramène sur
Orbs et ouvre le récapitulatif (gestionnaire `notificationclick` de
`public/sw.js`, qui n'ouvre jamais d'adresse extérieure à Orbs) ; si Orbs
était fermé, il s'ouvre sur `/accueil?rappel=demain`.

## 2. Ce qui ne fonctionne PAS aujourd'hui

**Recevoir un rappel quand Orbs est complètement fermé** (aucun onglet ouvert),
ou quand le téléphone est en veille / l'application en arrière-plan sur
mobile (les navigateurs mobiles suspendent les pages en arrière-plan).

Ce n'est pas un réglage manquant : c'est une infrastructure serveur qui
n'existe pas encore. Orbs ne prétend pas le contraire : les Réglages disent
« le rappel sonne si Orbs est ouvert sur cet appareil ».

## 3. Ce qu'il faudrait pour un rappel « Orbs fermé » (web push)

1. **Clés VAPID** (paire publique/privée) dans les variables d'environnement du
   serveur, par exemple `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`,
   `VAPID_SUBJECT` (adresse de contact). Secrets : jamais dans le dépôt.
2. **Abonnement de l'appareil** : `PushManager.subscribe()` dans le navigateur
   après accord de l'élève, puis une route API pour enregistrer et supprimer
   l'abonnement, et une table Prisma (par exemple `PushSubscription` :
   `userId`, `endpoint`, clés `p256dh` et `auth`, appareil, date) — donc une
   **migration**.
3. **Gestionnaire `push` dans `public/sw.js`**, qui affiche la notification
   reçue (le gestionnaire de clic existe déjà).
4. **Un envoi planifié côté serveur** : une tâche qui tourne chaque minute (ou
   toutes les 5 minutes) — par exemple une tâche cron de l'hébergeur — et qui
   envoie les rappels dus. Elle doit connaître l'heure choisie, l'activation
   et le **fuseau horaire** de l'élève : ces réglages, aujourd'hui locaux,
   devraient être copiés sur le serveur.
5. **L'agenda côté serveur** : l'emploi du temps et les devoirs sont
   aujourd'hui stockés **uniquement sur l'appareil**. Sans synchronisation de
   l'agenda, le serveur ne peut pas écrire « 08:00 Maths, 10:00 Anglais » : il
   ne pourrait envoyer qu'un message générique (« Prépare ta journée de
   demain ») qui ouvre Orbs, où le récapitulatif réel s'affiche.
6. **Une bibliothèque d'envoi** web push (par exemple `web-push`), nouvelle
   dépendance du serveur.
7. **iPhone / iPad** : les notifications web n'existent que pour Orbs
   **installé sur l'écran d'accueil** (iOS/iPadOS 16.4 ou plus), et
   uniquement par web push.

## 4. Vérifications

- Logique des rappels, récapitulatif, absence de doublon, onglets multiples,
  service worker : `tests/agenda-tomorrow.test.ts`,
  `tests/agenda-notifications.test.ts`, `tests/service-worker.test.ts`.
- Vérifié dans Chromium (ordinateur et mobile émulé) : déclenchement à
  l'heure, notification affichée par le service worker, bandeau et
  récapitulatif.
- Non vérifiable ici : un vrai téléphone (Android, iPhone), et bien sûr le
  rappel « Orbs fermé », qui n'existe pas encore.
