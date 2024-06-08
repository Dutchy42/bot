require('dotenv').config(); // Load .env file
const { Client, GatewayIntentBits, PermissionsBitField } = require('discord.js');
const { Sequelize, DataTypes } = require('sequelize');

// Create a new client instance
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMessageReactions
    ]
});

// Sequelize setup
const sequelize = new Sequelize({
    dialect: 'sqlite',
    storage: 'database.sqlite'
});

const ReactionMessage = sequelize.define('ReactionMessage', {
    messageId: {
        type: DataTypes.STRING,
        allowNull: false
    },
    channelId: {
        type: DataTypes.STRING,
        allowNull: false
    }
});

const RoleReaction = sequelize.define('RoleReaction', {
    messageId: {
        type: DataTypes.STRING,
        allowNull: false
    },
    emoji: {
        type: DataTypes.STRING,
        allowNull: false
    },
    roleId: {
        type: DataTypes.STRING,
        allowNull: false
    }
});

client.once('ready', async () => {
    try {
        await sequelize.sync();
        console.log('Bot is ready!');

        const reactionMessage = await ReactionMessage.findOne();
        if (reactionMessage) {
            const channel = await client.channels.fetch(reactionMessage.channelId);

            // Function to fetch message with retry mechanism
            const fetchMessageWithRetry = async (messageId, retries = 3) => {
                try {
                    const message = await channel.messages.fetch(messageId);
                    return message;
                } catch (error) {
                    if (retries > 0) {
                        console.warn(`Error fetching message (${error}), retrying...`);
                        await new Promise(resolve => setTimeout(resolve, 1000)); // Wait for 1 second before retrying
                        return fetchMessageWithRetry(messageId, retries - 1);
                    } else {
                        throw error; // Retry limit exceeded, throw error
                    }
                }
            };

            const message = await fetchMessageWithRetry(reactionMessage.messageId);
            if (message) {
                const roleReactions = await RoleReaction.findAll({ where: { messageId: reactionMessage.messageId } });
                for (const roleReaction of roleReactions) {
                    await message.react(roleReaction.emoji);
                }
            } else {
                console.error('Message not found.');
            }
        }
    } catch (error) {
        console.error('Error syncing database:', error);
    }
});

client.on('messageCreate', async (message) => {
    if (message.content === '!postReactionMessage') {
        try {
            const reactionMessage = await message.channel.send(
                `Reageer op dit bericht om je rol te krijgen!\n:sunny: Voor Dag\n:house: Voor Wonen\n:older_man: Voor Oud dag/wonen`
            );

            const reactions = [
                { emoji: '🌞', roleId: '1248651801960513536' },
                { emoji: '🏠', roleId: '1248651723703324893' },
                { emoji: '👴', roleId: '1248651987868717208' }
            ];

            await ReactionMessage.create({
                messageId: reactionMessage.id,
                channelId: message.channel.id
            });

            for (const reaction of reactions) {
                await reactionMessage.react(reaction.emoji);
                await RoleReaction.create({
                    messageId: reactionMessage.id,
                    emoji: reaction.emoji,
                    roleId: reaction.roleId
                });
            }
        } catch (error) {
            console.error('Error posting reaction message:', error);
            message.channel.send('An error occurred while posting the reaction message.');
        }
    }

    if (message.content.startsWith('!addRoleReaction')) {
        try {
            const [command, emoji, roleId] = message.content.split(' ');

            const reactionMessage = await ReactionMessage.findOne(); // Assuming there's only one message for simplicity
            if (!reactionMessage) {
                return message.channel.send('No reaction message found.');
            }

            await RoleReaction.create({
                messageId: reactionMessage.messageId,
                emoji: emoji,
                roleId: roleId
            });

            const channel = await client.channels.fetch(reactionMessage.channelId);
            const messageToUpdate = await channel.messages.fetch(reactionMessage.messageId);
            await messageToUpdate.react(emoji);
            message.channel.send(`Added reaction role: ${emoji} -> ${roleId}`);
        } catch (error) {
            console.error('Error adding role reaction:', error);
            message.channel.send('An error occurred while adding the role reaction.');
        }
    }
});

client.on('messageReactionAdd', async (reaction, user) => {
    if (user.bot) return;

    try {
        const roleReaction = await RoleReaction.findOne({ where: { messageId: reaction.message.id, emoji: reaction.emoji.name } });
        if (!roleReaction) return;

        const role = reaction.message.guild.roles.cache.get(roleReaction.roleId);
        if (role) {
            const member = reaction.message.guild.members.cache.get(user.id);
            if (member) {
                await member.roles.add(role);
            }
        }
    } catch (error) {
        console.error('Error adding role on reaction:', error);
    }
});

client.on('messageReactionRemove', async (reaction, user) => {
    if (user.bot) return;

    try {
        const roleReaction = await RoleReaction.findOne({ where: { messageId: reaction.message.id, emoji: reaction.emoji.name } });
        if (!roleReaction) return;

        const role = reaction.message.guild.roles.cache.get(roleReaction.roleId);
        if (role) {
            const member = reaction.message.guild.members.cache.get(user.id);
            if (member) {
                await member.roles.remove(role);
            }
        }
    } catch (error) {
        console.error('Error removing role on reaction:', error);
    }
});

client.login(process.env.DISCORD_TOKEN);
