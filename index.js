// ==========================================
// CONFIGURATION & DEPENDANCES
// ==========================================
const { Client, GatewayIntentBits, Partials, REST, Routes, SlashCommandBuilder } = require('discord.js');
const axios = require('axios');
const express = require('express');

// Récupération des secrets via les variables d'environnement (Render)
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

app.get('/', (req, res) => {
    res.send('🤖 Bot BoxToPlay est en ligne !');
});

// Route spéciale pour Cron-job.org
app.get('/keep-alive', (req, res) => {
    res.status(200).send('Ping reçu !');
});

app.listen(PORT, () => {
    console.log(`🌍 Serveur Web écoute sur le port ${PORT}`);
});

// ==========================================
// 2. GESTION GIST & COOKIES
// ==========================================

async function getSessionCookie() {
    try {
        const response = await axios.get(`https://api.github.com/gists/${GIST_ID}`, {
            headers: {
                'Authorization': `token ${GH_TOKEN}`,
                'Accept': 'application/vnd.github.v3+json'
            }
        });

        const files = response.data.files;
        // On prend le premier fichier trouvé, peu importe son nom (boxtoplay.json ou autre)
        const firstFileName = Object.keys(files)[0];

        if (!firstFileName) {
            console.error("❌ Erreur : Le Gist est vide.");
            return null;
        }

        console.log(`📂 Lecture du fichier : ${firstFileName}`);

        // C'est ici que ça plantait avant : on utilise firstFileName dynamiquement
        const rawContent = files[firstFileName].content;
        const gistContent = JSON.parse(rawContent);

        const activeIndex = gistContent.active_account_index;
        const activeAccount = gistContent.accounts[activeIndex];
        const serverId = gistContent.current_server_id;

        return {
            cookie: activeAccount.cookies['BOXTOPLAY_SESSION'],
            serverId: serverId,
            email: activeAccount.email
        };

    } catch (error) {
        console.error("❌ Erreur lecture Gist:", error.message);
        return null;
    }
}

// ==========================================
// 3. LOGIQUE DISCORD
// ==========================================

const client = new Client({
    intents: [GatewayIntentBits.Guilds],
});

// Commandes Slash
const commands = [
    new SlashCommandBuilder().setName('info').setDescription('Affiche l\'état du serveur'),
    new SlashCommandBuilder().setName('list').setDescription('Affiche les joueurs connectés')
].map(command => command.toJSON());

const rest = new REST({ version: '10' }).setToken(TOKEN);

// Enregistrement des commandes au démarrage
(async () => {
    try {
        console.log('🔄 Refresh des commandes slash...');
        await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
        console.log('✅ Commandes enregistrées.');
    } catch (error) {
        console.error(error);
    }
})();

// Fonction principale de mise à jour du statut
async function updatePresence() {
    const data = await getSessionCookie();

    if (!data || !data.cookie) {
        // Pas de cookie trouvé dans le Gist
        client.user.setActivity("🔴 En attente de cookie...");
        console.log("⚠️ Cookie manquant dans le Gist. Le bot attend la mise à jour ou l'ajout manuel.");
        return;
    }

    try {
        // Appel API externe pour avoir le statut (plus fiable que de scraper BoxToPlay sans cesse)
        const statsUrl = `https://api.mcsrvstat.us/3/${IP_DNS}.boxtoplay.com`;
        const statsRes = await axios.get(statsUrl);
        const s = statsRes.data;

        let statusText = "🔴 Serveur éteint";

        if (s.online) {
            statusText = `🟢 ${s.players.online}/${s.players.max} | 👥 ${data.email.split('@')[0]}`;
        } else {
            statusText = `🔴 Serveur éteint | 👥 ${data.email.split('@')[0]}`;
        }

        client.user.setActivity(statusText);
        console.log(`✅ Statut mis à jour : ${statusText}`);

    } catch (error) {
        console.error("Erreur update presence:", error.message);
    }
}

client.once('ready', () => {
    console.log(`🤖 Connecté en tant que ${client.user.tag}`);

    updatePresence();
    setInterval(updatePresence, 60000); // Mise à jour toutes les minutes
});

// Gestion des intéractions
client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;

    if (interaction.commandName === 'info') {
        const data = await getSessionCookie();
        const serverMsg = data && data.serverId ? `Serveur ID: ${data.serverId}` : "Serveur ID: Inconnu";
        const emailMsg = data && data.email ? `Compte: ${data.email}` : "Compte: Inconnu";
        await interaction.reply(`ℹ️ **Infos Bot**\n${emailMsg}\n${serverMsg}\nDNS: ${IP_DNS}.boxtoplay.com`);
    }

    if (interaction.commandName === 'list') {
        try {
            const response = await axios.get(`https://api.mcsrvstat.us/3/${IP_DNS}.boxtoplay.com`);
            const json = response.data;

            if (!json.online) {
                await interaction.reply("🔴 Le serveur est éteint ou inaccessible.");
            } else {
                if (!json.players || json.players.online === 0) {
                    await interaction.reply("👻 Il n'y a personne sur le serveur.");
                } else {
                    const playersList = json.players.list.map(p => `**${p.name}**`).join('\n');
                    await interaction.reply(`🟢 **Joueurs en ligne (${json.players.online})** :\n${playersList}`);
                }
            }
        } catch (error) {
            console.error(error);
            await interaction.reply("❌ Erreur lors de la récupération de la liste.");
        }
    }
});

client.login(TOKEN);