// ==========================================
// CONFIGURATION & DEPENDANCES
// ==========================================
const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder } = require('discord.js');
const axios = require('axios');
const express = require('express');

// Secrets
const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GIST_ID = process.env.GIST_ID;
const GH_TOKEN = process.env.GH_TOKEN;
const IP_DNS = process.env.IP_DNS || 'orny';

// Headers pour passer le 403 (Copie d'un navigateur réel)
const BROWSER_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Accept-Language': 'fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7',
    'Referer': 'https://www.boxtoplay.com/panel',
    'Origin': 'https://www.boxtoplay.com'
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
// 3. LOGIQUE AXIOS & INTERCEPTEURS
// ==========================================

// Helper pour formater le cookie correctement
function formatCookie(cookieValue) {
    if (!cookieValue) return "";
    // Si le cookie contient déjà "BOXTOPLAY_SESSION=", on le laisse tel quel
    if (cookieValue.includes("BOXTOPLAY_SESSION=")) {
        return cookieValue;
    }
    // Sinon on ajoute le préfixe
    return `BOXTOPLAY_SESSION=${cookieValue}`;
}

// Fonction qui crée une instance Axios pour un compte donné
function createAxiosInstance(accountIndex) {
    const account = LOCAL_STATE.accounts[accountIndex];
    // On récupère le cookie brut stocké
    let rawCookie = account.cookies['BOXTOPLAY_SESSION'];

    const instance = axios.create({
        timeout: 10000,
        headers: {
            ...BROWSER_HEADERS,
            'Cookie': formatCookie(rawCookie)
        },
        maxRedirects: 5,
        validateStatus: status => status < 500 // On gère les erreurs nous-mêmes
    });

    // L'intercepteur magique de ton ancien code !
    instance.interceptors.response.use(response => {
        // Détection session expirée (Redirection Login)
        if (response.request && response.request.res && response.request.res.responseUrl) {
            if (response.request.res.responseUrl.includes("login")) {
                console.error(`💀 SESSION MORTE pour ${account.email} (Redirection Login)`);
            }
        }

        // Capture du Set-Cookie
        const setCookie = response.headers['set-cookie'];
        if (setCookie) {
            // On cherche le bon cookie
            const newSessionPart = setCookie.find(c => c.startsWith('BOXTOPLAY_SESSION'));
            if (newSessionPart) {
                // On extrait juste la valeur propre ou on garde tout le string selon ton format préféré
                // Ton ancien code gardait tout le string brut du header parfois
                // Ici on va extraire la valeur pour être propre : "BOXTOPLAY_SESSION=xyz; path=..."

                // Pour être compatible avec ton ancien format : on garde "BOXTOPLAY_SESSION=valeur"
                let cleanValue = newSessionPart.split(';')[0];

                const oldVal = formatCookie(LOCAL_STATE.accounts[accountIndex].cookies['BOXTOPLAY_SESSION']);

                if (cleanValue !== oldVal) {
                    console.log(`🔄 COOKIE REFRESH pour ${account.email} !`);
                    // On met à jour l'état local
                    LOCAL_STATE.accounts[accountIndex].cookies['BOXTOPLAY_SESSION'] = cleanValue;
                    // On déclenche une sauvegarde Gist
                    saveToGist();
                }
            }
        }
        return response;
    }, error => {
        return Promise.reject(error);
    });

    return instance;
}

// ==========================================
// 4. BOUCLE DE MAINTIEN (KeepAlive)
// ==========================================

async function checkAccount(account, index) {
    if (!account.cookies['BOXTOPLAY_SESSION']) {
        console.log(`⚠️ Skip ${account.email} (Pas de cookie)`);
        return;
    }

    const clientAxios = createAxiosInstance(index);

    try {
        // On utilise ta stratégie : taper sur getStatus du serveur
        // Si server_id est vide (compte inactif), on tape sur /panel pour maintenir la session quand même
        let url = 'https://www.boxtoplay.com/panel';

        // Si on a un ID de serveur, on tape dessus (c'est plus discret)
        if (account.server_id) {
            url = `https://www.boxtoplay.com/minecraft/getStatus/${account.server_id}`;
        } else if (LOCAL_STATE.current_server_id && index === LOCAL_STATE.active_account_index) {
            url = `https://www.boxtoplay.com/minecraft/getStatus/${LOCAL_STATE.current_server_id}`;
        }

        const res = await clientAxios.get(url);

        if (res.status === 403) {
            console.error(`❌ 403 Forbidden pour ${account.email} (Problème Headers/IP)`);
        } else if (res.status === 200) {
            console.log(`💓 Ping OK pour ${account.email} (${url.split('/').pop()})`);
        } else {
            console.log(`⚠️ Status ${res.status} pour ${account.email}`);
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

client.once('ready', () => {
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