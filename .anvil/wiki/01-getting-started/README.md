# Getting Started — boxtoplay-bot

## Prérequis

- Node.js `>=16.9.0` ([`package.json`](../../../../package.json))
- Variables d’environnement obligatoires: `DISCORD_TOKEN`, `CLIENT_ID`, `GIST_ID`, `GH_TOKEN`, `GITHUB_REPO` ([`index.js`](../../../../index.js), `REQUIRED_ENV_VARS`)

## Installation

```bash
npm install
```

`postinstall` installe aussi Chrome Puppeteer ([`package.json`](../../../../package.json)).

## Exécution

```bash
npm start
```

## Commandes Discord

- `/info`
- `/ip`
- `/status`
- `/players`
- `/rotate`

Source: déclaration des slash commands dans [`index.js`](../../../../index.js).
