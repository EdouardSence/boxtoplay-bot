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

app.get('/', (req, res) => res.send('🤖 Bot BoxToPlay - Session Keeper Actif'));
app.get('/keep-alive', (req, res) => res.status(200).send('Ping reçu !'));

app.listen(PORT, () => console.log(`🌍 Serveur Web écoute sur le port ${PORT}`));

// ==========================================
// 2. GESTION DE L'ÉTAT (MÉMOIRE + GIST)
// ==========================================

// C'est notre "JSON Local" en mémoire RAM
let LOCAL_STATE = {
    accounts: [],
    active_account_index: 0,
    current_server_id: "",
    last_gist_sync: 0
};
let GIST_FILENAME = null;

// Initialisation : On charge le Gist au démarrage
async function loadFromGist() {
    try {
        console.log("📥 Chargement initial depuis le Gist...");
        const response = await axios.get(`https://api.github.com/gists/${GIST_ID}`, {
            headers: {
                'Authorization': `token ${GH_TOKEN}`,
                'Accept': 'application/vnd.github.v3+json'
            }
        });
        const files = response.data.files;
        GIST_FILENAME = Object.keys(files)[0];

        if (!GIST_FILENAME) throw new Error("Gist vide");

        LOCAL_STATE = JSON.parse(files[GIST_FILENAME].content);
        console.log("✅ État chargé en mémoire. Prêt.");

        // On lance un refresh immédiat pour être sûr
        refreshAllSessions();

    } catch (error) {
        console.error("❌ Erreur critique loadFromGist:", error.message);
        // On ne quitte pas le processus pour laisser le serveur web tourner
    }
}

// Sauvegarde vers le Gist (appelé toutes les heures ou sur changement critique)
async function saveToGist() {
    if (!GIST_FILENAME) return;
    try {
        console.log("💾 Synchronisation vers le Gist...");
        await axios.patch(`https://api.github.com/gists/${GIST_ID}`, {
            files: {
                [GIST_FILENAME]: { content: JSON.stringify(LOCAL_STATE, null, 4) }
            }
        }, {
            headers: { 'Authorization': `token ${GH_TOKEN}` }
        });
        LOCAL_STATE.last_gist_sync = Date.now();
        console.log("✅ Gist mis à jour avec succès.");
    } catch (error) {
        console.error("❌ Erreur saveToGist:", error.message);
    }
}

// ==========================================
// 3. LOGIQUE SESSION INTELLIGENTE
// ==========================================

// Fonction magique qui met à jour le cookie si Boxtoplay en renvoie un nouveau
function updateCookieFromHeaders(accountIndex, headers) {
    const setCookieHeader = headers['set-cookie'];
    if (setCookieHeader) {
        // On cherche le cookie spécifique BOXTOPLAY_SESSION
        const newSession = setCookieHeader.find(c => c.startsWith('BOXTOPLAY_SESSION'));
        if (newSession) {
            // Extraction propre
            const newVal = newSession.split(';')[0].split('=')[1];
            const currentVal = LOCAL_STATE.accounts[accountIndex].cookies['BOXTOPLAY_SESSION'];

            // Si c'est différent de ce qu'on a en mémoire
            if (newVal !== currentVal) {
                console.log(`🔄 NOUVEAU COOKIE CAPTURÉ pour ${LOCAL_STATE.accounts[accountIndex].email}`);
                LOCAL_STATE.accounts[accountIndex].cookies['BOXTOPLAY_SESSION'] = newVal;
                return true; // Indique qu'il y a eu un changement
            }
        }
    }
    return false;
}

// Ping individuel d'un compte
async function pingAccount(account, index) {
    const currentCookie = account.cookies['BOXTOPLAY_SESSION'];

    if (!currentCookie) {
        console.log(`⚠️ Compte ${account.email} : Pas de cookie en mémoire.`);
        return false;
    }

    try {
        // On simule un navigateur complet pour ne pas se faire rejeter
        const response = await axios.get('https://www.boxtoplay.com/panel', {
            headers: {
                'Cookie': `BOXTOPLAY_SESSION=${currentCookie}`,
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
                'Referer': 'https://www.boxtoplay.com/login'
            },
            maxRedirects: 0, // On veut intercepter les redirections
            validateStatus: status => status < 400 // Accepter les 302 comme succès technique
        });

        // 1. Analyse de survie (Est-ce qu'on est redirigé vers login ?)
        if (response.status === 302) {
            const loc = response.headers['location'] || "";
            if (loc.includes("login")) {
                console.error(`💀 SESSION MORTE détectée pour ${account.email} (Redirection 302).`);
                // Optionnel : Envoyer une alerte Discord ici
                return false;
            }
        }

        // 2. Capture du nouveau cookie (si présent)
        const hasChanged = updateCookieFromHeaders(index, response.headers);

        if (hasChanged) {
            console.log(`✅ Cookie mis à jour en mémoire locale.`);
        } else {
            console.log(`💓 ${account.email} : Session OK (Cookie inchangé).`);
        }

        return hasChanged;

    } catch (error) {
        console.error(`❌ Erreur ping ${account.email}:`, error.message);
        return false;
    }
}

// Boucle principale de maintien (toutes les 5 min)
async function refreshAllSessions() {
    if (!LOCAL_STATE.accounts || LOCAL_STATE.accounts.length === 0) return;

    console.log("--- 🔄 Cycle de Maintien de Session ---");

    // On ping tous les comptes en parallèle
    const results = await Promise.all(
        LOCAL_STATE.accounts.map((acc, index) => pingAccount(acc, index))
    );

    // Si un cookie a changé lors de ce cycle, on peut sauvegarder tout de suite (optionnel)
    // Mais pour respecter ta demande, on sauvegarde surtout toutes les heures via l'autre intervalle.
    if (results.includes(true)) {
        console.log("⚠️ Changement détecté ! Sauvegarde anticipée vers Gist...");
        await saveToGist();
    }
}

// ==========================================
// 4. LOGIQUE DISCORD
// ==========================================

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

const commands = [
    new SlashCommandBuilder().setName('info').setDescription('Infos session & état'),
    new SlashCommandBuilder().setName('list').setDescription('Joueurs en ligne'),
    new SlashCommandBuilder().setName('force_save').setDescription('Force la sauvegarde Gist maintenant')
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
        // API Externe pour le statut (ne consomme pas nos cookies)
        const stats = await axios.get(`https://api.mcsrvstat.us/3/${IP_DNS}.boxtoplay.com`);
        const s = stats.data;
        let status = "🔴 Serveur OFF";
        if (s.online) {
            status = `🟢 ${s.players.online}/${s.players.max} | ${LOCAL_STATE.current_server_id}`;
        }
        client.user.setActivity(status);
    } catch (e) { console.error("Erreur Presence:", e.message); }
}

client.once('ready', () => {
    console.log(`🤖 Connecté: ${client.user.tag}`);

    // 1. Chargement initial
    loadFromGist();

    // 2. Tâches Périodiques

    // A. Mise à jour présence Discord (1 min)
    setInterval(updatePresence, 60 * 1000);

    // B. Ping BoxToPlay & Capture Cookies (5 min)
    // C'est assez fréquent pour ne pas timeout (4h), et capturer les changements.
    setInterval(refreshAllSessions, 5 * 60 * 1000);

    // C. Sauvegarde Gist (1 heure)
    // C'est la sécurité : toutes les heures, on pousse l'état mémoire vers le Cloud
    // pour que le Worker ait toujours des cookies frais de moins d'1h.
    setInterval(saveToGist, 60 * 60 * 1000);
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
        if (!LOCAL_STATE.accounts.length) return interaction.reply("État non chargé.");
        const active = LOCAL_STATE.accounts[LOCAL_STATE.active_account_index];
        const lastSync = LOCAL_STATE.last_gist_sync ? `<t:${Math.floor(LOCAL_STATE.last_gist_sync / 1000)}:R>` : "Jamais";

        interaction.reply({
            content: `👤 **Compte Actif:** ${active.email}\n🆔 **Serveur:** ${LOCAL_STATE.current_server_id}\n💾 **Dernière Save Gist:** ${lastSync}\n🍪 **Cookies en mémoire:** ${LOCAL_STATE.accounts.length}`,
            ephemeral: true
        });
    }

    if (interaction.commandName === 'force_save') {
        await saveToGist();
        interaction.reply("✅ État local sauvegardé de force dans le Gist.");
    }
});

client.login(TOKEN);