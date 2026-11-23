# Conversations avec l'assistant : stockage et conservation

Réglages → Assistant IA → Historique (Groupe B, B5).

## Où sont les conversations

- **Sur l'appareil uniquement**, dans l'espace local du compte connecté
  (`orbs.ai.v2`, voir `lib/ai/history.ts` et `lib/userStorage.ts`). Chaque
  compte a son propre espace ; un autre compte du même appareil n'y a pas
  accès.
- **Jamais sur le serveur** : il n'existe aucune table de conversations. La
  route `/api/ai/chat` transmet le message (et les 10 derniers messages de la
  discussion) à l'IA le temps de la réponse, sans l'enregistrer. Ses journaux
  ne contiennent que le nombre de jetons et les codes d'erreur, jamais le
  contenu (vérifié par `tests/ai-retention.test.ts`).
- Données associées : aucune pièce jointe ; l'audio lu à voix haute n'existe
  qu'en mémoire le temps de la lecture. L'archive « Mes données » exporte
  l'historique présent sur l'appareil.

## Les trois règles (`Settings.aiRetention`, enregistrée sur le compte)

| Règle | Effet |
| --- | --- |
| `keep` (défaut) | Rien n'est supprimé automatiquement. |
| `30d` | Une discussion **sans activité depuis 30 jours** est supprimée. L'activité = dernier message ou dernière modification, pas la date de création. |
| `none` | Les nouvelles discussions restent en mémoire pendant la visite (on peut changer de page), puis disparaissent au rechargement ou à la fermeture. Rien de nouveau n'est écrit ; seules les suppressions faites par l'élève sont enregistrées. L'historique déjà présent n'est **pas** effacé. |

Changer de règle n'efface rien par surprise : « 30 jours » et « Ne pas
conserver » demandent une confirmation qui dit exactement ce qui va se passer
(dont le nombre de discussions déjà inactives depuis plus de 30 jours sur
l'appareil). Un historique antérieur à ce réglage, sans date, reçoit la date
du jour à sa première lecture : le délai de 30 jours part de là.

## « Supprimer l'historique »

Action séparée, confirmée. Le serveur date la demande
(`Settings.aiHistoryClearedAt`) ; chaque appareil efface tout son historique
**une fois** par demande, sans comparer d'horloges entre appareils : celui-ci
tout de suite, les autres à leur prochaine ouverture d'Orbs. L'appareil retient
la date de la dernière demande appliquée et n'efface que pour une demande **plus
récente** (deux dates du serveur) : une page restée ouverte ou en cache ne
relance jamais un effacement déjà fait.

Limite : un autre appareil efface **tout** son historique à sa prochaine
ouverture, y compris une discussion qu'il aurait commencée entre la demande et
cette ouverture (sans quoi il faudrait comparer l'horloge de l'appareil à
celle du serveur, au risque de laisser des conversations qu'on voulait
effacer).

## Quand la suppression a-t-elle lieu ?

Le serveur ne détient aucune conversation : une tâche planifiée côté serveur
(cron) n'aurait rien à supprimer, et aucune n'est donc nécessaire. La règle est
appliquée **par l'appareil qui détient les données** (`AiHistoryKeeper`, monté
sur toutes les pages d'Orbs) : à l'ouverture d'Orbs, au retour sur l'onglet,
puis toutes les heures tant qu'Orbs est ouvert. Pour ces passages répétés, la
règle **actuelle** du compte est relue sur le serveur (`getAiHistoryRule`) : un
onglet resté ouvert n'applique jamais une règle changée depuis (par exemple
« 30 jours » → « Conserver » sur un autre appareil). Sans réponse du serveur
(hors ligne), rien n'est supprimé. Changer la règle ou demander l'effacement
rafraîchit aussi la page en cours.

**Limite honnête** : sur un appareil où Orbs n'est jamais rouvert, les
conversations restent dans le stockage du navigateur jusqu'à la prochaine
ouverture d'Orbs (ou jusqu'à ce que l'élève efface les données du site dans
son navigateur). Elles n'y sont lisibles que depuis ce navigateur et cet
espace de compte. Une suppression garantie même pour un appareil jamais
rouvert demanderait de stocker les conversations sur le serveur — un choix
d'architecture différent, non retenu (moins protecteur pour la vie privée).
