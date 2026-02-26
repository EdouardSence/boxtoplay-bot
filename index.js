// ==========================================
// CONFIGURATION & DEPENDANCES
// ==========================================
require('dotenv').config();
const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder } = require('discord.js');
const axios = require('axios');
const { execSync } = require('child_process');
const express = require('express');

// Secrets
const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GIST_ID = process.env.GIST_ID;
const GH_TOKEN = process.env.GH_TOKEN;
const IP_DNS = process.env.IP_DNS || 'orny';

// Headers pour passer le 403 (Copie d'un navigateur réel)
const BROWSER_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
    'Accept-Language': 'fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7',
    'Accept-Encoding': 'gzip, deflate, br',
    'Referer': 'https://www.boxtoplay.com/panel',
    'Origin': 'https://www.boxtoplay.com',
    'Sec-Ch-Ua': '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
    'Sec-Ch-Ua-Mobile': '?0',
    'Sec-Ch-Ua-Platform': '"Windows"',
    'Sec-Fetch-Site': 'same-origin',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Dest': 'document'
};

// ==========================================
// 1. SERVEUR WEB (KEEP-ALIVE RENDER)
// ==========================================
const app = express();
const PORT = process.env.PORT || 3000;
app.get('/', (req, res) => res.send('🤖 Bot BoxToPlay - Session Keeper V2'));
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

        // On lance immédiatement la boucle de maintien
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
        console.log("💾 Gist mis à jour avec les nouveaux cookies.");
    } catch (error) {
        console.error("❌ Erreur Save Gist:", error.message);
    }
}

// ==========================================
// 3. LOGIQUE CURL (Contourne le TLS fingerprint de Node.js)
// ==========================================

// Helper pour formater le cookie correctement
function formatCookie(cookieValue) {
    if (!cookieValue) return "";
    if (cookieValue.includes("=")) {
        return cookieValue;
    }
    return `BOXTOPLAY_SESSION=${cookieValue}`;
}

/**
 * Fait une requête GET via curl (contourne le blocage Cloudflare TLS)
 * Retourne { status, headers, body, cookies, finalUrl }
 */
function curlGet(url, cookieString, extraHeaders = {}) {
    const allHeaders = { ...BROWSER_HEADERS, ...extraHeaders };
    // On retire les headers qui gêneraient curl
    delete allHeaders['Accept-Encoding'];

    const headerArgs = Object.entries(allHeaders)
        .map(([k, v]) => `-H '${k}: ${v}'`)
        .join(' ');

    const cookieArg = cookieString ? `-b '${cookieString}'` : '';

    const cmd = `curl -sS -L -D /dev/stderr -o /dev/stdout --max-time 15 ${cookieArg} ${headerArgs} '${url}' 2>&1`;

    try {
        // On utilise une approche avec fichiers temp pour séparer headers et body
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

        // Extraire le dernier status (après redirections)
        const statusMatches = headersRaw.match(/HTTP\/[\d.]+ (\d+)/g) || [];
        const lastStatus = statusMatches.length > 0
            ? parseInt(statusMatches[statusMatches.length - 1].match(/(\d+)$/)[1])
            : 0;

        // Extraire les Set-Cookie
        const setCookies = [];
        for (const line of headersRaw.split('\n')) {
            const m = line.match(/^set-cookie:\s*(.+)/i);
            if (m) setCookies.push(m[1].trim());
        }

        // Détecter l'URL finale (dernière Location ou l'URL d'origine)
        const locationMatches = headersRaw.match(/^location:\s*(.+)/gim) || [];
        const finalUrl = locationMatches.length > 0
            ? locationMatches[locationMatches.length - 1].replace(/^location:\s*/i, '').trim()
            : url;

        return { status: lastStatus, headers: headersRaw, body, setCookies, finalUrl };
    } catch (error) {
        console.error(`❌ Curl error: ${error.message}`);
        return { status: 0, headers: '', body: '', setCookies: [], finalUrl: url };
    }
}

/**
 * Traite les Set-Cookie pour mettre à jour l'état local
 */
function processSetCookies(setCookies, accountIndex) {
    if (!setCookies || setCookies.length === 0) return;

    const account = LOCAL_STATE.accounts[accountIndex];
    for (const cookieStr of setCookies) {
        if (cookieStr.startsWith('BOXTOPLAY_SESSION')) {
            const cleanValue = cookieStr.split(';')[0]; // "BOXTOPLAY_SESSION=xxx"
            const oldVal = formatCookie(account.cookies['BOXTOPLAY_SESSION']);

            if (cleanValue !== oldVal) {
                console.log(`🔄 COOKIE REFRESH pour ${account.email} !`);
                // Reconstruire le cookie complet avec le nouveau BOXTOPLAY_SESSION
                let fullCookie = account.cookies['BOXTOPLAY_SESSION'];
                if (fullCookie && fullCookie.includes('BOXTOPLAY_SESSION=')) {
                    // Remplacer la partie BOXTOPLAY_SESSION dans la chaîne complète
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
// 4. BOUCLE DE MAINTIEN (KeepAlive)
// ==========================================

async function checkAccount(account, index) {
    if (!account.cookies['BOXTOPLAY_SESSION']) {
        console.log(`⚠️ Skip ${account.email} (Pas de cookie)`);
        return;
    }

    const cookieString = formatCookie(account.cookies['BOXTOPLAY_SESSION']);

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

        // Traiter les cookies rafraîchis
        processSetCookies(result.setCookies, index);

        // Détecter session expirée (redirection vers la page login dans les headers)
        const redirectedToLogin = result.headers.toLowerCase().includes('location: /fr/login')
            || result.headers.toLowerCase().includes('location: /login');

        if (redirectedToLogin) {
            console.error(`💀 SESSION EXPIRÉE pour ${account.email} → Mets à jour les cookies dans le Gist !`);
            return;
        }

        if (result.status === 403) {
            // Extraire le titre de la page pour identifier qui bloque (Cloudflare? BoxToPlay?)
            const titleMatch = result.body.match(/<title>([^<]*)<\/title>/i);
            const title = titleMatch ? titleMatch[1].trim() : '(pas de titre)';
            // Chercher des indices Cloudflare
            const isCF = result.body.includes('cf-') || result.body.includes('cloudflare') || result.body.includes('challenge-platform');
            const serverHeader = (result.headers.match(/^server:\s*(.+)/im) || [])[1] || '?';
            console.error(`❌ 403 pour ${account.email}`);
            console.error(`   ├─ Titre page: "${title}"`);
            console.error(`   ├─ Serveur: ${serverHeader.trim()}`);
            console.error(`   ├─ Cloudflare challenge: ${isCF ? 'OUI' : 'NON'}`);
            console.error(`   ├─ Body (500 premiers chars):`);
            console.error(`   │  ${result.body.substring(0, 500).replace(/\n/g, '\n   │  ')}`);
            console.error(`   └─ Headers pertinents:`);
            result.headers.split('\n').forEach(l => {
                if (l.match(/^(cf-|server:|set-cookie:|HTTP\/)/i)) console.error(`      ${l.trim()}`);
            });
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
    // On vérifie tous les comptes
    for (let i = 0; i < LOCAL_STATE.accounts.length; i++) {
        await checkAccount(LOCAL_STATE.accounts[i], i);
        // Petite pause pour ne pas spammer
        await new Promise(r => setTimeout(r, 2000));
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

// Mise à jour présence Discord (Via API externe pour ne pas user les cookies)
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

    // Tâches
    setInterval(updatePresence, 60 * 1000); // Discord (1 min)
    setInterval(runKeepAliveCycle, 5 * 60 * 1000); // KeepAlive (5 min)
});

client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;
    if (interaction.commandName === 'info') {
        if (!LOCAL_STATE) return interaction.reply("Chargement...");
        const active = LOCAL_STATE.accounts[LOCAL_STATE.active_account_index];
        interaction.reply(`Compte actif: ${active.email}\nServeur: ${LOCAL_STATE.current_server_id}`);
    }
});

client.login(TOKEN);