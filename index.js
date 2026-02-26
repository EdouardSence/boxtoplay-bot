// ==========================================
// CONFIGURATION & DEPENDANCES
// ==========================================
require('dotenv').config();
const { execSync } = require('child_process');
const fs = require('fs');

// --- INSTALLER CHROME AU DÉMARRAGE (avant tout import Puppeteer) ---
(function installChrome() {
    try {
        // Vérifier si Chrome est déjà là
        const cacheDirs = [
            process.env.PUPPETEER_CACHE_DIR,
            '/opt/render/.cache/puppeteer',
            require('os').homedir() + '/.cache/puppeteer'
        ].filter(Boolean);

        let found = false;
        for (const dir of cacheDirs) {
            if (fs.existsSync(dir)) {
                const chromeFiles = execSync(`find ${dir} -name 'chrome' -type f 2>/dev/null || true`, { encoding: 'utf-8' }).trim();
                if (chromeFiles) {
                    console.log('🌐 Chrome déjà installé:', chromeFiles.split('\n')[0]);
                    found = true;
                    break;
                }
            }
        }

        if (!found) {
            console.log('🌐 Chrome non trouvé, téléchargement en cours (peut prendre 1-2 min)...');
            execSync('npx puppeteer browsers install chrome', {
                stdio: 'inherit',
                timeout: 180000
            });
            console.log('🌐 Chrome installé avec succès !');
        }
    } catch (e) {
        console.error('⚠️ Erreur install Chrome:', e.message);
    }
})();

const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder } = require('discord.js');
const axios = require('axios');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const express = require('express');

puppeteer.use(StealthPlugin());

// Secrets
const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GIST_ID = process.env.GIST_ID;
const GH_TOKEN = process.env.GH_TOKEN;
const IP_DNS = process.env.IP_DNS || 'orny';

// User-Agent cohérent entre Puppeteer et curl
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

// Headers pour curl
const BROWSER_HEADERS = {
    'User-Agent': USER_AGENT,
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
    'Accept-Language': 'fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7',
    'Sec-Ch-Ua': '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
    'Sec-Ch-Ua-Mobile': '?0',
    'Sec-Ch-Ua-Platform': '"Windows"',
};

// Cache du cf_clearance obtenu par Puppeteer (partagé entre comptes, lié à l'IP)
let CF_CLEARANCE = null;

// ==========================================
// 1. SERVEUR WEB (KEEP-ALIVE RENDER)
// ==========================================
const app = express();
const PORT = process.env.PORT || 3000;
app.get('/', (req, res) => res.send('🤖 Bot BoxToPlay - Session Keeper V3 (Puppeteer)'));
app.get('/keep-alive', (req, res) => res.status(200).send('Ping reçu !'));
app.listen(PORT, () => console.log(`🌍 Serveur Web écoute sur le port ${PORT}`));

// ==========================================
// 2. GESTION DE L'ÉTAT (GIST)
// ==========================================

let LOCAL_STATE = null;
let GIST_FILENAME = null;

async function loadFromGist() {
    try {
        console.log("📥 Chargement Gist...");
        const response = await axios.get(`https://api.github.com/gists/${GIST_ID}`, {
            headers: { 'Authorization': `token ${GH_TOKEN}` }
        });
        const files = response.data.files;
        GIST_FILENAME = Object.keys(files)[0];
        LOCAL_STATE = JSON.parse(files[GIST_FILENAME].content);
        console.log("✅ État chargé.");

        // Résoudre le challenge Cloudflare AVANT de lancer le cycle
        await solveCloudflareChallenge();
        runKeepAliveCycle();
    } catch (error) {
        console.error("❌ Erreur Load Gist:", error.message);
    }
}

async function saveToGist() {
    if (!GIST_FILENAME || !LOCAL_STATE) return;
    try {
        await axios.patch(`https://api.github.com/gists/${GIST_ID}`, {
            files: { [GIST_FILENAME]: { content: JSON.stringify(LOCAL_STATE, null, 4) } }
        }, { headers: { 'Authorization': `token ${GH_TOKEN}` } });
        console.log("💾 Gist mis à jour.");
    } catch (error) {
        console.error("❌ Erreur Save Gist:", error.message);
    }
}

// ==========================================
// 3. PUPPETEER-STEALTH (Résoudre le challenge Cloudflare)
// ==========================================

/**
 * Lance un vrai Chrome headless stealth qui résout le challenge Cloudflare.
 * Récupère le cookie cf_clearance depuis l'IP du serveur.
 */
async function solveCloudflareChallenge() {
    console.log("🌐 Lancement Puppeteer-stealth pour résoudre Cloudflare...");

    let browser = null;
    try {
        browser = await puppeteer.launch({
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
            ],
        });

        const page = await browser.newPage();
        await page.setUserAgent(USER_AGENT);
        await page.setViewport({ width: 1920, height: 1080 });

        console.log("   ⏳ Navigation vers boxtoplay.com...");
        await page.goto('https://www.boxtoplay.com/fr/login', {
            waitUntil: 'networkidle2',
            timeout: 60000,
        });

        // Attendre que le challenge soit résolu (titre change de "Just a moment...")
        console.log("   ⏳ Attente résolution du challenge (max 30s)...");
        try {
            await page.waitForFunction(
                () => !document.title.includes('Just a moment'),
                { timeout: 30000 }
            );
        } catch (e) {
            console.log("   ⚠️ Timeout — le challenge n'a peut-être pas été présenté");
        }

        // Pause supplémentaire
        await new Promise(r => setTimeout(r, 3000));

        const title = await page.title();
        console.log(`   📄 Titre final: "${title}"`);

        // Récupérer les cookies
        const cookies = await page.cookies('https://www.boxtoplay.com');
        const cfCookie = cookies.find(c => c.name === 'cf_clearance');

        if (cfCookie) {
            CF_CLEARANCE = cfCookie.value;
            console.log(`   ✅ cf_clearance obtenu ! (expire dans ~30min)`);
        } else {
            console.log("   ⚠️ Pas de cf_clearance. Cookies:", cookies.map(c => c.name).join(', '));
            // Peut-être que Cloudflare n'a pas mis de challenge (IP locale par ex.)
        }

        await browser.close();
        browser = null;
        console.log("🌐 Puppeteer fermé.\n");

    } catch (error) {
        console.error("❌ Erreur Puppeteer:", error.message);
        if (browser) {
            try { await browser.close(); } catch (e) { /* ignore */ }
        }
    }
}

// ==========================================
// 4. LOGIQUE CURL (avec cf_clearance injecté)
// ==========================================

function formatCookie(cookieValue) {
    if (!cookieValue) return "";
    if (cookieValue.includes("=")) return cookieValue;
    return `BOXTOPLAY_SESSION=${cookieValue}`;
}

/**
 * Construit la chaîne cookie complète : session du compte + cf_clearance de Puppeteer
 */
function buildFullCookie(accountCookie) {
    let parts = formatCookie(accountCookie);

    if (CF_CLEARANCE) {
        if (parts.includes('cf_clearance=')) {
            parts = parts.replace(/cf_clearance=[^;]+/, `cf_clearance=${CF_CLEARANCE}`);
        } else {
            parts += `; cf_clearance=${CF_CLEARANCE}`;
        }
    }

    return parts;
}

/**
 * GET via curl
 */
function curlGet(url, cookieString, extraHeaders = {}) {
    const allHeaders = { ...BROWSER_HEADERS, ...extraHeaders };
    delete allHeaders['Accept-Encoding'];

    const headerArgs = Object.entries(allHeaders)
        .map(([k, v]) => `-H '${k}: ${v}'`)
        .join(' ');

    const cookieArg = cookieString ? `-b '${cookieString}'` : '';

    try {
        const tmpHeaders = `/tmp/btp_h_${Date.now()}`;
        const fullCmd = `curl -sS -L -D '${tmpHeaders}' --max-time 15 ${cookieArg} ${headerArgs} '${url}'`;

        const body = execSync(fullCmd, {
            encoding: 'utf-8',
            maxBuffer: 5 * 1024 * 1024,
            timeout: 20000
        });

        let headersRaw = '';
        try { headersRaw = execSync(`cat '${tmpHeaders}' 2>/dev/null && rm -f '${tmpHeaders}'`, { encoding: 'utf-8' }); }
        catch (e) { /* ignore */ }

        const statusMatches = headersRaw.match(/HTTP\/[\d.]+ (\d+)/g) || [];
        const lastStatus = statusMatches.length > 0
            ? parseInt(statusMatches[statusMatches.length - 1].match(/(\d+)$/)[1])
            : 0;

        const setCookies = [];
        for (const line of headersRaw.split('\n')) {
            const m = line.match(/^set-cookie:\s*(.+)/i);
            if (m) setCookies.push(m[1].trim());
        }

        return { status: lastStatus, headers: headersRaw, body, setCookies };
    } catch (error) {
        console.error(`❌ Curl error: ${error.message}`);
        return { status: 0, headers: '', body: '', setCookies: [] };
    }
}

function processSetCookies(setCookies, accountIndex) {
    if (!setCookies || setCookies.length === 0) return;

    const account = LOCAL_STATE.accounts[accountIndex];
    for (const cookieStr of setCookies) {
        if (cookieStr.startsWith('BOXTOPLAY_SESSION')) {
            const cleanValue = cookieStr.split(';')[0];
            const oldVal = formatCookie(account.cookies['BOXTOPLAY_SESSION']);

            if (cleanValue !== oldVal) {
                console.log(`🔄 COOKIE REFRESH pour ${account.email}`);
                let fullCookie = account.cookies['BOXTOPLAY_SESSION'];
                if (fullCookie && fullCookie.includes('BOXTOPLAY_SESSION=')) {
                    fullCookie = fullCookie.replace(/BOXTOPLAY_SESSION=[^;]+/, cleanValue);
                } else {
                    fullCookie = cleanValue;
                }
                LOCAL_STATE.accounts[accountIndex].cookies['BOXTOPLAY_SESSION'] = fullCookie;
                saveToGist();
            }
        }
    }
}

// ==========================================
// 5. BOUCLE DE MAINTIEN (KeepAlive)
// ==========================================

async function checkAccount(account, index) {
    if (!account.cookies['BOXTOPLAY_SESSION']) {
        console.log(`⚠️ Skip ${account.email} (Pas de cookie)`);
        return;
    }

    const cookieString = buildFullCookie(account.cookies['BOXTOPLAY_SESSION']);

    try {
        let url = 'https://www.boxtoplay.com/panel';
        let extraHeaders = {};

        if (account.server_id) {
            url = `https://www.boxtoplay.com/minecraft/getStatus/${account.server_id}`;
        } else if (LOCAL_STATE.current_server_id && index === LOCAL_STATE.active_account_index) {
            url = `https://www.boxtoplay.com/minecraft/getStatus/${LOCAL_STATE.current_server_id}`;
        }

        if (url.includes('getStatus')) {
            extraHeaders = {
                'Accept': 'application/json, text/javascript, */*; q=0.01',
                'Sec-Fetch-Dest': 'empty',
                'Sec-Fetch-Mode': 'cors',
                'Sec-Fetch-Site': 'same-origin',
                'X-Requested-With': 'XMLHttpRequest'
            };
        } else {
            extraHeaders = {
                'Sec-Fetch-Dest': 'document',
                'Sec-Fetch-Mode': 'navigate',
                'Sec-Fetch-Site': 'same-origin',
                'Sec-Fetch-User': '?1',
                'Upgrade-Insecure-Requests': '1'
            };
        }

        const result = curlGet(url, cookieString, extraHeaders);

        processSetCookies(result.setCookies, index);

        // Détecter session expirée
        const redirectedToLogin = result.headers.toLowerCase().includes('location: /fr/login')
            || result.headers.toLowerCase().includes('location: /login');

        if (redirectedToLogin) {
            console.error(`💀 SESSION EXPIRÉE pour ${account.email}`);
            return;
        }

        if (result.status === 403) {
            const isCF = result.body.includes('challenge-platform') || result.headers.includes('cf-mitigated');

            if (isCF) {
                console.error(`❌ 403 Cloudflare pour ${account.email} — relance Puppeteer...`);
                await solveCloudflareChallenge();
                // Retenter
                const retryCookie = buildFullCookie(account.cookies['BOXTOPLAY_SESSION']);
                const retry = curlGet(url, retryCookie, extraHeaders);
                if (retry.status === 200) {
                    console.log(`💓 Ping OK (retry) pour ${account.email}`);
                    processSetCookies(retry.setCookies, index);
                } else {
                    console.error(`❌ Toujours ${retry.status} après retry pour ${account.email}`);
                }
            } else {
                const titleMatch = result.body.match(/<title>([^<]*)<\/title>/i);
                console.error(`❌ 403 pour ${account.email}: "${titleMatch ? titleMatch[1] : '?'}"`);
            }
        } else if (result.status === 200) {
            console.log(`💓 Ping OK pour ${account.email} (${url.split('/').pop()})`);
        } else {
            console.log(`⚠️ Status ${result.status} pour ${account.email}`);
        }

    } catch (error) {
        console.error(`❌ Erreur Ping ${account.email}:`, error.message);
    }
}

async function runKeepAliveCycle() {
    if (!LOCAL_STATE) return;
    console.log("--- 🔄 Cycle KeepAlive ---");
    for (let i = 0; i < LOCAL_STATE.accounts.length; i++) {
        await checkAccount(LOCAL_STATE.accounts[i], i);
        await new Promise(r => setTimeout(r, 2000));
    }
}

// ==========================================
// 6. DISCORD
// ==========================================

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

const commands = [
    new SlashCommandBuilder().setName('info').setDescription('Infos Bot'),
].map(c => c.toJSON());

const rest = new REST({ version: '10' }).setToken(TOKEN);

(async () => {
    try { await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands }); }
    catch (e) { console.error(e); }
})();

async function updatePresence() {
    try {
        const stats = await axios.get(`https://api.mcsrvstat.us/3/${IP_DNS}.boxtoplay.com`);
        const s = stats.data;
        let status = "🔴 Serveur OFF";
        if (s.online) {
            status = `🟢 ${s.players.online}/${s.players.max} Joueurs`;
        }
        client.user.setActivity(status);
    } catch (e) { console.error("Presence Error:", e.message); }
}

client.once('clientReady', () => {
    console.log(`🤖 Connecté: ${client.user.tag}`);
    loadFromGist();

    setInterval(updatePresence, 60 * 1000);
    setInterval(runKeepAliveCycle, 5 * 60 * 1000);

    // Renouveler le cf_clearance toutes les 25 min (expire après ~30 min)
    setInterval(solveCloudflareChallenge, 25 * 60 * 1000);
});

client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;
    if (interaction.commandName === 'info') {
        if (!LOCAL_STATE) return interaction.reply("Chargement...");
        const active = LOCAL_STATE.accounts[LOCAL_STATE.active_account_index];
        const cfStatus = CF_CLEARANCE ? '✅ Actif' : '❌ Absent';
        interaction.reply(`Compte actif: ${active.email}\nServeur: ${LOCAL_STATE.current_server_id}\nCloudflare: ${cfStatus}`);
    }
});

client.login(TOKEN);
