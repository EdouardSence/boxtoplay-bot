// ==========================================
// CONFIGURATION & DEPENDANCES
// ==========================================
require('dotenv').config();
const { execSync } = require('child_process');
const fs = require('fs');
const os = require('os');

// --- INSTALLER CHROME AU DÉMARRAGE SI ABSENT ---
(function installChrome() {
    try {
        const cacheDirs = [
            process.env.PUPPETEER_CACHE_DIR,
            '/opt/render/.cache/puppeteer',
            os.homedir() + '/.cache/puppeteer'
        ].filter(Boolean);

        let found = false;
        for (const dir of cacheDirs) {
            if (fs.existsSync(dir)) {
                const chromeFiles = execSync(`find ${dir} -name 'chrome' -type f 2>/dev/null || true`, { encoding: 'utf-8' }).trim();
                if (chromeFiles) {
                    console.log('🌐 Chrome trouvé:', chromeFiles.split('\n')[0]);
                    found = true;
                    break;
                }
            }
        }

        if (!found) {
            console.log('🌐 Chrome non trouvé, téléchargement (~1-2 min)...');
            execSync('npx puppeteer browsers install chrome', { stdio: 'inherit', timeout: 180000 });
            console.log('🌐 Chrome installé !');
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

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

// ==========================================
// 1. SERVEUR WEB (KEEP-ALIVE RENDER)
// ==========================================
const app = express();
const PORT = process.env.PORT || 3000;
app.get('/', (req, res) => res.send('🤖 Bot BoxToPlay V4 - Full Puppeteer'));
app.get('/keep-alive', (req, res) => res.status(200).send('OK'));
app.listen(PORT, () => console.log(`🌍 Serveur Web sur le port ${PORT}`));

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
        console.log("💾 Gist sauvegardé.");
    } catch (error) {
        console.error("❌ Erreur Save Gist:", error.message);
    }
}

// ==========================================
// 3. NAVIGATEUR PERSISTANT (Puppeteer-stealth)
// ==========================================
// On garde UN navigateur Chrome ouvert en permanence.
// Toutes les requêtes passent par ce navigateur = même TLS = Cloudflare OK.

let BROWSER = null;

async function getBrowser() {
    if (BROWSER && BROWSER.connected) return BROWSER;

    console.log("🌐 Lancement du navigateur Chrome stealth...");
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
        console.log("⚠️ Chrome déconnecté, sera relancé au prochain cycle.");
        BROWSER = null;
    });

    console.log("🌐 Chrome lancé !");
    return BROWSER;
}

/**
 * Résoudre le challenge Cloudflare en naviguant sur le site
 * Retourne la page une fois le challenge passé
 */
async function solveCloudflareOnPage(page) {
    await page.setUserAgent(USER_AGENT);
    await page.setViewport({ width: 1366, height: 768 });

    console.log("   ⏳ Navigation vers boxtoplay.com...");
    await page.goto('https://www.boxtoplay.com/fr/login', {
        waitUntil: 'networkidle2',
        timeout: 60000,
    });

    // Vérifier si on a un challenge Cloudflare
    const title = await page.title();
    if (title.includes('Just a moment')) {
        console.log("   ⏳ Challenge Cloudflare détecté, résolution en cours...");
        try {
            await page.waitForFunction(
                () => !document.title.includes('Just a moment'),
                { timeout: 30000 }
            );
        } catch (e) {
            console.log("   ⚠️ Timeout sur le challenge");
        }
        await new Promise(r => setTimeout(r, 3000));
    }

    const finalTitle = await page.title();
    console.log(`   📄 Titre: "${finalTitle}"`);
    return finalTitle.includes('Just a moment') === false;
}

/**
 * Injecter les cookies d'un compte dans une page
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
                domain: 'www.boxtoplay.com',
                path: '/',
                httpOnly: name === 'BOXTOPLAY_SESSION',
                secure: true,
            });
        }
    }

    if (cookieObjects.length > 0) {
        await page.setCookie(...cookieObjects);
    }
}

/**
 * Extraire les cookies de la page et mettre à jour l'état
 */
async function extractAndUpdateCookies(page, accountIndex) {
    const cookies = await page.cookies('https://www.boxtoplay.com');
    const sessionCookie = cookies.find(c => c.name === 'BOXTOPLAY_SESSION');

    if (sessionCookie) {
        // Reconstruire la chaîne de cookies complète
        const relevantCookies = cookies
            .filter(c => ['BOXTOPLAY_SESSION', 'BOXTOPLAY_LANG', 'cf_clearance', 'cookie_consent_level', 'cookie_consent_user_accepted', 'cookie_consent_user_consent_token'].includes(c.name))
            .map(c => `${c.name}=${c.value}`)
            .join('; ');

        const oldCookie = LOCAL_STATE.accounts[accountIndex].cookies['BOXTOPLAY_SESSION'];
        if (relevantCookies !== oldCookie) {
            console.log(`🔄 Cookies mis à jour pour ${LOCAL_STATE.accounts[accountIndex].email}`);
            LOCAL_STATE.accounts[accountIndex].cookies['BOXTOPLAY_SESSION'] = relevantCookies;
            await saveToGist();
        }
    }
}

// ==========================================
// 4. BOUCLE DE MAINTIEN (KeepAlive)
// ==========================================

async function checkAccount(account, index) {
    if (!account.cookies['BOXTOPLAY_SESSION']) {
        console.log(`⚠️ Skip ${account.email} (Pas de cookie)`);
        return;
    }

    try {
        const browser = await getBrowser();
        const page = await browser.newPage();

        try {
            // D'abord, résoudre le challenge Cloudflare (le navigateur garde le cookie)
            const cfOk = await solveCloudflareOnPage(page);
            if (!cfOk) {
                console.error(`❌ Challenge Cloudflare non résolu pour ${account.email}`);
                await page.close();
                return;
            }

            // Injecter les cookies de session du compte
            await injectCookies(page, account.cookies['BOXTOPLAY_SESSION']);

            // Naviguer vers le panel ou getStatus
            let url = 'https://www.boxtoplay.com/panel';
            if (account.server_id) {
                url = `https://www.boxtoplay.com/minecraft/getStatus/${account.server_id}`;
            } else if (LOCAL_STATE.current_server_id && index === LOCAL_STATE.active_account_index) {
                url = `https://www.boxtoplay.com/minecraft/getStatus/${LOCAL_STATE.current_server_id}`;
            }

            const response = await page.goto(url, {
                waitUntil: 'networkidle2',
                timeout: 30000,
            });

            const status = response ? response.status() : 0;
            const pageUrl = page.url();

            // Sauvegarder les cookies mis à jour
            await extractAndUpdateCookies(page, index);

            if (pageUrl.includes('login')) {
                console.error(`💀 SESSION EXPIRÉE pour ${account.email}`);
            } else if (status === 403) {
                console.error(`❌ 403 pour ${account.email} (même avec Chrome !)`);
            } else if (status === 200) {
                console.log(`💓 Ping OK pour ${account.email} (${url.split('/').pop()})`);
            } else {
                console.log(`⚠️ Status ${status} pour ${account.email} (URL: ${pageUrl})`);
            }

        } finally {
            await page.close();
        }

    } catch (error) {
        console.error(`❌ Erreur ${account.email}:`, error.message);
    }
}

async function runKeepAliveCycle() {
    if (!LOCAL_STATE) return;
    console.log("--- 🔄 Cycle KeepAlive ---");
    for (let i = 0; i < LOCAL_STATE.accounts.length; i++) {
        await checkAccount(LOCAL_STATE.accounts[i], i);
        await new Promise(r => setTimeout(r, 3000));
    }
}

// ==========================================
// 5. DISCORD
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

client.once('clientReady', async () => {
    console.log(`🤖 Connecté: ${client.user.tag}`);
    await loadFromGist();

    // Premier cycle immédiat
    runKeepAliveCycle();

    // Intervalles
    setInterval(updatePresence, 60 * 1000);
    setInterval(runKeepAliveCycle, 5 * 60 * 1000);
});

client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;
    if (interaction.commandName === 'info') {
        if (!LOCAL_STATE) return interaction.reply("Chargement...");
        const active = LOCAL_STATE.accounts[LOCAL_STATE.active_account_index];
        const browserStatus = BROWSER && BROWSER.connected ? '✅ Chrome actif' : '❌ Chrome inactif';
        interaction.reply(`Compte actif: ${active.email}\nServeur: ${LOCAL_STATE.current_server_id}\nNavigateur: ${browserStatus}`);
    }
});

client.login(TOKEN);
