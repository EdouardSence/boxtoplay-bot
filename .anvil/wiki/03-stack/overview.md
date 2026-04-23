# Stack — boxtoplay-bot

## Langage

- Node.js / JavaScript CommonJS ([`package.json`](../../../../package.json), [`index.js`](../../../../index.js))

## Dépendances clés

- `discord.js` (bot)
- `puppeteer`, `puppeteer-extra`, `puppeteer-extra-plugin-stealth` (automation / anti-bot)
- `axios` (HTTP)
- `express` (keep-alive web)
- `dotenv` (env)

Source: [`package.json`](../../../../package.json).

## APIs externes

- BoxToPlay (`www.boxtoplay.com`)
- GitHub API (`api.github.com`) pour Gist + dispatch workflows
- mcsrvstat.us pour statut Minecraft

Source: constantes `URLS` dans [`index.js`](../../../../index.js).
