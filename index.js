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

// Global stats cache (refreshed via Puppeteer during KeepAlive cycles)
let cachedStats = {
    memoryUsage: '0',
    cpuUsage: '0',
    lastUpdated: 0
};

const TIMINGS = {
    CLOUDFLARE_TIMEOUT: 30000,
    CLOUDFLARE_SETTLE_DELAY: 3000,
    PAGE_NAVIGATION_TIMEOUT: 30000,
    PAGE_LOAD_TIMEOUT: 60000,
    CHROME_INSTALL_TIMEOUT: 180000,
    INTER_ACCOUNT_DELAY: 3000,
    PRESENCE_INTERVAL: 60 * 1000,
    KEEPALIVE_INTERVAL: 10 * 60 * 1000, // 10 minutes to save CPU/RAM on Render
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
const STATS_LOCAL_DIR = path.join(__dirname, 'stats_cache');

// ==========================================
// INSTALLATION CHROME SECURISEE
// ==========================================

const CHROME_BINARY_NAMES = ['chrome-headless-shell', 'chrome'];

/**
 * Recherche recursive du binaire Chrome dans un repertoire.
 * Utilise fs.statSync pour suivre les liens symboliques.
 */
function findChromeRecursive(dir, depth = 0) {
    if (depth > 8) return null;
    try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            if (CHROME_BINARY_NAMES.includes(entry.name)) {
                try {
                    // statSync follows symlinks — catches both regular files and symlinked binaries
                    if (fs.statSync(fullPath).isFile()) return fullPath;
                } catch { /* skip */ }
            }
            // Follow directories AND symlinks to directories
            try {
                if (fs.statSync(fullPath).isDirectory()) {
                    const result = findChromeRecursive(fullPath, depth + 1);
                    if (result) return result;
                }
            } catch { /* skip */ }
        }
    } catch {
        // Ignore permission errors
    }
    return null;
}

(function installChrome() {
    try {
        function getCacheDirs() {
            return [
                process.env.PUPPETEER_CACHE_DIR,
                '/tmp/puppeteer',
                '/opt/render/.cache/puppeteer',
                path.join(os.homedir(), '.cache', 'puppeteer'),
            ].filter(Boolean);
        }

        function findChromeBinary() {
            for (const dir of getCacheDirs()) {
                if (!fs.existsSync(dir)) continue;
                const p = findChromeRecursive(dir);
                if (p) return p;
            }
            return null;
        }

        // Clean corrupted cache dirs: dir exists but no binary inside
        for (const dir of getCacheDirs()) {
            if (!fs.existsSync(dir)) continue;
            if (findChromeRecursive(dir)) continue;
            for (const sub of ['chrome-headless-shell', 'chrome']) {
                const subdir = path.join(dir, sub);
                if (fs.existsSync(subdir)) {
                    log('WARN', 'Chrome', `Cache corrompu dans ${subdir}, nettoyage...`);
                    fs.rmSync(subdir, { recursive: true, force: true });
                }
            }
        }

        let chromePath = findChromeBinary();

        if (!chromePath) {
            log('INFO', 'Chrome', 'Chrome non trouve, telechargement...');
            const installEnv = { ...process.env };
            delete installEnv.PUPPETEER_SKIP_DOWNLOAD;
            // Prefer PUPPETEER_CACHE_DIR (set to /opt/render/.cache/puppeteer on Render)
            // which has more disk space than /tmp. Fall back to homedir cache.
            const CHROME_INSTALL_DIR = process.env.PUPPETEER_CACHE_DIR
                || path.join(os.homedir(), '.cache', 'puppeteer');
            let installOutput = '';
            try {
                installOutput = execSync(
                    `npx @puppeteer/browsers install chrome-headless-shell@stable --path ${CHROME_INSTALL_DIR}`,
                    { timeout: TIMINGS.CHROME_INSTALL_TIMEOUT, env: installEnv, encoding: 'utf8' }
                );
                log('INFO', 'Chrome', `Install output: ${installOutput.trim()}`);
            } catch (installErr) {
                log('ERROR', 'Chrome', `Install command failed: ${installErr.message}`);
            }

            // Parse last line: "chrome-headless-shell@version /path/to/dir"
            const lines = installOutput.trim().split('\n').filter(Boolean);
            const lastLine = lines[lines.length - 1] || '';
            const parts = lastLine.trim().split(/\s+/);
            if (parts.length >= 2) {
                for (const name of CHROME_BINARY_NAMES) {
                    const candidate = path.join(parts[parts.length - 1], name);
                    try {
                        if (fs.statSync(candidate).isFile()) {
                            chromePath = candidate;
                            log('INFO', 'Chrome', `Chrome trouve via output parse: ${chromePath}`);
                            break;
                        }
                    } catch { /* skip */ }
                }
            }

            if (!chromePath) chromePath = findChromeBinary();

            // @puppeteer/browsers Node.js unzip silently fails on large binary entries.
            // Fallback: find the downloaded zip and extract with system unzip.
            if (!chromePath) {
                const shellsDir = path.join(CHROME_INSTALL_DIR, 'chrome-headless-shell');
                try {
                    const zips = fs.existsSync(shellsDir)
                        ? fs.readdirSync(shellsDir).filter(f => f.endsWith('.zip'))
                        : [];
                    for (const zip of zips) {
                        const zipPath = path.join(shellsDir, zip);
                        const m = zip.match(/^([\d.]+)-chrome-headless-shell/);
                        if (!m) continue;
                        const extractTo = path.join(shellsDir, `linux-${m[1]}`);
                        log('INFO', 'Chrome', `Extraction système (unzip): ${zip}`);
                        try {
                            const out = execSync(`unzip -o "${zipPath}" -d "${extractTo}" 2>&1`, { timeout: 60000, encoding: 'utf8' });
                            log('INFO', 'Chrome', `unzip: ${out.slice(0, 200)}`);
                            // Make binary executable
                            execSync(`find "${extractTo}" -name 'chrome-headless-shell' -type f -exec chmod +x {} \\;`, { timeout: 5000 });
                        } catch (uzErr) {
                            log('ERROR', 'Chrome', `unzip echoue: ${uzErr.message.slice(0, 200)}`);
                        }
                    }
                    chromePath = findChromeBinary();
                } catch (fallbackErr) {
                    log('ERROR', 'Chrome', `Fallback unzip erreur: ${fallbackErr.message}`);
                }
            }

            // Diagnostic: show dir contents if still missing
            if (!chromePath) {
                try {
                    const listing = execSync(`find "${CHROME_INSTALL_DIR}" -maxdepth 5 2>/dev/null | head -40`, { encoding: 'utf8', timeout: 5000 });
                    log('WARN', 'Chrome', `Contenu de ${CHROME_INSTALL_DIR}:\n${listing || '(vide)'}`);
                } catch { /* ignore */ }
            }
        }

        if (chromePath) {
            // Set explicitly so puppeteer.launch() finds it regardless of internal config
            process.env.PUPPETEER_EXECUTABLE_PATH = chromePath;
            log('INFO', 'Chrome', `Chrome pret: ${chromePath}`);
        } else {
            log('ERROR', 'Chrome', 'Chrome introuvable apres installation.');
        }
    } catch (e) {
        log('ERROR', 'Chrome', `Erreur installation Chrome: ${e.message}`);
    }
})();

const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder } = require('discord.js');
const axios = require('axios');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const express = require('express');
const ftp = require('basic-ftp');

puppeteer.use(StealthPlugin());

// ==========================================
// 1. SERVEUR WEB (KEEP-ALIVE RENDER)
// ==========================================
const app = express();
const PORT = process.env.PORT || 3000;
app.get('/', (req, res) => res.send('Bot BoxToPlay V4 - Full Puppeteer'));
app.get('/keep-alive', (req, res) => res.status(200).send('OK'));
app.get('/health', (req, res) => {
    const mem = process.memoryUsage();
    const toMb = (bytes) => (bytes / 1024 / 1024).toFixed(1);
    res.json({
        status: 'ok',
        uptime_s: Math.floor(process.uptime()),
        memory: {
            rss_mb: toMb(mem.rss),
            heap_used_mb: toMb(mem.heapUsed),
            heap_total_mb: toMb(mem.heapTotal),
            external_mb: toMb(mem.external),
        },
        chrome: BROWSER && BROWSER.connected ? 'connected' : 'disconnected',
        keepalive_locked: keepAliveLockTimestamp > 0,
        keepalive_lock_age_s: keepAliveLockTimestamp > 0 ? Math.floor((Date.now() - keepAliveLockTimestamp) / 1000) : null,
        state_loaded: LOCAL_STATE !== null,
        accounts: LOCAL_STATE?.accounts?.length ?? null,
        active_account: LOCAL_STATE?.accounts?.[LOCAL_STATE?.active_account_index]?.email ?? null,
        last_written_at: LOCAL_STATE?.last_written_at ?? null,
    });
});
const server = app.listen(PORT, () => log('INFO', 'Web', `Serveur Web sur le port ${PORT}`));

// ==========================================
// 2. GESTION DE L'ETAT (GIST)
// ==========================================
let LOCAL_STATE = null;
let GIST_FILENAME = null;
let LOADED_STATE = null;
let expectedLastWrittenAt = null;

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

function mergeState(local, loaded, remote) {
    if (!loaded) {
        return JSON.parse(JSON.stringify(local));
    }
    
    const merged = JSON.parse(JSON.stringify(remote));
    
    // Top-level key merge (excluding accounts and last_written_at)
    for (const key of Object.keys(local)) {
        if (key === 'accounts' || key === 'last_written_at') continue;
        
        if (JSON.stringify(local[key]) !== JSON.stringify(loaded[key])) {
            merged[key] = JSON.parse(JSON.stringify(local[key]));
        }
    }
    
    // Merge accounts
    if (Array.isArray(local.accounts) && Array.isArray(remote.accounts)) {
        merged.accounts = JSON.parse(JSON.stringify(remote.accounts));
        
        for (let i = 0; i < local.accounts.length; i++) {
            const localAcc = local.accounts[i];
            const loadedAcc = loaded.accounts ? loaded.accounts[i] : null;
            const mergedAcc = merged.accounts[i];
            
            if (!localAcc || !mergedAcc) continue;
            
            // Check top-level properties of the account
            for (const accKey of Object.keys(localAcc)) {
                if (accKey === 'cookies') continue;
                
                const loadedVal = loadedAcc ? loadedAcc[accKey] : undefined;
                if (JSON.stringify(localAcc[accKey]) !== JSON.stringify(loadedVal)) {
                    mergedAcc[accKey] = JSON.parse(JSON.stringify(localAcc[accKey]));
                }
            }
            
            // Check cookies dictionary
            if (localAcc.cookies && typeof localAcc.cookies === 'object') {
                if (!mergedAcc.cookies) mergedAcc.cookies = {};
                const loadedCookies = loadedAcc ? loadedAcc.cookies : null;
                
                for (const cookieKey of Object.keys(localAcc.cookies)) {
                    const loadedVal = loadedCookies ? loadedCookies[cookieKey] : undefined;
                    if (localAcc.cookies[cookieKey] !== loadedVal) {
                        mergedAcc.cookies[cookieKey] = localAcc.cookies[cookieKey];
                    }
                }
            }
        }
    }
    
    return merged;
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
        LOADED_STATE = JSON.parse(JSON.stringify(parsed));
        expectedLastWrittenAt = parsed.last_written_at || null;
        log('INFO', 'Gist', `State charge: ${LOCAL_STATE.accounts.length} compte(s), last_written_at=${LOCAL_STATE.last_written_at || 'absent'}.`);
    } catch (error) {
        log('ERROR', 'Gist', `Erreur chargement: ${error.message}`);
    }
}

async function saveToGist() {
    if (!GIST_FILENAME || !LOCAL_STATE) return;

    // Guard: detect cookie collision before any write
    if (LOCAL_STATE.accounts.length >= 2) {
        const s0 = LOCAL_STATE.accounts[0]?.cookies?.[SESSION_COOKIE_KEY];
        const s1 = LOCAL_STATE.accounts[1]?.cookies?.[SESSION_COOKIE_KEY];
        if (s0 && s1 && s0 === s1) {
            const msg = 'ALERTE CRITIQUE: Collision de cookies détectée ! Annulation de la sauvegarde Gist pour protéger la data.';
            log('ERROR', 'Gist', msg);
            throw new Error(msg);
        }
    }

    const maxAttempts = 3;
    let lastError;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            log('INFO', 'Gist', `Tentative de sauvegarde ${attempt}/${maxAttempts}...`);
            
            // 1. Fetch fresh remote state
            const remoteResponse = await axios.get(URLS.GITHUB_GIST(GIST_ID), {
                headers: { 'Authorization': `token ${GH_TOKEN}` }
            });
            const remoteFiles = remoteResponse.data.files;
            const remoteParsed = JSON.parse(remoteFiles[GIST_FILENAME].content);
            const remoteTs = remoteParsed?.last_written_at;

            let stateToWrite = LOCAL_STATE;

            // 2. Concurrency Check and Merge
            if (remoteTs !== expectedLastWrittenAt) {
                log('WARN', 'Gist', `Conflit detecte! Gist modifie par un tiers (remoteTs=${remoteTs || 'absent'}, expected=${expectedLastWrittenAt || 'absent'}). Fusion en cours...`);
                stateToWrite = mergeState(LOCAL_STATE, LOADED_STATE, remoteParsed);
                validateState(stateToWrite);
            }

            // 3. Update timestamp
            stateToWrite.last_written_at = new Date().toISOString();

            // Guard: check cookie collision on the state to write
            if (stateToWrite.accounts.length >= 2) {
                const s0 = stateToWrite.accounts[0]?.cookies?.[SESSION_COOKIE_KEY];
                const s1 = stateToWrite.accounts[1]?.cookies?.[SESSION_COOKIE_KEY];
                if (s0 && s1 && s0 === s1) {
                    const msg = 'ALERTE CRITIQUE: Collision de cookies détectée après fusion ! Annulation de la sauvegarde Gist.';
                    log('ERROR', 'Gist', msg);
                    throw new Error(msg);
                }
            }

            // 4. PATCH the Gist
            await axios.patch(URLS.GITHUB_GIST(GIST_ID), {
                files: { [GIST_FILENAME]: { content: JSON.stringify(stateToWrite, null, 4) } }
            }, { headers: { 'Authorization': `token ${GH_TOKEN}` } });

            // 5. Update local tracking variables on success
            LOCAL_STATE = stateToWrite;
            LOADED_STATE = JSON.parse(JSON.stringify(stateToWrite));
            expectedLastWrittenAt = stateToWrite.last_written_at;
            log('INFO', 'Gist', `State sauvegarde avec succes a la tentative ${attempt} (last_written_at=${expectedLastWrittenAt}).`);
            return;
        } catch (error) {
            lastError = error;
            log('ERROR', 'Gist', `Echec de la tentative de sauvegarde ${attempt}/${maxAttempts}: ${error.message}`);
            if (attempt < maxAttempts) {
                const delay = 1000 * Math.pow(2, attempt - 1);
                await new Promise(r => setTimeout(r, delay));
            }
        }
    }
    throw lastError;
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

/**
 * Construit le header Cookie depuis le state du compte.
 * cookies[SESSION_COOKIE_KEY] contient deja la chaine complete:
 * "BOXTOPLAY_SESSION=abc;cf_clearance=xyz;..."
 */
function buildCookieHeader(account) {
    return account.cookies?.[SESSION_COOKIE_KEY] || '';
}

/**
 * Fetch direct vers l'API BoxToPlay sans browser.
 * Fonctionne si cf_clearance + BOXTOPLAY_SESSION sont valides.
 * Retourne { status, body }.
 */
async function btpApiFetch(url, cookieHeader) {
    const response = await axios.get(url, {
        headers: {
            Cookie: cookieHeader,
            'X-Requested-With': 'XMLHttpRequest',
            'User-Agent': USER_AGENT,
            'Referer': 'https://www.boxtoplay.com/panel',
        },
        timeout: FETCH_TIMEOUT_MS,
        validateStatus: null,
    });
    return { status: response.status, body: String(response.data ?? '').trim() };
}
const BROWSER_CLOSE_TIMEOUT_MS = 5000; // 5s timeout for browser.close()

async function checkAccount(account, index) {
    if (!account.cookies[SESSION_COOKIE_KEY]) {
        log('WARN', 'KeepAlive', `Skip ${account.email} (pas de cookie de session)`);
        return;
    }

    log('INFO', 'KeepAlive', `Maintien de session et refresh cookies pour ${account.email} via navigateur...`);
    await refreshCookiesWithBrowser(account, index);
}

async function refreshCookiesWithBrowser(account, index) {
    let page = null;
    try {
        const browser = await getBrowser();
        page = await browser.newPage();
        await page.setUserAgent(USER_AGENT);
        await page.setViewport({ width: 1366, height: 768 });

        const cdpSession = await page.createCDPSession();
        await cdpSession.send('Network.clearBrowserCookies');
        await cdpSession.detach();

        await injectCookies(page, account.cookies[SESSION_COOKIE_KEY]);

        await page.goto(URLS.BOXTOPLAY_PANEL, {
            waitUntil: 'networkidle2',
            timeout: TIMINGS.PAGE_NAVIGATION_TIMEOUT,
        });

        const title = await page.title();
        if (title.includes(CLOUDFLARE_CHALLENGE_TITLE)) {
            try {
                await page.waitForFunction(
                    (challengeTitle) => !document.title.includes(challengeTitle),
                    { timeout: TIMINGS.CLOUDFLARE_TIMEOUT },
                    CLOUDFLARE_CHALLENGE_TITLE
                );
                await new Promise(r => setTimeout(r, TIMINGS.CLOUDFLARE_SETTLE_DELAY));
            } catch {
                log('ERROR', 'KeepAlive', `Challenge non resolu pour ${account.email}`);
                return;
            }
        }

        if (page.url().includes('login')) {
            log('ERROR', 'KeepAlive', `SESSION EXPIREE pour ${account.email}`);
            return;
        }

        // Extraire et sauvegarder les cookies
        await extractAndUpdateCookies(page, index);
        log('INFO', 'KeepAlive', `Cookies rafraichis pour ${account.email}`);

        // Extraire les statistiques d'utilisation du serveur actif en tâche de fond (dans le contexte browser)
        const serverId = account.server_id ||
            (index === LOCAL_STATE.active_account_index ? LOCAL_STATE.current_server_id : null);

        if (serverId && index === LOCAL_STATE.active_account_index) {
            try {
                log('INFO', 'KeepAlive', `Recuperation des stats BTP pour le serveur #${serverId}...`);
                const stats = await page.evaluate(async (urls) => {
                    async function fetchText(url) {
                        const response = await fetch(url, { credentials: 'include' });
                        if (!response.ok) throw new Error(`HTTP ${response.status}`);
                        return (await response.text()).trim();
                    }
                    const [mem, cpu] = await Promise.all([
                        fetchText(urls.memory),
                        fetchText(urls.cpu),
                    ]);
                    return { mem, cpu };
                }, {
                    memory: URLS.BOXTOPLAY_MEMORY_USAGE(serverId),
                    cpu: URLS.BOXTOPLAY_CPU_USAGE(serverId),
                });

                cachedStats.memoryUsage = stats.mem || '0';
                cachedStats.cpuUsage = stats.cpu || '0';
                cachedStats.lastUpdated = Date.now();
                log('INFO', 'KeepAlive', `Stats BTP mis a jour: RAM=${stats.mem}MB, CPU=${stats.cpu}%`);
            } catch (statsErr) {
                log('WARN', 'KeepAlive', `Impossible de recuperer les stats BTP: ${statsErr.message}`);
            }
        }
    } catch (error) {
        log('ERROR', 'KeepAlive', `Erreur refresh cookies ${account.email}: ${error.message}`);
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
    new SlashCommandBuilder().setName('time').setDescription('Classement des temps de jeu des joueurs'),
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

        // Verifier si une rotation est en cours
        const workflowInProgress = await isWorkflowInProgress();
        if (workflowInProgress) {
            client.user.setActivity('🔄 Rotation en cours...');
            return;
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
        const serverId = LOCAL_STATE.current_server_id;

        // Recuperer le statut MC via l'API publique mcsrvstat (pas de Cloudflare block)
        const mcStatus = await fetchMcStatus();

        if (!mcStatus) {
            throw new Error('Impossible de joindre le serveur (API indisponible)');
        }

        const isOnline = mcStatus.online;
        const onlinePlayers = mcStatus.players?.online ?? 0;
        
        let statusIcon = '🔴';
        let memoryGo = 0;
        let cpuPercent = 0;

        if (isOnline) {
            statusIcon = '🟢';
            // Utiliser les statistiques BTP de RAM/CPU extraites lors du dernier KeepAlive
            memoryGo = Number(cachedStats.memoryUsage || 0) / 1000;
            cpuPercent = Number(cachedStats.cpuUsage || 0);
        }

        statusMessage = `${statusIcon} | 👥 ${onlinePlayers} | 🧠 ${memoryGo.toFixed(2)} Go | ⚙️ ${cpuPercent}%`;
        client.user.setActivity(statusMessage);
        log('INFO', 'Presence', `Updated activity for ${account.email}: ${statusMessage}`);
    } catch (e) {
        log('WARN', 'Presence', `Erreur: ${e.message}`);
        // Ne plus marquer "Session expirée" sur une simple erreur d'API publique
        // mais conserver le dernier statut connu
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

/**
 * Verifie si un workflow GitHub Actions est en cours pour le repo configure
 */
async function isWorkflowInProgress() {
    try {
        const response = await axios.get(
            `https://api.github.com/repos/${GITHUB_REPO}/actions/runs?per_page=1`,
            {
                headers: {
                    Authorization: `token ${GH_TOKEN}`,
                    Accept: 'application/vnd.github.v3+json',
                },
                timeout: 10000,
            }
        );

        if (response.data?.workflow_runs?.length > 0) {
            const latestRun = response.data.workflow_runs[0];
            return latestRun.status === 'in_progress' || latestRun.status === 'queued';
        }
        return false;
    } catch (error) {
        log('WARN', 'Workflow', `Erreur verification status: ${error.message}`);
        return false;
    }
}

// ==========================================
// 7. FONCTIONS FTP & TIME COMMAND
// ==========================================

/**
 * Formate les secondes en format lisible (j h m s)
 */
function formatPlayTime(seconds) {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);

    const parts = [];
    if (days > 0) parts.push(`${days}j`);
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0) parts.push(`${minutes}m`);
    if (secs > 0 || parts.length === 0) parts.push(`${secs}s`);

    return parts.join(' ');
}

/**
 * Synchronise les fichiers stats depuis le serveur FTP
 * Retourne la liste des fichiers telecharges
 */
async function syncStatsFromFTP() {
    if (!LOCAL_STATE) {
        throw new Error('State non charge');
    }

    const activeIndex = LOCAL_STATE.active_account_index;
    const account = LOCAL_STATE.accounts[activeIndex];
    const ftpHost = account?.ftp_host;
    const ftpUser = account?.ftp_user;
    const ftpPassword = LOCAL_STATE.ftp_password;

    if (!ftpHost || !ftpUser || !ftpPassword) {
        throw new Error('Configuration FTP manquante dans le Gist');
    }

    // Creer le dossier local si inexistant
    if (!fs.existsSync(STATS_LOCAL_DIR)) {
        fs.mkdirSync(STATS_LOCAL_DIR, { recursive: true });
    }

    const client = new ftp.Client();
    client.ftp.verbose = false;

    try {
        await client.connect(ftpHost, 21);
        await client.login(ftpUser, ftpPassword);

        // Naviguer vers le dossier stats (chemin a adapter selon le serveur)
        // Essayer plusieurs chemins possibles
        const possiblePaths = ['world/stats', 'minecraft/world/stats', './world/stats'];
        let statsPath = null;

        for (const p of possiblePaths) {
            try {
                await client.cd(p);
                statsPath = p;
                break;
            } catch {
                // Chemin non valide, passer au suivant
            }
        }

        if (!statsPath) {
            throw new Error('Dossier stats non trouve sur le serveur FTP');
        }

        log('INFO', 'FTP', `Connecte, dossier: ${statsPath}`);

        // Liste des fichiers distants
        const remoteFiles = await client.list();
        const jsonFiles = remoteFiles.filter(f => f.name.endsWith('.json'));

        let downloadedCount = 0;

        for (const file of jsonFiles) {
            const localPath = path.join(STATS_LOCAL_DIR, file.name);
            const remoteMtime = file.modifiedAt;

            // Safety: valider que remoteMtime est une date valide avant de l'utiliser
            let remoteMtimeMs = null;
            if (remoteMtime) {
                try {
                    const parsed = new Date(remoteMtime).getTime();
                    if (!isNaN(parsed)) {
                        remoteMtimeMs = parsed;
                    }
                } catch (e) {
                    log('WARN', 'FTP', `Date invalide pour ${file.name}: ${remoteMtime}`);
                }
            }

            // Verifier si le fichier local existe et est plus recent
            let needsDownload = true;
            if (fs.existsSync(localPath) && remoteMtimeMs !== null) {
                const localStat = fs.statSync(localPath);
                // Telecharger seulement si le fichier distant est plus recent (difference > 1 seconde)
                if (localStat.mtime.getTime() >= remoteMtimeMs - 1000) {
                    needsDownload = false;
                }
            }

            if (needsDownload) {
                await client.download(localPath, file.name);
                downloadedCount++;
            }
        }

        log('INFO', 'FTP', `${downloadedCount} fichier(s) telecharge(s)/mis a jour(s)`);
        return downloadedCount;

    } finally {
        client.close();
    }
}

/**
 * Recupere le temps de jeu de tous les joueurs depuis les fichiers locaux
 */
async function getPlayerPlayTimes() {
    if (!fs.existsSync(STATS_LOCAL_DIR)) {
        return [];
    }

    const files = fs.readdirSync(STATS_LOCAL_DIR);
    const playerStats = [];

    for (const file of files) {
        if (file.endsWith('.json')) {
            const uuid = file.replace('.json', '');
            const filePath = path.join(STATS_LOCAL_DIR, file);

            try {
                const content = fs.readFileSync(filePath, 'utf8');
                const stats = JSON.parse(content);

                // Recuperer le temps de jeu en ticks
                const playTimeTicks = stats?.stats?.["minecraft:custom"]?.["minecraft:play_time"] || 0;
                // Conversion: 1 tick = 0.05 seconde
                const playTimeSeconds = playTimeTicks * 0.05;

                playerStats.push({ uuid, playTimeSeconds });
            } catch (e) {
                log('WARN', 'Stats', `Erreur lecture ${file}: ${e.message}`);
            }
        }
    }

    // Trier par temps de jeu decroissant
    playerStats.sort((a, b) => b.playTimeSeconds - a.playTimeSeconds);
    return playerStats;
}

/**
 * Recupere le nom du joueur depuis l'API Mojang
 */
async function fetchPlayerName(uuid) {
    try {
        const response = await axios.get(
            `https://api.minecraftservices.com/minecraft/profile/lookup/${uuid}`,
            { timeout: 10000 }
        );
        return response.data.name || null;
    } catch {
        return null;
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
            return interaction.editReply('✅ Rotation lancee sur GitHub Actions !');
        }

        return interaction.editReply('❌ Impossible de lancer la rotation sur GitHub Actions.');
    }

    // --- /time ---
    if (commandName === 'time') {
        await interaction.deferReply();

        // Verifier que le state est charge
        if (!LOCAL_STATE) {
            return interaction.editReply('❌ State non charge. Reessayez dans quelques secondes.');
        }

        try {
            // Synchroniser les fichiers stats depuis le FTP
            await interaction.editReply('🔄 Synchronisation des donnees de temps de jeu...');
            const downloaded = await syncStatsFromFTP();

            if (downloaded === 0) {
                // Verifier si on a des fichiers locaux
                const players = await getPlayerPlayTimes();
                if (players.length === 0) {
                    return interaction.editReply('Aucun fichier de stats trouve sur le serveur.');
                }
            }

            // Recuperer les temps de jeu
            const playerStats = await getPlayerPlayTimes();

            if (playerStats.length === 0) {
                return interaction.editReply('Aucun joueur trouve.');
            }

            // Recuperer les noms des joueurs (en parallele pour la vitesse)
            const playerDetails = await Promise.all(
                playerStats.slice(0, 10).map(async (player) => {
                    const name = await fetchPlayerName(player.uuid);
                    return {
                        name: name || `Joueur (${player.uuid.substring(0, 8)}...)`,
                        formattedTime: formatPlayTime(player.playTimeSeconds),
                        seconds: player.playTimeSeconds
                    };
                })
            );

            // Creer l'embed Discord
            const embed = {
                color: 0x0099ff,
                title: '⏱️ Temps de jeu sur le serveur',
                description: `Classement des ${playerDetails.length} premiers joueurs${downloaded > 0 ? ` (${downloaded} fichier(s) mis a jour)` : ''}:`,
                fields: playerDetails.map((player, index) => ({
                    name: `#${index + 1} ${player.name}`,
                    value: player.formattedTime,
                    inline: false
                })),
                timestamp: new Date().toISOString(),
                footer: {
                    text: 'Temps de jeu calcule depuis les donnees du serveur'
                }
            };

            return interaction.editReply({ content: null, embeds: [embed] });

        } catch (error) {
            log('ERROR', 'Time', `Erreur: ${error.message}`);
            return interaction.editReply(`❌ Erreur lors de la recuperation des temps de jeu: ${error.message}`);
        }
    }
});

// ==========================================
// 6. GRACEFUL SHUTDOWN
// ==========================================
let isShuttingDown = false;

async function gracefulShutdown(signal, exitCode = 0) {
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
    process.exit(exitCode);
}

process.on('SIGINT', () => gracefulShutdown('SIGINT', 0));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM', 0));

// Capture des rejections de promesses non gerees
process.on('unhandledRejection', (reason) => {
    log('ERROR', 'Process', `Rejection non geree: ${reason}`);
});

process.on('uncaughtException', (error) => {
    log('ERROR', 'Process', `Exception non capturee: ${error.message}`);
    gracefulShutdown('uncaughtException', 1);
});

client.login(TOKEN);
