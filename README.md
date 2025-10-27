# StrongBot

A Discord bot that maintains an XML file mapping Discord users to their roles and Steam IDs, with support for verifying Steam connections and granting channel-specific roles.

## Features

- **User Mapping**: Automatically generates and maintains an XML file with all server members, their roles, and Steam IDs
- **Steam Verification**: `!stronghold contact` command verifies Steam account connections
- **Role Management**: Automatically grants channel-specific roles upon successful Steam verification
- **Real-time Updates**: XML file updates automatically when members join, leave, or change roles
- **Configurable**: All settings stored in external configuration file

## Prerequisites

- Node.js 16.0.0 or higher
- A Discord Bot Token
- Discord Developer Portal access

## Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd strongbot
```

2. Install dependencies:
```bash
npm install
```

3. Create configuration file:
```bash
cp config.example.json config.json
```

4. Edit `config.json` with your bot credentials and settings

## Configuration

Edit `config.json` with the following settings:

```json
{
  "token": "YOUR_BOT_TOKEN_HERE",
  "clientId": "YOUR_CLIENT_ID_HERE",
  "guildId": "YOUR_GUILD_ID_HERE",
  "xmlFilePath": "./discord_users.xml",
  "updateIntervalMinutes": 5,
  "commandPrefix": "!",
  "channelRoleMap": {
    "CHANNEL_ID_1": "ROLE_ID_1",
    "CHANNEL_ID_2": "ROLE_ID_2"
  }
}
```

### Configuration Options

| Option | Required | Default | Description |
|--------|----------|---------|-------------|
| `token` | Yes | - | Your Discord bot token |
| `clientId` | No | - | OAuth2 Client ID (for generating auth URLs) |
| `guildId` | No | First guild | Specific Discord server ID to monitor |
| `xmlFilePath` | No | `./discord_users.xml` | Path to output XML file |
| `updateIntervalMinutes` | No | 5 | How often to update XML file (minutes) |
| `commandPrefix` | No | `!` | Command prefix for bot commands |
| `channelRoleMap` | No | `{}` | Map of channel IDs to role IDs for `stronghold contact` |

## Bot Setup

### 1. Create Discord Application

1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Click "New Application" and give it a name
3. Go to "Bot" section and click "Add Bot"
4. Copy the bot token (for `config.json`)

### 2. Enable Intents

In the Bot settings, enable:
- ✅ Server Members Intent
- ✅ Presence Intent
- ✅ Message Content Intent

### 3. Get Client ID

1. Go to "OAuth2" → "General"
2. Copy the Client ID (for `config.json`)

### 4. Invite Bot to Server

Use this URL (replace `YOUR_CLIENT_ID`):
```
https://discord.com/api/oauth2/authorize?client_id=YOUR_CLIENT_ID&permissions=268435456&scope=bot
```

Required permissions:
- Manage Roles
- Read Messages/View Channels
- Send Messages
- Read Message History

### 5. Get Channel and Role IDs

1. Enable Developer Mode: User Settings → Advanced → Developer Mode
2. Right-click channels/roles and select "Copy ID"
3. Add to `channelRoleMap` in config

## Usage

### Start the Bot

```bash
npm start
```

Or with a custom config file:
```bash
node strongbot.js /path/to/config.json
```

### Development Mode

```bash
npm run dev
```

Uses nodemon for automatic restarts on file changes.

### Commands

#### `!stronghold`
Shows available subcommands.

#### `!stronghold contact`
Verifies Steam account connection and grants channel-specific role.

**Flow:**
1. User runs command in configured channel
2. Bot checks if Steam account is connected
3. If not connected, bot provides setup instructions
4. If connected, bot grants the role and confirms

## XML Output Format

The bot generates an XML file with this structure:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<discord_users>
  <guild id="123456789" name="My Server">
    <user id="987654321" username="john_doe">
      <roles>
        <role id="111222333" name="Member" color="#99AAB5" />
        <role id="444555666" name="Verified" color="#43B581" />
      </roles>
      <steam_id>76561198012345678</steam_id>
    </user>
  </guild>
</discord_users>
```

## Development

### Linting

Check code style:
```bash
npm run lint
```

Auto-fix issues:
```bash
npm run lint:fix
```

### Code Style

This project follows [Google JavaScript Style Guide](https://google.github.io/styleguide/jsguide.html).

## Troubleshooting

### Bot doesn't respond to commands
- Verify Message Content Intent is enabled
- Check bot has permission to read/send messages in the channel
- Verify correct command prefix in config

### Steam ID not detected
- Discord bots have limited access to user connections
- Users must authorize bot via OAuth2 with `connections` scope
- Bot provides instructions when Steam connection isn't detected

### Role not granted
- Ensure bot has "Manage Roles" permission
- Bot's role must be higher than the role it's trying to grant
- Check role ID is correct in `channelRoleMap`

### XML file not updating
- Check write permissions for the output directory
- Verify `xmlFilePath` in config is correct
- Check console logs for errors

## License

MIT

## Support

For issues and questions, please create an issue in the repository.
