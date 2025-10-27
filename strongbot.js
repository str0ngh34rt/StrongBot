/**
 * @fileoverview Discord bot that maintains an XML file mapping Discord users
 * to their roles and Steam IDs.
 * @author Your Name
 */

const {Client, GatewayIntentBits, PermissionFlagsBits} = require('discord.js');
const fs = require('fs').promises;
const path = require('path');

/**
 * Bot configuration object.
 * @type {?Object}
 */
let config = null;

/**
 * Discord client instance.
 * @type {?Client}
 */
let client = null;

/**
 * Loads configuration from a JSON file.
 * @param {string} configPath Path to the configuration file.
 * @return {Promise<Object>} The loaded configuration object.
 */
async function loadConfig(configPath) {
  try {
    const configData = await fs.readFile(configPath, 'utf8');
    const parsedConfig = JSON.parse(configData);

    // Validate required fields
    if (!parsedConfig.token) {
      throw new Error('Configuration must include "token" field');
    }

    // Set defaults
    return {
      token: parsedConfig.token,
      guildId: parsedConfig.guildId || null,
      xmlFilePath: parsedConfig.xmlFilePath ||
          path.join(process.cwd(), 'discord_users.xml'),
      updateIntervalMinutes: parsedConfig.updateIntervalMinutes || 5,
      commandPrefix: parsedConfig.commandPrefix || '!',
      channelRoleMap: parsedConfig.channelRoleMap || {},
      clientId: parsedConfig.clientId || null,
    };
  } catch (error) {
    console.error(`Error loading configuration from ${configPath}:`, error);
    throw error;
  }
}

/**
 * Generates XML content from guild members.
 * @param {Guild} guild The Discord guild to process.
 * @return {Promise<string>} The generated XML content.
 */
async function generateXML(guild) {
  const members = await guild.members.fetch();

  let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
  xml += '<discord_users>\n';
  xml += `  <guild id="${escapeXML(guild.id)}" ` +
         `name="${escapeXML(guild.name)}">\n`;

  for (const [memberId, member] of members) {
    xml += `    <user id="${escapeXML(member.user.id)}" ` +
           `username="${escapeXML(member.user.username)}">\n`;

    // Add roles
    xml += '      <roles>\n';
    const roles = member.roles.cache
        .filter((role) => role.name !== '@everyone')
        .sort((a, b) => b.position - a.position);

    for (const [roleId, role] of roles) {
      xml += `        <role id="${escapeXML(roleId)}" ` +
             `name="${escapeXML(role.name)}" ` +
             `color="${role.hexColor}" />\n`;
    }
    xml += '      </roles>\n';

    // Add Steam ID if connected
    const steamId = await getSteamId(member);
    if (steamId) {
      xml += `      <steam_id>${escapeXML(steamId)}</steam_id>\n`;
    } else {
      xml += '      <steam_id></steam_id>\n';
    }

    xml += '    </user>\n';
  }

  xml += '  </guild>\n';
  xml += '</discord_users>';

  return xml;
}

/**
 * Extracts Steam ID from user's connected accounts.
 * @param {GuildMember} member The guild member to check.
 * @return {Promise<?string>} The Steam ID if found, null otherwise.
 */
async function getSteamId(member) {
  try {
    // Note: Discord.js doesn't expose connected accounts through the API
    // This would require the user to authorize via OAuth2
    // We'll check if we have this data, but it will typically be null
    const user = await member.user.fetch(true);

    if (user.connectedAccounts) {
      const steamAccount = user.connectedAccounts.find(
          (acc) => acc.type === 'steam'
      );
      return steamAccount ? steamAccount.id : null;
    }

    return null;
  } catch (error) {
    console.error(
        `Error fetching Steam ID for ${member.user.username}:`,
        error.message
    );
    return null;
  }
}

/**
 * Checks if a user has Steam connected via OAuth2.
 * For this to work, users must authorize the bot with the connections scope.
 * @param {string} userId The Discord user ID.
 * @return {Promise<?string>} The Steam ID if found, null otherwise.
 */
async function checkSteamConnection(userId) {
  // Note: This requires OAuth2 authorization with connections scope
  // The standard bot API doesn't have access to user connections
  // This is a placeholder that would work if the user has authorized
  try {
    const guild = client.guilds.cache.get(config.guildId) ||
        client.guilds.cache.first();
    const member = await guild.members.fetch(userId);
    return await getSteamId(member);
  } catch (error) {
    console.error('Error checking Steam connection:', error);
    return null;
  }
}

/**
 * Generates OAuth2 authorization URL for Steam connection.
 * @return {string} The authorization URL.
 */
function generateAuthUrl() {
  if (!config.clientId) {
    return null;
  }

  const redirectUri = encodeURIComponent('https://discord.com/oauth2/authorized');
  const scopes = encodeURIComponent('identify connections');
  return `https://discord.com/api/oauth2/authorize?` +
      `client_id=${config.clientId}&` +
      `redirect_uri=${redirectUri}&` +
      `response_type=code&` +
      `scope=${scopes}`;
}

/**
 * Handles the stronghold contact command.
 * @param {Message} message The Discord message object.
 * @return {Promise<void>}
 */
async function handleContactCommand(message) {
  const channelId = message.channel.id;

  // Check if this channel has a role mapping
  if (!config.channelRoleMap[channelId]) {
    await message.reply(
        '❌ This channel is not configured for the contact command.'
    );
    return;
  }

  const roleId = config.channelRoleMap[channelId];
  const role = message.guild.roles.cache.get(roleId);

  if (!role) {
    await message.reply(
        '❌ The configured role for this channel could not be found. ' +
        'Please contact an administrator.'
    );
    console.error(
        `Role ${roleId} not found for channel ${channelId}`
    );
    return;
  }

  // Check if user already has the role
  if (message.member.roles.cache.has(roleId)) {
    await message.reply(
        `✓ You already have the **${role.name}** role!`
    );
    return;
  }

  // Check for Steam connection
  const steamId = await checkSteamConnection(message.author.id);

  if (!steamId) {
    // Guide user on connecting Steam account
    const authUrl = generateAuthUrl();
    let replyMessage = '**Steam Account Not Connected**\n\n';
    replyMessage += 'To use this command, you need to:\n\n';
    replyMessage += '1️⃣ **Connect your Steam account to Discord:**\n';
    replyMessage += '   • Go to User Settings → Connections\n';
    replyMessage += '   • Click the Steam icon and authorize the connection\n\n';
    replyMessage += '2️⃣ **Grant this bot permission to see your connections:**\n';

    if (authUrl) {
      replyMessage += `   • Click this link to authorize: ${authUrl}\n`;
      replyMessage += '   • Make sure to check "connections" permission\n\n';
    } else {
      replyMessage += '   • Contact an administrator for the authorization link\n';
      replyMessage += '   • The bot needs OAuth2 setup with clientId configured\n\n';
    }

    replyMessage += '3️⃣ **Run this command again** after completing the steps\n\n';
    replyMessage += '**Note:** Discord bots have limited access to connection data. ';
    replyMessage += 'If you\'ve completed these steps and still see this message, ';
    replyMessage += 'please contact an administrator.';

    await message.reply(replyMessage);
    return;
  }

  // User has Steam connected, grant the role
  try {
    await message.member.roles.add(role);
    await message.reply(
        `✓ Steam account verified! You have been granted the **${role.name}** role.\n` +
        `Steam ID: \`${steamId}\``
    );

    console.log(
        `Granted role ${role.name} to ${message.author.username} ` +
        `(Steam ID: ${steamId})`
    );

    // Update the XML file
    await updateUserMapping(message.guild);
  } catch (error) {
    console.error('Error granting role:', error);
    await message.reply(
        '❌ Failed to grant role. The bot may lack the necessary permissions.'
    );
  }
}

/**
 * Handles the stronghold command and its subcommands.
 * @param {Message} message The Discord message object.
 * @param {Array<string>} args Command arguments.
 * @return {Promise<void>}
 */
async function handleStrongholdCommand(message, args) {
  if (args.length === 0) {
    await message.reply(
        '**Stronghold Bot Commands**\n\n' +
        `\`${config.commandPrefix}stronghold contact\` - Verify Steam connection and get role`
    );
    return;
  }

  const subcommand = args[0].toLowerCase();

  switch (subcommand) {
    case 'contact':
      await handleContactCommand(message);
      break;
    default:
      await message.reply(
          `❌ Unknown subcommand: \`${subcommand}\`\n` +
          `Use \`${config.commandPrefix}stronghold\` to see available commands.`
      );
  }
}

/**
 * Escapes special XML characters.
 * @param {*} str The string to escape.
 * @return {string} The escaped string.
 */
function escapeXML(str) {
  if (str === null || str === undefined) return '';
  return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
}

/**
 * Saves XML data to file.
 * @param {string} xmlContent The XML content to save.
 * @return {Promise<void>}
 */
async function saveXMLFile(xmlContent) {
  try {
    await fs.writeFile(config.xmlFilePath, xmlContent, 'utf8');
    console.log(`✓ XML file updated: ${config.xmlFilePath}`);
  } catch (error) {
    console.error('Error saving XML file:', error);
  }
}

/**
 * Updates the XML file with current guild data.
 * @param {Guild} guild The Discord guild to process.
 * @return {Promise<void>}
 */
async function updateUserMapping(guild) {
  console.log(`Updating user mapping for guild: ${guild.name}`);
  const xml = await generateXML(guild);
  await saveXMLFile(xml);
}

/**
 * Initializes the Discord bot with the given configuration.
 * @return {Promise<void>}
 */
async function initializeBot() {
  client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMembers,
      GatewayIntentBits.GuildPresences,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
    ],
  });

  // Event: Bot is ready
  client.once('ready', async () => {
    console.log(`✓ Logged in as ${client.user.tag}`);

    // Get the guild (server)
    let guild;
    if (config.guildId) {
      guild = client.guilds.cache.get(config.guildId);
    } else {
      // Use the first guild the bot is in
      guild = client.guilds.cache.first();
    }

    if (!guild) {
      console.error('No guild found! Make sure the bot is in a server.');
      return;
    }

    console.log(`Monitoring guild: ${guild.name} (${guild.id})`);

    // Initial update
    await updateUserMapping(guild);

    // Update at configured interval
    const intervalMs = config.updateIntervalMinutes * 60 * 1000;
    setInterval(async () => {
      await updateUserMapping(guild);
    }, intervalMs);
  });

  // Event: Message created (for commands)
  client.on('messageCreate', async (message) => {
    // Ignore bot messages
    if (message.author.bot) return;

    // Check if message is a command
    if (!message.content.startsWith(config.commandPrefix)) return;

    const args = message.content
        .slice(config.commandPrefix.length)
        .trim()
        .split(/\s+/);
    const command = args.shift().toLowerCase();

    if (command === 'stronghold') {
      await handleStrongholdCommand(message, args);
    }
  });

  // Event: New member joins
  client.on('guildMemberAdd', async (member) => {
    console.log(`New member joined: ${member.user.username}`);
    await updateUserMapping(member.guild);
  });

  // Event: Member leaves
  client.on('guildMemberRemove', async (member) => {
    console.log(`Member left: ${member.user.username}`);
    await updateUserMapping(member.guild);
  });

  // Event: Member updated (role changes, etc.)
  client.on('guildMemberUpdate', async (oldMember, newMember) => {
    console.log(`Member updated: ${newMember.user.username}`);
    await updateUserMapping(newMember.guild);
  });

  // Event: User updated (username, avatar, etc.)
  client.on('userUpdate', async (oldUser, newUser) => {
    console.log(`User updated: ${newUser.username}`);
    // Update all guilds the user is in
    for (const [guildId, guild] of client.guilds.cache) {
      if (guild.members.cache.has(newUser.id)) {
        await updateUserMapping(guild);
      }
    }
  });

  // Error handling
  client.on('error', (error) => {
    console.error('Discord client error:', error);
  });

  process.on('unhandledRejection', (error) => {
    console.error('Unhandled promise rejection:', error);
  });

  // Login to Discord
  await client.login(config.token);
}

/**
 * Main entry point for the bot.
 * @return {Promise<void>}
 */
async function main() {
  // Check for config file argument
  if (process.argv.length < 3) {
    console.error('Usage: node bot.js <config-file-path>');
    console.error('Example: node bot.js ./config.json');
    process.exit(1);
  }

  const configPath = process.argv[2];
  console.log(`Loading configuration from: ${configPath}`);

  try {
    config = await loadConfig(configPath);
    console.log('✓ Configuration loaded successfully');
    await initializeBot();
  } catch (error) {
    console.error('Failed to start bot:', error);
    process.exit(1);
  }
}

// Start the bot
main();
