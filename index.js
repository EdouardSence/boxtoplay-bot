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

// ==========================================
// 1. SERVEUR WEB (KEEP-ALIVE RENDER)
// ==========================================
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => res.send('🤖 Bot BoxToPlay - Multi-Account Keeper'));
app.get('/keep-alive', (req, res) => res.status(200).send('Ping reçu !'));

app.listen(PORT, () => console.log(`🌍 Serveur Web écoute sur le port ${PORT}`));

// ==========================================
// 2. GESTION GIST & ETAT LOCAL
// ==========================================

// Variable globale pour stocker l'état en mémoire
let LOCAL_STATE = null;
let GIST_FILENAME = null;

// Initialisation : On charge le Gist au démarrage
async function initGist() {
    try {
        const response = await axios.get(`https://api.github.com/gists/${GIST_ID}`, {
            headers: {
                'Authorization': `token ${GH_TOKEN}`,
                'Accept': 'application/vnd.github.v3+json'
            }
        });
        const files = response.data.files;
        GIST_FILENAME = Object.keys(files)[0]; // Trouve le nom du fichier dynamiquement

        if (!GIST_FILENAME) throw new Error("Gist vide");

        LOCAL_STATE = JSON.parse(files[GIST_FILENAME].content);
        console.log("✅ État initial chargé depuis le Gist.");

        // On lance un premier refresh immédiat
        refreshAllSessions();

    } catch (error) {
        console.error("❌ Erreur initGist:", error.message);
        process.exit(1); // Si on ne peut pas charger l'état, le bot ne sert à rien
    }
}

// Sauvegarde l'état mémoire vers le Gist
async function saveStateToGist() {
    if (!LOCAL_STATE || !GIST_FILENAME) return;
    try {
        console.log("💾 Sauvegarde de l'état dans le Gist...");
        await axios.patch(`https://api.github.com/gists/${GIST_ID}`, {
            files: {
                [GIST_FILENAME]: { content: JSON.stringify(LOCAL_STATE, null, 4) }
            }
        }, {
            headers: { 'Authorization': `token ${GH_TOKEN}` }
        });
        console.log("✅ Gist mis à jour avec succès.");
    } catch (error) {
        console.error("❌ Erreur saveStateToGist:", error.message);
    }
}

// ==========================================
// 3. LOGIQUE KEEP-ALIVE (LES DEUX COMPTES)
// ==========================================

async function pingAccount(account, index) {
    const currentCookie = account.cookies['BOXTOPLAY_SESSION'];

    if (!currentCookie) {
        console.log(`⚠️ Compte ${account.email} : Pas de cookie.`);
        return false; // Pas de changement
    }

    try {
        // Requête légère pour maintenir la session
        const response = await axios.get('https://www.boxtoplay.com/panel', {
            headers: {
                'Cookie': `BOXTOPLAY_SESSION=${currentCookie}`,
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            },
            maxRedirects: 5,
            validateStatus: status => status < 500
        });

        // Vérification si le serveur nous donne un nouveau cookie
        const setCookieHeader = response.headers['set-cookie'];
        if (setCookieHeader) {
            const newSession = setCookieHeader.find(c => c.startsWith('BOXTOPLAY_SESSION'));
            if (newSession) {
                const newVal = newSession.split(';')[0].split('=')[1];
                if (newVal !== currentCookie) {
                    console.log(`🔄 Compte ${account.email} : Nouveau cookie reçu !`);
                    // Mise à jour de l'état local
                    LOCAL_STATE.accounts[index].cookies['BOXTOPLAY_SESSION'] = newVal;
                    return true; // Changement détecté !
                }
            }
        }
        console.log(`💓 Compte ${account.email} : Session OK.`);
        return false; // Pas de changement

    } catch (error) {
        console.error(`❌ Erreur ping ${account.email}:`, error.message);
        return false;
    }
}

async function refreshAllSessions() {
    if (!LOCAL_STATE) return;

    console.log("--- 🔄 Vérification des sessions (Tout le monde) ---");
    let somethingChanged = false;

    // On utilise Promise.all pour pinger les deux comptes en parallèle
    const results = await Promise.all(LOCAL_STATE.accounts.map((acc, index) => pingAccount(acc, index)));

    // Si au moins un compte a reçu un nouveau cookie
    if (results.includes(true)) {
        somethingChanged = true;
    }

    // Sauvegarde conditionnelle
    if (somethingChanged) {
        await saveStateToGist();
    } else {
        // Optionnel : Forcer une sauvegarde toutes les X heures si tu veux vraiment
        // Mais techniquement inutile si le cookie n'a pas changé
        console.log("--- ✅ Aucune modification de cookie nécessaire ---");
    }
}

// ==========================================
// 4. LOGIQUE DISCORD
// ==========================================

const client = new Client({ intents: [GatewayIntentBits.Guilds] });
const commands = [
    new SlashCommandBuilder().setName('info').setDescription('Infos session'),
    new SlashCommandBuilder().setName('list').setDescription('Joueurs en ligne'),
    new SlashCommandBuilder().setName('force_save').setDescription('Force la sauvegarde Gist')
].map(c => c.toJSON());

const rest = new REST({ version: '10' }).setToken(TOKEN);

(async () => {
    try {
        await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
        console.log('✅ Commandes slash OK.');
    } catch (e) { console.error(e); }
})();

async function updatePresence() {
    try {
        const stats = await axios.get(`https://api.mcsrvstat.us/3/${IP_DNS}.boxtoplay.com`);
        const s = stats.data;
        let status = "🔴 Serveur OFF";
        if (s.online) status = `🟢 ${s.players.online}/${s.players.max} Joueurs`;
        client.user.setActivity(status);
    } catch (e) { console.error("Erreur Presence:", e.message); }
}

client.once('ready', () => {
    console.log(`🤖 Connecté: ${client.user.tag}`);

    // 1. Initialisation unique
    initGist();

    // 2. Tâches périodiques
    setInterval(updatePresence, 60000); // Discord Statut (1 min)
    setInterval(refreshAllSessions, 5 * 60 * 1000); // Ping des DEUX comptes (5 min)
});

client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;

    if (interaction.commandName === 'list') {
        try {
            const r = await axios.get(`https://api.mcsrvstat.us/3/${IP_DNS}.boxtoplay.com`);
            if (!r.data.online) return interaction.reply("🔴 Serveur éteint.");
            const list = r.data.players.list ? r.data.players.list.map(p => p.name).join(', ') : "Personne";
            interaction.reply(`Joueurs : ${list}`);
        } catch (e) { interaction.reply("Erreur info."); }
    }

    if (interaction.commandName === 'info') {
        if (!LOCAL_STATE) return interaction.reply("État non chargé.");
        const active = LOCAL_STATE.accounts[LOCAL_STATE.active_account_index];
        interaction.reply(`Compte actif: ${active.email}\nServeur: ${LOCAL_STATE.current_server_id}\nCookies maintenus: ${LOCAL_STATE.accounts.length}`);
    }

    if (interaction.commandName === 'force_save') {
        await saveStateToGist();
        interaction.reply("💾 Sauvegarde forcée vers le Gist effectuée.");
    }
});

client.login(TOKEN);