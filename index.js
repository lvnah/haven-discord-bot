const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const sqlite3 = require('sqlite3').verbose();

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

client.once('ready', () => {
    console.log(`Bot connecté en tant que ${client.user.tag} !`);
});

client.on('messageCreate', async message => {
    if (message.author.bot) return;

    if (message.content === '!setup-haven') {
        const embed = new EmbedBuilder()
            .setTitle('🛡️ HAVEN LADDER - SYSTEM')
            .setDescription('Inscrivez-vous en un clic ou rejoignez la file d’attente 5v5 ci-dessous.')
            .setColor(0xFFFFFF)
            .addFields({ name: '👥 Joueurs dans la file', value: `${activeQueue.length} / 10`, inline: true });

        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder().setCustomId('register_account').setLabel('📝 Créer mon compte').setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId('join_queue').setLabel('🎮 Rejoindre la Queue (5v5)').setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId('leave_queue').setLabel('❌ Quitter la Queue').setStyle(ButtonStyle.Danger)
            );

        await message.channel.send({ embeds: [embed], components: [row] });
        await message.delete();
    }
});

client.on('interactionCreate', async interaction => {
    if (!interaction.isButton()) return;
    const discordId = interaction.user.id;

    if (interaction.customId === 'register_account') {
        db.get(`SELECT * FROM bot_users WHERE discord_id = ?`, [discordId], async (err, row) => {
            if (row) {
                return interaction.reply({ content: `⚠️ Tu as déjà un compte sous le pseudo **${row.username}** (ELO: ${row.elo}).`, ephemeral: true });
            }
            db.run(`INSERT INTO bot_users (discord_id, username, elo) VALUES (?, ?, 100)`, [discordId, interaction.user.username], (err) => {
                if (err) return interaction.reply({ content: `Erreur lors de la création.`, ephemeral: true });
                return interaction.reply({ content: `🎉 Compte créé avec succès ! Bienvenue **${interaction.user.username}** (100 ELO).`, ephemeral: true });
            });
        });
    }

    else if (interaction.customId === 'join_queue') {
        db.get(`SELECT * FROM bot_users WHERE discord_id = ?`, [discordId], async (err, row) => {
            if (!row) return interaction.reply({ content: `❌ Crée ton compte d'abord en cliquant sur "Créer mon compte" !`, ephemeral: true });
            if (activeQueue.includes(discordId)) return interaction.reply({ content: `⚠️ Tu es déjà dans la file !`, ephemeral: true });

            activeQueue.push(discordId);
            await interaction.reply({ content: `✅ Tu as rejoint la file ! (${activeQueue.length}/10)`, ephemeral: true });

            if (activeQueue.length >= 10) {
                const playersMatch = activeQueue.splice(0, 10);
                const matchEmbed = new EmbedBuilder()
                    .setTitle('🚀 MATCH TROUVÉ !')
                    .setDescription('10 joueurs trouvés ! La partie va commencer.')
                    .setColor(0x00FF00)
                    .addFields({ name: 'Participants', value: playersMatch.map(id => `<@${id}>`).join(', ') });

                await interaction.channel.send({ embeds: [matchEmbed] });
            }
        });
    }

    else if (interaction.customId === 'leave_queue') {
        const index = activeQueue.indexOf(discordId);
        if (index > -1) {
            activeQueue.splice(index, 1);
            return interaction.reply({ content: `❌ Tu as quitté la file. (${activeQueue.length}/10)`, ephemeral: true });
        } else {
            return interaction.reply({ content: `⚠️ Tu n'étais pas dans la file.`, ephemeral: true });
        }
    }
});

client.login(process.env.DISCORD_TOKEN);
