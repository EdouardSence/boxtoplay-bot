// ==========================================
// CONFIGURATION & DEPENDANCES
// ==========================================
require('dotenv').config();
const { execSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

// ==========================================
// CONSTANTES
// ==========================================
const URLS = {
    BOXTOPLAY_LOGIN: 'https://www.boxtoplay.com/fr/login',
    BOXTOPLAY_PANEL: 'https://www.boxtoplay.com/panel',
    BOXTOPLAY_STATUS: (serverId) => `https://www.boxtoplay.com/minecraft/getStatus/${serverId}`,
    BOXTOPLAY_ONLINE_PLAYERS: (serverId) => `https://www.boxtoplay.com/minecraft/getOnlinePlayers/${serverId}`,
    BOXTOPLAY_MEMORY_USAGE: (serverId) => `https://www.boxtoplay.com/minecraft/getMcMemUsage/${serverId}`,
    BOXTOPLAY_CPU_USAGE: (serverId) => `https://www.boxtoplay.com/minecraft/getMcCpuUsagePercent/${serverId}`,
    GITHUB_GIST: (gistId) => `https://api.github.com/gists/${gistId}`,
    GITHUB_ACTION_DISPATCH: (repo) => `https://api.github.com/repos/${repo}/actions/workflows/schedule.yml/dispatches`,
    MC_STATUS: (dns) => `https://api.mcsrvstat.us/3/${dns}.boxtoplay.com`,
};

const COOKIE_DOMAIN = 'www.boxtoplay.com';
const RELEVANT_COOKIE_NAMES = [
    'BOXTOPLAY_SESSION',
    'BOXTOPLAY_LANG',
    'cf_clearance',
    'cookie_consent_level',
    'cookie_consent_user_accepted',
    'cookie_consent_user_consent_token',
];
const SESSION_COOKIE_KEY = 'BOXTOPLAY_SESSION';
let statusMessage = '🔴 | 👥 0 | 🧠 0.00 Go | ⚙️ 0%';

const TIMINGS = {
    CLOUDFLARE_TIMEOUT: 30000,
    CLOUDFLARE_SETTLE_DELAY: 3000,
    PAGE_NAVIGATION_TIMEOUT: 30000,
    PAGE_LOAD_TIMEOUT: 60000,
    CHROME_INSTALL_TIMEOUT: 180000,
    INTER_ACCOUNT_DELAY: 3000,
    PRESENCE_INTERVAL: 60 * 1000,
    KEEPALIVE_INTERVAL: 5 * 60 * 1000,
};

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const CLOUDFLARE_CHALLENGE_TITLE = 'Just a moment';

// ==========================================
// LOGGING STRUCTURE
// ==========================================
const LOG_LEVELS = { DEBUG: 0, INFO: 1, WARN: 2, ERROR: 3 };
const CURRENT_LOG_LEVEL = LOG_LEVELS.INFO;

function log(level, context, message, extra) {
    if (LOG_LEVELS[level] < CURRENT_LOG_LEVEL) return;
    const timestamp = new Date().toISOString();
    const prefix = { DEBUG: 'DBG', INFO: 'INF', WARN: 'WRN', ERROR: 'ERR' }[level] || level;
    const line = `[${timestamp}] [${prefix}] [${context}] ${message}`;
    if (level === 'ERROR') {
        console.error(line, extra || '');
    } else if (level === 'WARN') {
        console.warn(line, extra || '');
    } else {
        console.log(line, extra || '');
    }
}

// ==========================================
// VALIDATION DES VARIABLES D'ENVIRONNEMENT
// ==========================================
const REQUIRED_ENV_VARS = ['DISCORD_TOKEN', 'CLIENT_ID', 'GIST_ID', 'GH_TOKEN', 'GITHUB_REPO'];

function validateEnv() {
    const missing = REQUIRED_ENV_VARS.filter(v => !process.env[v]);
    if (missing.length > 0) {
        log('ERROR', 'Config', `Variables d'environnement manquantes: ${missing.join(', ')}`);
        log('ERROR', 'Config', 'Creez un fichier .env avec ces variables.');
        process.exit(1);
    }
}

validateEnv();

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GIST_ID = process.env.GIST_ID;
const GH_TOKEN = process.env.GH_TOKEN;
const GITHUB_REPO = process.env.GITHUB_REPO;
const IP_DNS = process.env.IP_DNS || 'orny';

// ==========================================
// INSTALLATION CHROME SECURISEE
// ==========================================

/**
 * Recherche recursive securisee du binaire Chrome dans un repertoire.
 * Remplace l'appel shell `find` pour eviter les injections de commande.
 */
function findChromeRecursive(dir) {
    try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            if (entry.isFile() && entry.name === 'chrome') {
                return fullPath;
            }
            if (entry.isDirectory()) {
                const result = findChromeRecursive(fullPath);
                if (result) return result;
            }
        }
    } catch {
        // Ignore les erreurs de permission sur certains sous-dossiers
    }
    return null;
}

(function installChrome() {
    try {
        const cacheDirs = [
            process.env.PUPPETEER_CACHE_DIR,
            '/opt/render/.cache/puppeteer',
            path.join(os.homedir(), '.cache', 'puppeteer'),
        ].filter(Boolean);

        let found = false;
        for (const dir of cacheDirs) {
            if (fs.existsSync(dir)) {
                const chromePath = findChromeRecursive(dir);
                if (chromePath) {
                    log('INFO', 'Chrome', `Chrome trouve: ${chromePath}`);
                    found = true;
                    break;
                }
            }
        }

        if (!found) {
            log('INFO', 'Chrome', 'Chrome non trouve, telechargement (~1-2 min)...');
            execSync('npx puppeteer browsers install chrome', { stdio: 'inherit', timeout: TIMINGS.CHROME_INSTALL_TIMEOUT });
            log('INFO', 'Chrome', 'Chrome installe.');
        }
    } catch (e) {
        log('WARN', 'Chrome', `Erreur installation Chrome: ${e.message}`);
    }
})();

const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder } = require('discord.js');
const axios = require('axios');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const express = require('express');

puppeteer.use(StealthPlugin());

// ==========================================
// 1. SERVEUR WEB (KEEP-ALIVE RENDER)
// ==========================================
const app = express();
const PORT = process.env.PORT || 3000;
app.get('/', (req, res) => res.send('Bot BoxToPlay V4 - Full Puppeteer'));
app.get('/keep-alive', (req, res) => res.status(200).send('OK'));
const server = app.listen(PORT, () => log('INFO', 'Web', `Serveur Web sur le port ${PORT}`));

// ==========================================
// 2. GESTION DE L'ETAT (GIST)
// ==========================================
let LOCAL_STATE = null;
let GIST_FILENAME = null;

/**
 * Valide la structure du state charge depuis le Gist.
 * Leve une erreur si le state est invalide.
 */
function validateState(state) {
    if (!state || typeof state !== 'object') {
        throw new Error('Le state doit etre un objet');
    }
    if (!Array.isArray(state.accounts)) {
        throw new Error('Le state doit contenir un tableau "accounts"');
    }
    for (let i = 0; i < state.accounts.length; i++) {
        const account = state.accounts[i];
        if (!account.email || typeof account.email !== 'string') {
            throw new Error(`accounts[${i}] doit avoir un champ "email" (string)`);
        }
        if (!account.cookies || typeof account.cookies !== 'object') {
            throw new Error(`accounts[${i}] doit avoir un champ "cookies" (object)`);
        }
    }
    if (typeof state.active_account_index !== 'number' || state.active_account_index < 0) {
        throw new Error('"active_account_index" doit etre un nombre >= 0');
    }
    if (state.active_account_index >= state.accounts.length) {
        throw new Error(`"active_account_index" (${state.active_account_index}) depasse le nombre de comptes (${state.accounts.length})`);
    }
    return true;
}

/**
 * Effectue un appel async avec retry et backoff exponentiel.
 */
async function withRetry(fn, { maxRetries = 3, baseDelay = 1000, context = 'Retry' } = {}) {
    let lastError;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            return await fn();
        } catch (error) {
            lastError = error;
            if (attempt < maxRetries) {
                const delay = baseDelay * Math.pow(2, attempt - 1);
                log('WARN', context, `Tentative ${attempt}/${maxRetries} echouee, retry dans ${delay}ms: ${error.message}`);
                await new Promise(r => setTimeout(r, delay));
            }
        }
    }
    throw lastError;
}

async function loadFromGist() {
    try {
        log('INFO', 'Gist', 'Chargement du state...');
        const response = await withRetry(
            () => axios.get(URLS.GITHUB_GIST(GIST_ID), {
                headers: { 'Authorization': `token ${GH_TOKEN}` }
            }),
            { context: 'Gist-Load' }
        );
        const files = response.data.files;
        GIST_FILENAME = Object.keys(files)[0];
        const parsed = JSON.parse(files[GIST_FILENAME].content);
        validateState(parsed);
        LOCAL_STATE = parsed;
        log('INFO', 'Gist', `State charge: ${LOCAL_STATE.accounts.length} compte(s).`);
    } catch (error) {
        log('ERROR', 'Gist', `Erreur chargement: ${error.message}`);
    }
}

async function saveToGist() {
    if (!GIST_FILENAME || !LOCAL_STATE) return;
    try {
        await withRetry(
            () => axios.patch(URLS.GITHUB_GIST(GIST_ID), {
                files: { [GIST_FILENAME]: { content: JSON.stringify(LOCAL_STATE, null, 4) } }
            }, { headers: { 'Authorization': `token ${GH_TOKEN}` } }),
            { context: 'Gist-Save' }
        );
        log('INFO', 'Gist', 'State sauvegarde.');
    } catch (error) {
        log('ERROR', 'Gist', `Erreur sauvegarde: ${error.message}`);
    }
}

// ==========================================
// 3. NAVIGATEUR PERSISTANT (Puppeteer-stealth)
// ==========================================
// On garde UN navigateur Chrome ouvert en permanence.
// Toutes les requetes passent par ce navigateur = meme TLS = Cloudflare OK.

let BROWSER = null;

async function getBrowser() {
    if (BROWSER && BROWSER.connected) return BROWSER;

    log('INFO', 'Browser', 'Lancement de Chrome stealth...');
    BROWSER = await puppeteer.launch({
        headless: 'new',
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu',
            '--no-first-run',
            '--no-zygote',
            '--single-process',
            '--disable-extensions',
            '--disable-background-networking',
            '--disable-default-apps',
            '--disable-sync',
            '--disable-translate',
            '--metrics-recording-only',
            '--mute-audio',
            '--no-default-browser-check',
        ],
    });

    // Si le navigateur crash, on le relancera au prochain appel
    BROWSER.on('disconnected', () => {
        log('WARN', 'Browser', 'Chrome deconnecte, sera relance au prochain cycle.');
        BROWSER = null;
    });

    log('INFO', 'Browser', 'Chrome lance.');
    return BROWSER;
}

/**
 * Resoudre le challenge Cloudflare en naviguant sur le site.
 * Retourne true si le challenge est passe, false sinon.
 */
async function solveCloudflareOnPage(page) {
    await page.setUserAgent(USER_AGENT);
    await page.setViewport({ width: 1366, height: 768 });

    log('INFO', 'Cloudflare', 'Navigation vers boxtoplay.com...');
    await page.goto(URLS.BOXTOPLAY_LOGIN, {
        waitUntil: 'networkidle2',
        timeout: TIMINGS.PAGE_LOAD_TIMEOUT,
    });

    // Verifier si on a un challenge Cloudflare
    const title = await page.title();
    if (title.includes(CLOUDFLARE_CHALLENGE_TITLE)) {
        log('INFO', 'Cloudflare', 'Challenge detecte, resolution en cours...');
        try {
            await page.waitForFunction(
                (challengeTitle) => !document.title.includes(challengeTitle),
                { timeout: TIMINGS.CLOUDFLARE_TIMEOUT },
                CLOUDFLARE_CHALLENGE_TITLE
            );
        } catch {
            log('WARN', 'Cloudflare', 'Timeout sur le challenge');
        }
        await new Promise(r => setTimeout(r, TIMINGS.CLOUDFLARE_SETTLE_DELAY));
    }

    const finalTitle = await page.title();
    log('INFO', 'Cloudflare', `Page chargee: "${finalTitle}"`);
    return !finalTitle.includes(CLOUDFLARE_CHALLENGE_TITLE);
}

/**
 * Injecter les cookies d'un compte dans une page.
 */
async function injectCookies(page, cookieString) {
    if (!cookieString) return;

    const cookies = cookieString.split(';').map(c => c.trim()).filter(Boolean);
    const cookieObjects = [];

    for (const cookie of cookies) {
        const eqIdx = cookie.indexOf('=');
        if (eqIdx === -1) continue;
        const name = cookie.substring(0, eqIdx).trim();
        const value = cookie.substring(eqIdx + 1).trim();
        if (name && value) {
            cookieObjects.push({
                name,
                value,
                domain: COOKIE_DOMAIN,
                path: '/',
                httpOnly: name === SESSION_COOKIE_KEY,
                secure: true,
            });
        }
    }

    // Fallback: cookie brut sans format name=value
    // On le traite comme valeur de BOXTOPLAY_SESSION pour préserver la compatibilité Gist.
    if (cookieObjects.length === 0 && cookieString && !cookieString.includes('=')) {
        cookieObjects.push({
            name: SESSION_COOKIE_KEY,
            value: cookieString.trim(),
            domain: COOKIE_DOMAIN,
            path: '/',
            httpOnly: true,
            secure: true,
        });
    }

    if (cookieObjects.length > 0) {
        await page.setCookie(...cookieObjects);
    }
}

/**
 * Extraire les cookies de la page et mettre a jour l'etat.
 */
async function extractAndUpdateCookies(page, accountIndex) {
    const cookies = await page.cookies(`https://${COOKIE_DOMAIN}`);
    const sessionCookie = cookies.find(c => c.name === SESSION_COOKIE_KEY);

    if (sessionCookie) {
        // Reconstruire la chaine de cookies complete (dedup par nom, derniere valeur gagne)
        const cookieMap = new Map();
        for (const c of cookies) {
            if (RELEVANT_COOKIE_NAMES.includes(c.name)) {
                cookieMap.set(c.name, c.value);
            }
        }
        const relevantCookies = Array.from(cookieMap.entries())
            .map(([name, value]) => `${name}=${value}`)
            .join('; ');

        const oldCookie = LOCAL_STATE.accounts[accountIndex].cookies[SESSION_COOKIE_KEY];
        if (relevantCookies !== oldCookie) {
            log('INFO', 'Cookies', `Cookies mis a jour pour ${LOCAL_STATE.accounts[accountIndex].email}`);
            LOCAL_STATE.accounts[accountIndex].cookies[SESSION_COOKIE_KEY] = relevantCookies;
            await saveToGist();
        }
    }
}

// ==========================================
// 4. BOUCLE DE MAINTIEN (KeepAlive)
// ==========================================
let keepAliveLockTimestamp = 0;
const KEEPALIVE_LOCK_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes max per cycle
const FETCH_TIMEOUT_MS = 15000; // 15s timeout for fetch inside page.evaluate
const BROWSER_CLOSE_TIMEOUT_MS = 5000; // 5s timeout for browser.close()

async function checkAccount(account, index) {
    if (!account.cookies[SESSION_COOKIE_KEY]) {
        log('WARN', 'KeepAlive', `Skip ${account.email} (pas de cookie de session)`);
        return;
    }

    let page = null;
    try {
        const browser = await getBrowser();
        page = await browser.newPage();
        await page.setUserAgent(USER_AGENT);
        await page.setViewport({ width: 1366, height: 768 });

        // Nettoyer TOUS les cookies avant d'injecter ceux de ce compte
        // (isole les comptes sans utiliser createBrowserContext qui crash sur Render)
        const existingCookies = await page.cookies(`https://${COOKIE_DOMAIN}`);
        if (existingCookies.length > 0) {
            await page.deleteCookie(...existingCookies);
        }

        // Injecter les cookies AVANT de naviguer (inclut cf_clearance pour bypass Cloudflare)
        await injectCookies(page, account.cookies[SESSION_COOKIE_KEY]);

        // Naviguer directement vers le panel ou getStatus
        let url = URLS.BOXTOPLAY_PANEL;
        if (account.server_id) {
            url = URLS.BOXTOPLAY_STATUS(account.server_id);
        } else if (LOCAL_STATE.current_server_id && index === LOCAL_STATE.active_account_index) {
            url = URLS.BOXTOPLAY_STATUS(LOCAL_STATE.current_server_id);
        }

        const response = await page.goto(url, {
            waitUntil: 'networkidle2',
            timeout: TIMINGS.PAGE_NAVIGATION_TIMEOUT,
        });

        // Si Cloudflare challenge apparait, attendre la resolution automatique
        const title = await page.title();
        if (title.includes(CLOUDFLARE_CHALLENGE_TITLE)) {
            log('INFO', 'Cloudflare', `Challenge pour ${account.email}, attente resolution...`);
            try {
                await page.waitForFunction(
                    (challengeTitle) => !document.title.includes(challengeTitle),
                    { timeout: TIMINGS.CLOUDFLARE_TIMEOUT },
                    CLOUDFLARE_CHALLENGE_TITLE
                );
                await new Promise(r => setTimeout(r, TIMINGS.CLOUDFLARE_SETTLE_DELAY));
            } catch {
                log('ERROR', 'Cloudflare', `Challenge non resolu pour ${account.email}`);
                return;
            }
        }

        const status = response ? response.status() : 0;
        const pageUrl = page.url();

        // Sauvegarder les cookies mis a jour
        await extractAndUpdateCookies(page, index);

        if (pageUrl.includes('login')) {
            log('ERROR', 'KeepAlive', `SESSION EXPIREE pour ${account.email}`);
        } else if (status === 403) {
            log('ERROR', 'KeepAlive', `403 Forbidden pour ${account.email}`);
        } else if (status === 200) {
            log('INFO', 'KeepAlive', `Ping OK pour ${account.email} (${url.split('/').pop()})`);
        } else {
            log('WARN', 'KeepAlive', `Status ${status} pour ${account.email} (URL: ${pageUrl})`);
        }

    } catch (error) {
        log('ERROR', 'KeepAlive', `Erreur ${account.email}: ${error.message}`);
    } finally {
        if (page) {
            try { await page.close(); } catch {}
        }
    }
}

/**
 * Wrapper non-bloquant pour BROWSER.close() avec timeout.
 * Force la liberation si close() bloque plus de 5 secondes.
 */
async function closeBrowserWithTimeout() {
    if (!BROWSER || !BROWSER.connected) {
        BROWSER = null;
        return;
    }

    try {
        await Promise.race([
            BROWSER.close(),
            new Promise((_, reject) =>
                setTimeout(() => reject(new Error('Browser close timeout')), BROWSER_CLOSE_TIMEOUT_MS)
            ),
        ]);
        log('INFO', 'Browser', 'Chrome ferme (fin de cycle).');
    } catch (e) {
        log('WARN', 'Browser', `Timeout ou erreur close(): ${e.message}, force nullification.`);
    } finally {
        BROWSER = null;
    }
}

async function runKeepAliveCycle() {
    // Anti-deadlock: detecter si un cycle precede est bloque depuis plus de 10 minutes
    if (keepAliveLockTimestamp > 0 && Date.now() - keepAliveLockTimestamp > KEEPALIVE_LOCK_TIMEOUT_MS) {
        log('WARN', 'KeepAlive', 'Verrou bloque depuis >10min, force reinitialisation.');
        keepAliveLockTimestamp = 0;
        if (BROWSER && BROWSER.connected) {
            try { BROWSER.close(); } catch {}
        }
        BROWSER = null;
    }

    // Protection contre le chevauchement des cycles (verrou simple)
    if (keepAliveLockTimestamp > 0) {
        log('WARN', 'KeepAlive', 'Cycle precedent encore en cours, skip.');
        return;
    }

    keepAliveLockTimestamp = Date.now();
    try {
        // Recharger le state depuis le Gist pour integrer les changements du worker
        await loadFromGist();

        if (!LOCAL_STATE) {
            log('WARN', 'KeepAlive', 'State non charge, cycle ignore.');
            return;
        }

        log('INFO', 'KeepAlive', `--- Cycle KeepAlive (${LOCAL_STATE.accounts.length} comptes) ---`);
        for (let i = 0; i < LOCAL_STATE.accounts.length; i++) {
            await checkAccount(LOCAL_STATE.accounts[i], i);
            if (i < LOCAL_STATE.accounts.length - 1) {
                await new Promise(r => setTimeout(r, TIMINGS.INTER_ACCOUNT_DELAY));
            }
        }
        log('INFO', 'KeepAlive', '--- Cycle termine ---');
    } catch (error) {
        log('ERROR', 'KeepAlive', `Erreur cycle: ${error.message}`);
    } finally {
        // Fermer Chrome apres chaque cycle pour liberer la memoire (Render free = 512MB)
        // getBrowser() le relancera au prochain cycle
        await closeBrowserWithTimeout();
        keepAliveLockTimestamp = 0;
    }
}

// ==========================================
// 5. DISCORD
// ==========================================
const client = new Client({ intents: [GatewayIntentBits.Guilds] });

const commands = [
    new SlashCommandBuilder().setName('info').setDescription('Infos completes du serveur et du bot'),
    new SlashCommandBuilder().setName('ip').setDescription('Affiche l\'adresse IP du serveur'),
    new SlashCommandBuilder().setName('status').setDescription('Statut du serveur Minecraft (online/offline)'),
    new SlashCommandBuilder().setName('players').setDescription('Liste des joueurs connectes'),
    new SlashCommandBuilder().setName('rotate').setDescription('Declenche la rotation via GitHub Actions'),
].map(c => c.toJSON());

const rest = new REST({ version: '10' }).setToken(TOKEN);

(async () => {
    try { await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands }); }
    catch (e) { log('ERROR', 'Discord', `Erreur enregistrement commandes: ${e.message}`); }
})();

async function updatePresence() {
    try {
        // Anti-deadlock: verifier si le cycle keepalive est bloque
        if (keepAliveLockTimestamp > 0 && Date.now() - keepAliveLockTimestamp > KEEPALIVE_LOCK_TIMEOUT_MS) {
            log('WARN', 'Presence', 'Verrou bloque dans updatePresence, reset et reinitialisation.');
            keepAliveLockTimestamp = 0;
            if (BROWSER && BROWSER.connected) {
                try { BROWSER.close(); } catch {}
                BROWSER = null;
            }
        }

        // Eviter la concurrence avec le cycle keepalive (verrou timestamp)
        if (keepAliveLockTimestamp > 0) {
            client.user.setActivity(statusMessage);
            return;
        }

        if (!LOCAL_STATE?.accounts?.length || !LOCAL_STATE.current_server_id) {
            client.user.setActivity(statusMessage);
            return;
        }

        const activeIndex = LOCAL_STATE.active_account_index;
        const account = LOCAL_STATE.accounts[activeIndex];
        const cookieHeader = account?.cookies?.[SESSION_COOKIE_KEY];
        const serverId = LOCAL_STATE.current_server_id;

        if (!cookieHeader || !serverId) {
            client.user.setActivity(statusMessage);
            return;
        }

        // IMPORTANT: passer par Chromium/Puppeteer (Cloudflare), pas axios direct
        const browser = await getBrowser();
        const page = await browser.newPage();
        let data;
        try {
            await page.setUserAgent(USER_AGENT);
            await page.setViewport({ width: 1366, height: 768 });

            const existingCookies = await page.cookies(`https://${COOKIE_DOMAIN}`);
            if (existingCookies.length > 0) {
                await page.deleteCookie(...existingCookies);
            }

            await injectCookies(page, cookieHeader);

            await page.goto(URLS.BOXTOPLAY_PANEL, {
                waitUntil: 'networkidle2',
                timeout: TIMINGS.PAGE_NAVIGATION_TIMEOUT,
            });

            const title = await page.title();
            if (title.includes(CLOUDFLARE_CHALLENGE_TITLE)) {
                await page.waitForFunction(
                    (challengeTitle) => !document.title.includes(challengeTitle),
                    { timeout: TIMINGS.CLOUDFLARE_TIMEOUT },
                    CLOUDFLARE_CHALLENGE_TITLE
                );
                await new Promise(r => setTimeout(r, TIMINGS.CLOUDFLARE_SETTLE_DELAY));
            }

            if (page.url().includes('login')) {
                throw new Error(`Session expiree pour ${account.email}`);
            }

            data = await page.evaluate(async (urls) => {
                async function fetchText(url) {
                    const controller = new AbortController();
                    const timeoutId = setTimeout(() => controller.abort(), 15000);
                    try {
                        const response = await fetch(url, { credentials: 'include', signal: controller.signal });
                        if (!response.ok) {
                            throw new Error(`HTTP ${response.status} sur ${url}`);
                        }
                        return (await response.text()).trim();
                    } finally {
                        clearTimeout(timeoutId);
                    }
                }

                const [status, onlinePlayers, memoryUsage, cpuUsage] = await Promise.all([
                    fetchText(urls.status),
                    fetchText(urls.onlinePlayers),
                    fetchText(urls.memoryUsage),
                    fetchText(urls.cpuUsage),
                ]);

                return { status, onlinePlayers, memoryUsage, cpuUsage };
            }, {
                status: URLS.BOXTOPLAY_STATUS(serverId),
                onlinePlayers: URLS.BOXTOPLAY_ONLINE_PLAYERS(serverId),
                memoryUsage: URLS.BOXTOPLAY_MEMORY_USAGE(serverId),
                cpuUsage: URLS.BOXTOPLAY_CPU_USAGE(serverId),
            });
        } finally {
            try { await page.close(); } catch {}
        }

        const memoryGo = Number(data.memoryUsage || 0) / 1000;

        if (data.status === 'STARTED') data.status = '🟢';
        else if (data.status === 'STOPPED') data.status = '🔴';
        else if (data.status === 'STARTING') data.status = '🟡';
        else data.status = '⚪';

        statusMessage = `${data.status} | 👥 ${data.onlinePlayers ?? 0} | 🧠 ${memoryGo.toFixed(2)} Go | ⚙️ ${data.cpuUsage ?? 0}%`;
        client.user.setActivity(statusMessage);
        log('INFO', 'Presence', `Updated activity for ${account.email}: ${statusMessage}`);
    } catch (e) {
        log('WARN', 'Presence', `Erreur: ${e.message}`);
        client.user.setActivity(statusMessage);
    }
}

client.once('clientReady', async () => {
    log('INFO', 'Discord', `Connecte: ${client.user.tag}`);
    await loadFromGist();

    // Premier cycle immediat (avec gestion d'erreur)
    runKeepAliveCycle().catch(err => {
        log('ERROR', 'KeepAlive', `Erreur cycle initial: ${err.message}`);
    });

    // Intervalles avec gestion d'erreur sur chaque tick
    setInterval(updatePresence, TIMINGS.PRESENCE_INTERVAL);
    setInterval(() => {
        runKeepAliveCycle().catch(err => {
            log('ERROR', 'KeepAlive', `Erreur cycle periodique: ${err.message}`);
        });
    }, TIMINGS.KEEPALIVE_INTERVAL);
});

/**
 * Recupere les donnees du serveur Minecraft via l'API mcsrvstat.us.
 * Retourne null en cas d'erreur.
 */
async function fetchMcStatus() {
    try {
        const response = await axios.get(URLS.MC_STATUS(IP_DNS), { timeout: 10000 });
        return response.data;
    } catch (error) {
        log('WARN', 'McStatus', `Erreur API: ${error.message}`);
        return null;
    }
}

async function triggerGitHubAction() {
    const dispatchUrl = URLS.GITHUB_ACTION_DISPATCH(GITHUB_REPO);

    try {
        const response = await axios.post(
            dispatchUrl,
            { ref: 'main' },
            {
                headers: {
                    Authorization: `token ${GH_TOKEN}`,
                    Accept: 'application/vnd.github.v3+json',
                },
                timeout: 15000,
            }
        );

        if (response.status === 200 || response.status === 204) {
            log('INFO', 'Rotate', `Workflow schedule.yml declenche sur ${GITHUB_REPO}.`);
            return true;
        }

        log('WARN', 'Rotate', `Reponse inattendue GitHub Actions: HTTP ${response.status}`);
        return false;
    } catch (error) {
        const status = error.response?.status;
        const details = error.response?.data || error.message;
        log('ERROR', 'Rotate', `Echec declenchement GitHub Actions${status ? ` (HTTP ${status})` : ''}`, details);
        return false;
    }
}

client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;

    const { commandName } = interaction;

    // --- /ip ---
    if (commandName === 'ip') {
        const address = `${IP_DNS}.boxtoplay.com`;
        return interaction.reply(`**Adresse du serveur:** \`${address}\``);
    }

    // --- /status ---
    if (commandName === 'status') {
        await interaction.deferReply();
        const data = await fetchMcStatus();

        if (!data) {
            return interaction.editReply('Impossible de joindre le serveur (API indisponible).');
        }

        if (data.online) {
            const version = data.version || 'inconnue';
            const players = `${data.players.online}/${data.players.max}`;
            const motd = data.motd?.clean?.[0] || '';
            const lines = [
                `**Statut:** En ligne`,
                `**Joueurs:** ${players}`,
                `**Version:** ${version}`,
            ];
            if (motd) lines.push(`**MOTD:** ${motd}`);
            return interaction.editReply(lines.join('\n'));
        } else {
            return interaction.editReply('**Statut:** Hors ligne');
        }
    }

    // --- /players ---
    if (commandName === 'players') {
        await interaction.deferReply();
        const data = await fetchMcStatus();

        if (!data) {
            return interaction.editReply('Impossible de joindre le serveur (API indisponible).');
        }

        if (!data.online) {
            return interaction.editReply('Le serveur est actuellement hors ligne.');
        }

        const online = data.players.online;
        if (online === 0) {
            return interaction.editReply('Aucun joueur connecte.');
        }

        const playerList = data.players.list
            ? data.players.list.map(p => p.name).join(', ')
            : `${online} joueur(s) (noms indisponibles)`;
        return interaction.editReply(`**Joueurs connectes (${online}):** ${playerList}`);
    }

    // --- /info ---
    if (commandName === 'info') {
        if (!LOCAL_STATE) return interaction.reply('State en cours de chargement...');

        await interaction.deferReply();

        const active = LOCAL_STATE.accounts[LOCAL_STATE.active_account_index];
        const browserStatus = BROWSER && BROWSER.connected ? 'Actif' : 'Inactif';
        const modpack = LOCAL_STATE.modpack || 'non defini';
        const serverId = LOCAL_STATE.current_server_id || 'inconnu';
        const address = `${IP_DNS}.boxtoplay.com`;

        // Recuperer le statut MC en parallele
        const data = await fetchMcStatus();
        const serverStatus = data?.online ? `En ligne (${data.players.online}/${data.players.max})` : 'Hors ligne';
        const version = data?.online ? (data.version || 'inconnue') : '-';

        const lines = [
            `**Serveur Minecraft**`,
            `Adresse: \`${address}\``,
            `Statut: ${serverStatus}`,
            `Version: ${version}`,
            `Modpack: ${modpack}`,
            `ID serveur: #${serverId}`,
            ``,
            `**Bot**`,
            `Compte actif: ${active.email}`,
            `Chrome: ${browserStatus}`,
        ];

        return interaction.editReply(lines.join('\n'));
    }

    // --- /rotate ---
    if (commandName === 'rotate') {
        await interaction.deferReply();

        const dispatched = await triggerGitHubAction();
        if (dispatched) {
            return interaction.editReply('✅ Rotation lancée sur GitHub Actions !');
        }

        return interaction.editReply('❌ Impossible de lancer la rotation sur GitHub Actions.');
    }
});

// ==========================================
// 6. GRACEFUL SHUTDOWN
// ==========================================
let isShuttingDown = false;

async function gracefulShutdown(signal) {
    if (isShuttingDown) return;
    isShuttingDown = true;

    log('INFO', 'Shutdown', `Signal ${signal} recu, arret en cours...`);

    try {
        client.destroy();
        log('INFO', 'Shutdown', 'Client Discord deconnecte.');
    } catch (e) {
        log('WARN', 'Shutdown', `Erreur deconnexion Discord: ${e.message}`);
    }

    try {
        if (BROWSER && BROWSER.connected) {
            await BROWSER.close();
            log('INFO', 'Shutdown', 'Chrome ferme.');
        }
    } catch (e) {
        log('WARN', 'Shutdown', `Erreur fermeture Chrome: ${e.message}`);
    }

    try {
        server.close();
        log('INFO', 'Shutdown', 'Serveur web ferme.');
    } catch (e) {
        log('WARN', 'Shutdown', `Erreur fermeture serveur web: ${e.message}`);
    }

    log('INFO', 'Shutdown', 'Arret termine.');
    process.exit(0);
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

// Capture des rejections de promesses non gerees
process.on('unhandledRejection', (reason) => {
    log('ERROR', 'Process', `Rejection non geree: ${reason}`);
});

process.on('uncaughtException', (error) => {
    log('ERROR', 'Process', `Exception non capturee: ${error.message}`);
    gracefulShutdown('uncaughtException');
});

client.login(TOKEN);
