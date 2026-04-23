# Architecture — boxtoplay-bot

## Vue d’ensemble

Le bot combine 3 responsabilités:

1. **Bot Discord**: commandes slash + présence serveur
2. **Keepalive session BoxToPlay**: maintien/réinjection cookies via Puppeteer stealth
3. **État centralisé Gist**: lecture/écriture du state partagé avec le worker

Source: structure globale de [`index.js`](../../../../index.js) (sections “GESTION DE L'ETAT”, “NAVIGATEUR”, “DISCORD”).

## Flux clés

- `loadFromGist` / `saveToGist` pour la persistance
- `runKeepAliveCycle` périodique pour maintenir sessions
- `triggerGitHubAction` pour `/rotate`

Source: [`index.js`](../../../../index.js).
