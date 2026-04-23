# Environnements & Exécution — boxtoplay-bot

## Variables d’environnement

Obligatoires:

- `DISCORD_TOKEN`
- `CLIENT_ID`
- `GIST_ID`
- `GH_TOKEN`
- `GITHUB_REPO`

Optionnelle:

- `IP_DNS` (défaut `orny`)

Source: [`index.js`](../../../../index.js).

## Runtime

- Lancement d’un serveur Express (`/` et `/keep-alive`)
- Cycle keepalive toutes les 5 min (`KEEPALIVE_INTERVAL`)
- Mise à jour présence Discord toutes les 60s (`PRESENCE_INTERVAL`)

Source: [`index.js`](../../../../index.js).
