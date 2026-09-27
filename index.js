const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const sqlite3 = require('sqlite3').verbose();
const http = require('http');

// 1. Serveur HTTP pour Render (Web Service)
const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Haven Bot is running!\n');
});
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Serveur web HTTP à l'écoute sur le port ${PORT}`);
});

// 2. Initialisation du Bot Discord
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers
    ]
});

const db = new sqlite3.Database('./haven_bot.db', (err) => {
    if (err) console.error('Erreur SQLite:', err.message);
    else console.log('Connecté à la base de données SQLite.');
});

db.run(`CREATE TABLE IF NOT EXISTS bot_users (
    discord_id TEXT PRIMARY KEY,
    username TEXT,
    elo INTEGER DEFAULT 100
)`);

let activeQueue = [];

client.once('clientReady', () => {
    console.log(`Bot connecté en tant que ${client.user.tag} !`);
});
client.once('ready', () => {
    if (!client.user) return;
    console.log(`Bot connecté (ready) en tant que ${client.user.tag} !`);
});

// Commandes d'installation des salons
client.on('messageCreate', async message => {
    if (message.author.bot) return;

    if (message.content === '!setup-register') {
        const embed = new EmbedBuilder()
            .setTitle('📝 INSCRIPTION — HAVEN LADDER')
            .setDescription('Clique sur le bouton ci-dessous pour créer ton compte joueur indépendant.')
            .setColor(0x3498DB);

        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder().setCustomId('register_account').setLabel('Créer mon compte').setStyle(ButtonStyle.Primary)
            );

        await message.channel.send({ embeds: [embed], components: [row] });
        await message.delete();
    }

    if (message.content === '!setup-queue') {
        const embed = new EmbedBuilder()
            .setTitle('🎮 FILE D\'ATTENTE 5v5 — HAVEN LADDER')
            .setDescription('Rejoins ou quitte la file d\'attente ci-dessous.')
            .setColor(0x2ECC71)
            .addFields({ name: '👥 Joueurs dans la file', value: `${activeQueue.length} / 10`, inline: true });

        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder().setCustomId('join_queue').setLabel('Rejoindre la Queue').setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId('leave_queue').setLabel('Quitter la Queue').setStyle(ButtonStyle.Danger)
            );

        await message.channel.send({ embeds: [embed], components: [row] });
        await message.delete();
    }
});

// Gestion propre des boutons sans spam
client.on('interactionCreate', async interaction => {
    if (!interaction.isButton()) return;
    const discordId = interaction.user.id;

    if (interaction.customId === 'register_account') {
        db.get(`SELECT * FROM bot_users WHERE discord_id = ?`, [discordId], async (err, row) => {
            if (row) {
                return interaction.reply({ content: `⚠️ Tu possèdes déjà un compte sous le pseudo **${row.username}** (ELO: ${row.elo}).`, ephemeral: true });
            }
            db.run(`INSERT INTO bot_users (discord_id, username, elo) VALUES (?, ?, 100)`, [discordId, interaction.user.username], (err) => {
                if (err) return interaction.reply({ content: `Erreur lors de la création du compte.`, ephemeral: true });
                return interaction.reply({ content: `🎉 Compte créé avec succès ! Bienvenue **${interaction.user.username}** (Départ à 100 ELO).`, ephemeral: true });
            });
        });
    }

    else if (interaction.customId === 'join_queue') {
        db.get(`SELECT * FROM bot_users WHERE discord_id = ?`, [discordId], async (err, row) => {
            if (!row) return interaction.reply({ content: `❌ Tu dois d'abord créer ton compte dans le salon d'inscription !`, ephemeral: true });
            if (activeQueue.includes(discordId)) return interaction.reply({ content: `⚠️ Tu es déjà dans la file d'attente !`, ephemeral: true });

            activeQueue.push(discordId);
            
            // Met à jour le compteur sur le message principal proprement (évite de renvoyer un nouveau message)
            const newEmbed = new EmbedBuilder()
                .setTitle('🎮 FILE D\'ATTENTE 5v5 — HAVEN LADDER')
                .setDescription('Rejoins ou quitte la file d\'attente ci-dessous.')
                .setColor(0x2ECC71)
                .addFields({ name: '👥 Joueurs dans la file', value: `${activeQueue.length} / 10`, inline: true });

            await interaction.update({ embeds: [newEmbed] });

            // Envoie une confirmation éphémère discrète qui ne pollue pas
            await interaction.followUp({ content: `✅ Tu as rejoint la file d'attente ! (${activeQueue.length}/10)`, ephemeral: true });

            if (activeQueue.length >= 10) {
                const playersMatch = activeQueue.splice(0, 10);
                const matchEmbed = new EmbedBuilder()
                    .setTitle('🚀 MATCH TROUVÉ !')
                    .setDescription('10 joueurs trouvés ! La partie va commencer.')
                    .setColor(0xF1C40F)
                    .addFields({ name: 'Participants', value: playersMatch.map(id => `<@${id}>`).join(', ') });

                await interaction.channel.send({ embeds: [matchEmbed] });
            }
        });
    }

    else if (interaction.customId === 'leave_queue') {
        const index = activeQueue.indexOf(discordId);
        if (index > -1) {
            activeQueue.splice(index, 1);

            // Met à jour le compteur sur le panneau principal
            const newEmbed = new EmbedBuilder()
                .setTitle('🎮 FILE D\'ATTENTE 5v5 — HAVEN LADDER')
                .setDescription('Rejoins ou quitte la file d\'attente ci-dessous.')
                .setColor(0x2ECC71)
                .addFields({ name: '👥 Joueurs dans la file', value: `${activeQueue.length} / 10`, inline: true });

            await interaction.update({ embeds: [newEmbed] });
            await interaction.followUp({ content: `❌ Tu as quitté la file d'attente. (${activeQueue.length}/10)`, ephemeral: true });
        } else {
            return interaction.reply({ content: `⚠️ Tu n'étais pas dans la file d'attente.`, ephemeral: true });
        }
    }
});

client.login(process.env.DISCORD_TOKEN);
