// ==========================================
// CONFIGURATION & DEPENDANCES
// ==========================================
require('dotenv').config();
const { execSync, spawnSync } = require('child_process');
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

// Le bot ne lit ni ne rafraichit plus les cookies: il pilote l'API REST. Mais
// il ecrit toujours le Gist, donc il doit continuer a proteger les cookies que
// le worker y depose (garde anti-collision de saveToGist).
const SESSION_COOKIE_KEY = 'BOXTOPLAY_SESSION';

let statusMessage = '🔴 | 👥 0 | 🧠 0.00 Go | ⚙️ 0%';

// Global stats cache (refreshed from the official REST API each cycle)
let cachedStats = {
    memoryUsage: '0',
    cpuUsage: '0',
    trialExpiresAt: null,
    lastUpdated: 0
};

const TIMINGS = {
    PRESENCE_INTERVAL: 60 * 1000,
    MONITOR_INTERVAL: 10 * 60 * 1000, // 10 minutes to save CPU/RAM on Render
};

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

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

// Les cles API BoxToPlay (BTP_API_KEY_0/1, une par compte du Gist) ne sont pas
// bloquantes: sans elles le bot tourne, mais la carte de stats reste vide.
if (!process.env.BTP_API_KEY_0 && !process.env.BTP_API_KEY && !process.env.BTP_API_KEY_1) {
    log('WARN', 'Config', 'Aucune cle BTP_API_KEY_* : les stats serveur resteront a zero.');
}

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GIST_ID = process.env.GIST_ID;
const GH_TOKEN = process.env.GH_TOKEN;
const GITHUB_REPO = process.env.GITHUB_REPO;
const IP_DNS = process.env.IP_DNS || 'orny';

// Validate GIST_ID format to prevent SSRF attacks
if (GIST_ID && !/^[a-zA-Z0-9]{20,}$/.test(GIST_ID)) {
    throw new Error('Invalid GIST_ID format. Must be alphanumeric with minimum 20 characters.');
}
const STATS_LOCAL_DIR = path.join(__dirname, 'stats_cache');


const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder } = require('discord.js');
const axios = require('axios');
const express = require('express');
const ftp = require('basic-ftp');

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
        btp_api: cachedStats.lastUpdated > 0 ? 'ok' : 'unknown',
        monitor_locked: monitorLockTimestamp > 0,
        monitor_lock_age_s: monitorLockTimestamp > 0 ? Math.floor((Date.now() - monitorLockTimestamp) / 1000) : null,
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
// 4. SURVEILLANCE (API REST)
// ==========================================
let monitorLockTimestamp = 0;
const MONITOR_LOCK_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes max per cycle

// --- Auto-rotate sur detection offline ---
// Rotation PROACTIVE basee sur l'age du serveur (pas reactive sur orny).
// Le trial gratuit BTP meurt ~12h apres creation. On rotate AVANT (~10h),
// serveur encore vivant -> transfert de monde OK, zero coupure. Espacement
// ~10h => le slot trial de chaque compte est libere (~20h) => plus de 400.
// Pourquoi pas reactif-sur-offline: orny accumule des SRV morts (BTP ne les
// GC pas) -> fetchMcStatus(orny) ment "offline" -> burst de rotations ->
// 400 + orny jamais repose -> boucle infinie (3 nuits d'outage 06-17->06-20).
const ROTATE_AGE_MS = 10 * 60 * 60 * 1000;        // rotate quand le serveur a > 10h
const ROTATE_RETRY_COOLDOWN_MS = 20 * 60 * 1000;  // anti-burst si un dispatch echoue
let lastRotateDispatchAt = 0;
let rotateAnnounced = false;  // 🔄 annonce UNE fois par episode (>10h), pas a chaque re-essai /20min

// --- API REST officielle BoxToPlay (client dans btp.js) ----------------
const { apiKeyFor, createBtpClient } = require('./btp');

const btp = createBtpClient();

/**
 * Rafraichit les stats du serveur actif via l'API.
 *
 * Remplace un cycle navigateur complet (injection de cookies, resolution du
 * challenge Cloudflare, deux fetch dans la page) par un appel: /metrics rend
 * CPU, RAM et joueurs d'un coup.
 */
async function refreshServerStats(account, index) {
    if (index !== LOCAL_STATE.active_account_index) {
        return; // seul le serveur live alimente la presence Discord
    }

    const apiKey = apiKeyFor(account, index);
    if (!apiKey) {
        log('WARN', 'Monitor', `Pas de cle API pour ${account.email} (BTP_API_KEY_${index}).`);
        return;
    }

    const panelId = account.server_id || LOCAL_STATE.current_server_id;
    const service = await btp.resolveService(apiKey, panelId);
    if (!service) {
        log('WARN', 'Monitor', `Serveur #${panelId} absent du compte ${account.email}.`);
        return;
    }

    const metrics = await btp.fetchMetrics(apiKey, service.id);
    cachedStats.memoryUsage = String(metrics.memory_usage_mb ?? 0);
    cachedStats.cpuUsage = String(metrics.cpu_usage_percent ?? 0);
    cachedStats.trialExpiresAt = service.expiresAt;
    cachedStats.lastUpdated = Date.now();
    log('INFO', 'Monitor', `Stats #${panelId}: RAM=${cachedStats.memoryUsage}MB, `
        + `CPU=${cachedStats.cpuUsage}%, essai jusqu'a ${service.expiresAt}`);
}

async function runMonitorCycle() {
    // Anti-deadlock: detecter si un cycle precede est bloque depuis plus de 10 minutes
    if (monitorLockTimestamp > 0 && Date.now() - monitorLockTimestamp > MONITOR_LOCK_TIMEOUT_MS) {
        log('WARN', 'Monitor', 'Verrou bloque depuis >10min, force reinitialisation.');
        monitorLockTimestamp = 0;
    }

    // Protection contre le chevauchement des cycles (verrou simple)
    if (monitorLockTimestamp > 0) {
        log('WARN', 'Monitor', 'Cycle precedent encore en cours, skip.');
        return;
    }

    monitorLockTimestamp = Date.now();
    try {
        // Recharger le state depuis le Gist pour integrer les changements du worker
        await loadFromGist();

        if (!LOCAL_STATE) {
            log('WARN', 'Monitor', 'State non charge, cycle ignore.');
            return;
        }

        // Un seul compte porte le serveur live: parcourir les deux n'avait de
        // sens que pour rafraichir deux sessions navigateur.
        const activeIndex = LOCAL_STATE.active_account_index;
        try {
            await refreshServerStats(LOCAL_STATE.accounts[activeIndex], activeIndex);
        } catch (statsErr) {
            log('WARN', 'Monitor', `Stats compte actif: ${statsErr.message}`);
        }

        // Rotation proactive basee sur l'age (remplace l'ancien reactif-offline
        // qui bursté via orny). Trigger fiable: ce cycle tourne toutes les 10 min.
        try {
            await maybeProactiveRotate();
        } catch (autoErr) {
            log('ERROR', 'Rotate', `Erreur maybeProactiveRotate: ${autoErr.message}`);
        }
    } catch (error) {
        log('ERROR', 'Monitor', `Erreur cycle: ${error.message}`);
    } finally {
        monitorLockTimestamp = 0;
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
    new SlashCommandBuilder().setName('rotate').setDescription('Declenche la rotation via GitHub Actions')
        .addBooleanOption(o => o.setName('force').setDescription('Forcer meme si le serveur est jeune et en ligne')),
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
        if (monitorLockTimestamp > 0 && Date.now() - monitorLockTimestamp > MONITOR_LOCK_TIMEOUT_MS) {
            log('WARN', 'Presence', 'Verrou bloque dans updatePresence, reinitialisation.');
            monitorLockTimestamp = 0;
        }

        // Verifier si une rotation est en cours
        const workflowInProgress = await isWorkflowInProgress();
        if (workflowInProgress) {
            client.user.setActivity('🔄 Rotation en cours...');
            return;
        }

        // Eviter la concurrence avec le cycle keepalive (verrou timestamp)
        if (monitorLockTimestamp > 0) {
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
            // Utiliser les statistiques BTP de RAM/CPU extraites lors du dernier cycle de surveillance
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
    runMonitorCycle().catch(err => {
        log('ERROR', 'Monitor', `Erreur cycle initial: ${err.message}`);
    });

    // Intervalles avec gestion d'erreur sur chaque tick
    setInterval(updatePresence, TIMINGS.PRESENCE_INTERVAL);
    setInterval(() => {
        runMonitorCycle().catch(err => {
            log('ERROR', 'Monitor', `Erreur cycle periodique: ${err.message}`);
        });
    }, TIMINGS.MONITOR_INTERVAL);
});

/**
 * Recupere les donnees du serveur Minecraft via l'API mcsrvstat.us.
 * Retourne null en cas d'erreur.
 */
async function fetchMcStatus() {
    const dnsPromises = require('dns').promises;
    try {
        const dnsName = `${IP_DNS}.boxtoplay.com`;
        log('DEBUG', 'McStatus', `Resolution SRV pour _minecraft._tcp.${dnsName}...`);
        
        let srvRecords = [];
        try {
            srvRecords = await dnsPromises.resolveSrv(`_minecraft._tcp.${dnsName}`);
        } catch (srvErr) {
            log('WARN', 'McStatus', `Echec resolution SRV pour ${dnsName}: ${srvErr.message}`);
        }

        if (srvRecords && srvRecords.length > 0) {
            log('INFO', 'McStatus', `${srvRecords.length} record(s) SRV trouve(s). Verification des cibles...`);
            
            // Verifier toutes les cibles en parallele
            const results = await Promise.all(
                srvRecords.map(async (record) => {
                    const targetStr = `${record.name}:${record.port}`;
                    try {
                        const response = await axios.get(`https://api.mcsrvstat.us/3/${targetStr}`, { timeout: 10000 });
                        if (response.data && response.data.online) {
                            log('INFO', 'McStatus', `Serveur en ligne trouve sur ${targetStr}`);
                            return response.data;
                        }
                    } catch (err) {
                        log('WARN', 'McStatus', `Erreur ping cible ${targetStr}: ${err.message}`);
                    }
                    return null;
                })
            );

            // Retourner le premier resultat en ligne trouvé
            const onlineResult = results.find(r => r !== null);
            if (onlineResult) {
                return onlineResult;
            }

            log('WARN', 'McStatus', `Aucune cible SRV en ligne trouvee.`);
        }

        // Fallback: ping direct du hostname d'origine
        log('INFO', 'McStatus', `Fallback: ping direct de ${dnsName}...`);
        const response = await axios.get(`https://api.mcsrvstat.us/3/${dnsName}`, { timeout: 10000 });
        return response.data;
    } catch (error) {
        log('WARN', 'McStatus', `Erreur globale fetchMcStatus: ${error.message}`);
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

/**
 * Filet de securite: si le serveur Minecraft est offline sur plusieurs cycles
 * consecutifs, declenche une rotation automatiquement (sans intervention humaine).
 * Garde-fous: streak minimal (ignore blips), skip si rotation deja en cours,
 * cooldown pour ne pas spammer pendant qu'une rotation se termine.
 */
/**
 * Poste un message sur le webhook Discord si DISCORD_WEBHOOK_URL est defini.
 * Best-effort: une erreur ici ne casse jamais le cycle keepalive.
 */
async function notifyWebhook(content) {
    const url = process.env.DISCORD_WEBHOOK_URL;
    if (!url) return;
    try {
        // UA navigateur obligatoire: Discord/Cloudflare renvoie 403 (code 1010)
        // sur l'UA par defaut d'axios.
        await axios.post(url, { content }, {
            timeout: 10000,
            headers: { 'User-Agent': USER_AGENT },
        });
    } catch (e) {
        log('WARN', 'Webhook', `Echec notification: ${e.message}`);
    }
}

async function maybeProactiveRotate() {
    // Rotation PROACTIVE: declenche quand le serveur actif depasse ROTATE_AGE_MS,
    // pendant qu'il est ENCORE EN LIGNE (le worker transfere le monde -> aucune
    // coupure). On s'ancre sur last_rotation_at (ecrit par le worker en Phase 5
    // = ~age du serveur). Aucune dependance a orny: l'ancien code reactif-offline
    // se faisait mentir par les SRV morts d'orny et bursté jusqu'au 400.
    const last = LOCAL_STATE?.last_rotation_at;
    if (!last) {
        // Pas d'ancre encore (cold start) -> le cron GitHub couvre ce cas.
        log('INFO', 'Rotate', 'last_rotation_at absent, rotation proactive en attente du 1er cycle worker.');
        return;
    }

    const ageMs = Date.now() - new Date(last).getTime();
    if (!(ageMs >= ROTATE_AGE_MS)) {
        rotateAnnounced = false;  // serveur frais (rotation reussie) -> reset pour le prochain episode
        return; // pas encore l'heure (ou date invalide)
    }

    if (Date.now() - lastRotateDispatchAt < ROTATE_RETRY_COOLDOWN_MS) {
        log('INFO', 'Rotate', 'Dispatch recent, attente du cooldown avant re-essai.');
        return;
    }

    if (await isWorkflowInProgress()) {
        log('INFO', 'Rotate', 'Rotation deja en cours cote GitHub Actions, pas de re-trigger.');
        return;
    }

    log('WARN', 'Rotate', `Serveur age ${Math.round(ageMs / 3.6e6)}h (>${ROTATE_AGE_MS / 3.6e6}h) -> rotation proactive.`);
    lastRotateDispatchAt = Date.now();
    const ok = await triggerGitHubAction();
    // N'annoncer qu'UNE fois par episode (age>10h): les re-essais /20min (slot trial
    // pas encore libere -> le worker reporte proprement) ne doivent pas spammer le
    // channel — le serveur tourne toujours, aucune coupure. Reset quand l'age retombe.
    if (!rotateAnnounced) {
        await notifyWebhook(ok
            ? '🔄 Rotation planifiée déclenchée (serveur encore en ligne, aucune coupure attendue).'
            : '⚠️ Échec déclenchement rotation planifiée, nouvel essai au prochain cycle.');
        if (ok) rotateAnnounced = true;
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
        // La zone orny accumule des SRV morts que BTP ne nettoie pas: une
        // connexion sur deux peut tomber sur un hote eteint. fetchMcStatus()
        // teste chaque cible SRV et ne garde que celle qui repond, donc on
        // peut donner au joueur une adresse directe garantie joignable.
        // Rien n'est stocke: la resoudre en live ne peut pas etre perimee,
        // contrairement a une valeur figee dans le Gist.
        await interaction.deferReply();
        const address = `${IP_DNS}.boxtoplay.com`;
        const data = await fetchMcStatus();
        const lines = [`**Adresse:** \`${address}\``];
        if (data?.online && data.hostname) {
            lines.push(
                `**Adresse directe (si \`${address}\` ne passe pas):** \`${data.hostname}:${data.port}\``,
                `_Elle change a chaque rotation — garde \`${address}\` en favori._`,
            );
        } else {
            lines.push('⚠️ Serveur injoignable pour le moment (rotation en cours ?), reessaie dans 2 min.');
        }
        return interaction.editReply(lines.join('\n'));
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
        const trialLeft = cachedStats.trialExpiresAt
            ? `${Math.max(0, Math.round((new Date(cachedStats.trialExpiresAt).getTime() - Date.now()) / 60000))} min`
            : 'inconnu';
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
            `Essai restant: ${trialLeft}`,
        ];

        return interaction.editReply(lines.join('\n'));
    }

// --- /rotate ---
    if (commandName === 'rotate') {
        await interaction.deferReply();
        const force = interaction.options.getBoolean('force') ?? false;

        // Garde-fou: bloquer une rotation manuelle inutile/dangereuse.
        // Si le serveur est JEUNE (loin de l'expiration ~12h) ET EN LIGNE, il n'y
        // a aucune raison de rotater: ca gache un trial et risque une
        // double-rotation (incident 06-19). On autorise si offline (recovery),
        // si vieux (proche expiration), ou avec force:true.
        if (!force) {
            const last = LOCAL_STATE?.last_rotation_at;
            const ageH = last ? (Date.now() - new Date(last).getTime()) / 3.6e6 : null;
            const status = await fetchMcStatus();
            const online = !!(status && status.online);
            if (ageH !== null && online && ageH < ROTATE_AGE_MS / 3.6e6) {
                return interaction.editReply(
                    `⛔ Rotation bloquée : le serveur a tourné il y a **${ageH.toFixed(1)}h** et est **en ligne** ` +
                    `(rotation auto à ${ROTATE_AGE_MS / 3.6e6}h). La rotater maintenant gâche un trial et risque une double-rotation.\n` +
                    `Si tu es sûr (serveur à remplacer, bug…), relance avec \`/rotate force:true\`.`
                );
            }
        }

        const dispatched = await triggerGitHubAction();
        if (dispatched) {
            return interaction.editReply(force
                ? '✅ Rotation **forcée** lancée sur GitHub Actions !'
                : '✅ Rotation lancee sur GitHub Actions !');
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
