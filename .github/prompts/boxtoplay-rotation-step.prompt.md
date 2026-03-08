---
name: "Boxtoplay Rotation Step"
description: "Utiliser quand vous voulez concevoir ou implémenter une étape du workflow de rotation de serveur BoxToPlay dans ce dépôt"
argument-hint: "Étape à traiter, contraintes et résultat attendu"
agent: "agent"
model: "GPT-5 (copilot)"
---
Tu travailles dans le dépôt du bot BoxToPlay.

Objectif:
- Traiter exactement une étape du workflow de rotation de serveur décrite par l'utilisateur.
- L'argument utilisateur précise l'étape visée, les contraintes, et le résultat attendu.

Contexte du dépôt:
- Le point d'entrée principal est [index.js](./index.js).
- Les dépendances et scripts sont définis dans [package.json](./package.json).
- Le bot stocke déjà un état via GitHub Gist et automatise des interactions BoxToPlay avec Puppeteer.

Consignes:
- Commence par reformuler l'étape demandée et délimiter explicitement ce qui est hors périmètre.
- Commence ensuite par un plan court et concret avant toute modification de code.
- Explore le code existant avant de proposer une modification.
- Si l'étape est trop large, découpe-la et n'implémente que le premier sous-problème cohérent.
- Préserve les secrets: ne hardcode jamais de tokens, mots de passe, cookies, identifiants FTP, ou clés API.
- Réutilise l'architecture existante du bot quand c'est pertinent.
- Privilégie une implémentation minimale, robuste et vérifiable.
- Si des informations manquent, formule des hypothèses explicites et continue avec l'option la plus sûre.

Livrable attendu:
- Un plan d'attaque bref pour l'étape demandée.
- Une courte analyse du code concerné.
- Les changements de code nécessaires pour l'étape demandée.
- Une vérification concise de ce qui a été testé ou non.
- Les prochains sous-problèmes logiques seulement si l'étape initiale n'achève pas le workflow complet.

Argument utilisateur:

{{input}}