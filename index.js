// ==========================================
// CONFIGURATION & DEPENDANCES
// ==========================================
const { Client, GatewayIntentBits, Partials, REST, Routes, SlashCommandBuilder } = require('discord.js');
const axios = require('axios');
const express = require('express');

// Récupération des secrets via les variables d'environnement (Render)
const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID; // ID de ton Bot (Application ID)
const GIST_ID = process.env.GIST_ID;
const GH_TOKEN = process.env.GH_TOKEN;

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

        // --- CORRECTION ICI ---
        // On récupère la liste des fichiers du Gist
        const files = response.data.files;

        // On prend le premier nom de fichier trouvé (peu importe son nom)
        const firstFileName = Object.keys(files)[0];

        if (!firstFileName) {
            console.error("❌ Erreur : Le Gist semble vide (aucun fichier trouvé).");
            return null;
        }

        console.log(`📂 Lecture du fichier : ${firstFileName}`); // Log pour debug
        const rawContent = files[firstFileName].content;
        const gistContent = JSON.parse(rawContent);
        // ----------------------

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
        // Affiche plus de détails si c'est une erreur API
        if (error.response) {
            console.error("Détail API:", error.response.data);
        }
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

    if (!data || !data.cookie || !data.serverId) {
        client.user.setActivity("⚠️ Erreur Config/Gist");
        return;
    }

    try {
        // On utilise le cookie pour interroger BoxToPlay
        const config = { headers: { Cookie: `BOXTOPLAY_SESSION=${data.cookie}` } };

        // On peut appeler les APIs BoxToPlay
        // Note: Ici on fait simple, on récupère juste le statut global si possible
        // Si tu veux la RAM/CPU précis, il faut faire les appels API boxtoplay

        // Pour l'exemple, on va utiliser une API publique Minecraft pour la présence
        // car c'est plus stable que de scraper BoxToPlay toutes les 5s
        // Mais si tu veux ABSOLUMENT BoxToPlay, utilise axios avec le cookie ici.

        // Exemple Hybride : Cookie pour garder la session, API Publique pour les stats rapides
        const statsUrl = `https://api.mcsrvstat.us/3/${process.env.IP_DNS || 'orny'}.boxtoplay.com`;
        const statsRes = await axios.get(statsUrl);
        const s = statsRes.data;

        let statusText = "🔴 Hors ligne";
        if (s.online) {
            const ram = "??"; // L'API publique ne donne pas la RAM interne
            statusText = `🟢 ${s.players.online}/${s.players.max} | 👥 ${data.email.split('@')[0]}`;
        }

        client.user.setActivity(statusText);
        console.log(`Updated: ${statusText}`);

    } catch (error) {
        console.error("Erreur update presence:", error.message);
    }
}

client.once('ready', () => {
    console.log(`🤖 Connecté en tant que ${client.user.tag}`);

    // Mettre à jour la présence toutes les 1 minute
    updatePresence();
    setInterval(updatePresence, 60000);
});

// Gestion des intéractions
client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;

    if (interaction.commandName === 'info') {
        const data = await getSessionCookie();
        await interaction.reply(`Connecté sur le compte : **${data ? data.email : 'Inconnu'}**\nServeur ID : ${data ? data.serverId : '?'}`);
    }

    if (interaction.commandName === 'list') {
        // Ta logique existante pour la liste...
        // Tu peux reprendre ton bloc de code précédent ici
        await interaction.reply("Commande list à implémenter avec mcsrvstat (voir code précédent)");
    }
});

client.login(TOKEN);