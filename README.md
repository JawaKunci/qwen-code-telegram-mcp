# Qwen Code Telegram MCP Server

**Version:** v2.2.0  

MCP Server for Telegram Bot integration with Qwen Code. Chat with Qwen Code directly from Telegram with persistent sessions, group chat support, and advanced features.

---

## 🌟 Features

### Core Features
- 🤖 **Telegram Bot Integration** - Full Telegram Bot API via long polling
- 🔌 **MCP Protocol Support** - Native integration with Qwen Code
- 💬 **Persistent Sessions** - File-based conversation history (survives restarts)
- 🔐 **Pairing System** - 6-digit code security for access control
- ⌨️ **Typing Indicators** - Better UX while processing
- 📊 **Admin Commands** - Session management and monitoring
- 🧹 **Auto-Cleanup** - Automatic maintenance for old sessions
- 🔧 **Dynamic Configuration** - Workspace-specific settings

### v2.2.0 New Features
- 👥 **Group Chat Support** - Bot works in groups without crashes!
- 📢 **Mention-Based Trigger** - Bot responds only when mentioned (`@bot_name`)
- 💭 **Quoted Message Context** - Bot reads reply/quote messages
- 🔇 **Silent Ignore** - No spam in groups (ignores non-mentions)
- 🎯 **Smart Reply** - Auto-reply to original message for better UX
- 📈 **Metrics Tracking** - Request count and token usage monitoring

---

## 🚀 Quick Start

### For Qwen Code Users (Vibe Coding)

**🎯 EASIEST METHOD:** Let your LLM agent handle everything!

After cloning this repository, simply tell your Qwen Code:

```
@qwen Read and implement VIBE-INSTALL.md for installation, 
then VIBE-CONFIG.md for configuration. Ask me for confirmation 
before any sensitive data.
```

Your LLM agent will:
1. ✅ Install all dependencies automatically
2. ✅ Build the TypeScript project
3. ✅ Guide you through Telegram bot creation
4. ✅ Configure Qwen Code MCP settings
5. ✅ Test everything works

**📚 Vibe Coding Guides:**
- 📦 [VIBE-INSTALL.md](VIBE-INSTALL.md) - Automated installation
- ⚙️ [VIBE-CONFIG.md](VIBE-CONFIG.md) - Automated configuration  
- 🛠️ [VIBE-REPAIR.md](VIBE-REPAIR.md) - Automated troubleshooting

---

> **Special Note from the Human**
> This is the only section touched by human. Everything in this MCP is vibe-coded but safely structured. 
> If something messed up, simply run your agent. It will do the complex thing for you.
> Wanted new features? Ask your agent.
>
> My agent clears the path. Yours should follow.
> -JavaIsKey

---

### Manual Installation

#### Prerequisites
- Node.js >= 18.x
- npm >= 9.x
- Git

#### Steps

1. **Clone repository**
```bash
git clone https://github.com/YOUR_USERNAME/qwen-code-telegram-mcp.git
cd qwen-code-telegram-mcp
```

2. **Install dependencies**
```bash
npm install
```

3. **Build TypeScript**
```bash
npm run build
```

4. **Setup environment**
```bash
cp .env.example .env
# Edit .env with your configuration
```

5. **Configure Qwen Code**

Add to `~/.qwen/settings.json`:
```json
{
  "mcpServers": {
    "telegram": {
      "command": "node",
      "args": ["[YOUR_PATH]/dist/index.js"],
      "env": {
        "TELEGRAM_BOT_TOKEN": "${TELEGRAM_BOT_TOKEN}",
        "WORKSPACE_PATH": "[YOUR_WORKSPACE_PATH]"
      }
    }
  }
}
```

6. **Start Qwen Code**
```bash
npx qwen
```

7. **Chat with your bot on Telegram!**

---

## 📱 Telegram Bot Setup

### Create New Bot

1. Open Telegram → Search `@BotFather`
2. Send `/newbot`
3. Follow instructions:
   - Choose name: `My Assistant`
   - Choose username: `my_assistant_bot`
4. **Copy the bot token** (format: `123456789:ABCdef...`)

### ⚠️ IMPORTANT: Disable Privacy Mode

For group chat support:

1. @BotFather → `/setprivacy`
2. Select your bot
3. Choose: **"Disable privacy"**

Without this, bot won't read group messages!

---

## 🎮 Usage

### Private Chat

Just send message to bot:
```
User: Hello
Bot: [AI response from Qwen Code]
```

### Group Chat

**Must mention bot:**
```
User: @my_bot_name What's the capital of France?
Bot: [AI response]

User: hello everyone
Bot: [Ignored - no mention]
```

**With quoted message:**
```
User 1: [sends message] "This is important"
User 2: [reply] @my_bot_name summarize this
Bot: [Reads quoted message + instruction]
```

---

## 📋 Available Commands

### User Commands
- `/start` - Welcome message + pairing instructions
- `/help` - Help information
- `/status` - Server status
- `/session` - Your session info
- `/clear` - Clear your session
- `/whoami` - Your Telegram info
- `/ask <question>` - Ask Qwen Code directly
- `/pair <CODE>` - Pair bot with code
- `/approvalmode [mode]` - Set approval mode (plan/auto-accept/yolo)

### Admin Commands
- `/sessions` - List all active sessions

---

## 🔐 Pairing System

### How It Works

1. **User messages bot** - Bot checks if user is paired
2. **Admin generates code** - Via MCP tool:
   ```
   generate_telegram_pairing_code
   ```
3. **User pairs** - User runs:
   ```
   /pair ABC123
   ```
4. **Access granted** - User now has access

### Pairing Code Properties
- 6 characters (uppercase alphanumeric)
- Valid for 15 minutes
- One-time use
- Auto-cleanup when expired

---

## 📁 Project Structure

```
qwen-code-telegram-mcp/
├── src/
│   └── index.ts              # Main code (2300+ lines)
├── dist/
│   └── index.js              # Compiled code
├── .env                      # Environment config
├── .env.example              # Example config
├── package.json              # Dependencies
├── tsconfig.json             # TypeScript config
├── README.md                 # This file
├── DOCUMENTATION.md          # Detailed documentation
├── VIBE-INSTALL.md           # LLM agent installation guide
├── VIBE-CONFIG.md            # LLM agent configuration guide
└── VIBE-REPAIR.md            # LLM agent troubleshooting guide

Workspace/
├── temp/
│   ├── telegram-bot.log              # Runtime log
│   └── telegram-sessions/
│       ├── {chatId}.json             # User sessions
│       ├── allowlist.json            # Paired users
│       └── approval-modes.json       # Approval modes
└── .qwen/
    └── commands/
        └── *.md                      # Custom commands
```

---

## ⚙️ Configuration

### Environment Variables

Copy `.env.example` to `.env` and configure:

```env
# Telegram Bot Configuration
TELEGRAM_BOT_TOKEN=your_bot_token_here

# Workspace Configuration
WORKSPACE_PATH=/path/to/your/workspace

# MCP Server Configuration
MCP_SERVER_PORT=3000
MCP_TRANSPORT=stdio
```

### Session Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `MAX_CONVERSATION_HISTORY` | 50 | Max messages per session |
| `INACTIVE_CHAT_TIMEOUT_MS` | 86400000 | Session expiry (24h) |

---

## 🛠️ Development

```bash
# Build TypeScript
npm run build

# Run development mode
npm run dev

# Run production
npm start
```

---

## 🐛 Troubleshooting

### Bot not responding

**Check:**
1. Bot token valid? → @BotFather
2. Bot running in Qwen Code?
3. Privacy mode disabled? → `/setprivacy`

### Session not saving

**Check:**
1. `WORKSPACE_PATH` correct?
2. Folder has write permission?
3. `temp/telegram-sessions/` exists?

### Pairing code not working

**Check:**
1. Code not expired (15 min only)
2. Code entered correctly (uppercase)
3. User in allowlist?

### Need Help?

👉 **See [VIBE-REPAIR.md](VIBE-REPAIR.md)** for comprehensive troubleshooting guide!

---

## 📊 Metrics Tracking

Bot automatically tracks:
- `totalRequests` - Total message count
- `totalErrors` - Error count
- `tokens.total` - Estimated token usage
- `tokens.prompt` - Input tokens
- `tokens.output` - Output tokens

**View with:** `/status` command

---

## 🧪 Testing Checklist

### Basic Functionality
- [ ] DM: `hello` → AI response
- [ ] Group: `@bot_name test` → AI response
- [ ] Group: `test` (no mention) → Ignored
- [ ] Custom command: `/health` → Executed

### Sessions
- [ ] Session file created
- [ ] Session persists after restart
- [ ] `/clear` deletes session
- [ ] `/session` shows correct info

### Pairing
- [ ] Unpaired → Access denied
- [ ] Generate code → Works
- [ ] `/pair ABC123` → Success
- [ ] Invalid code → Rejected

### Files
- [ ] Send document → Processed
- [ ] Send photo → Downloaded
- [ ] `send_telegram_file` → Works

### Logging
- [ ] Log file created
- [ ] Messages logged
- [ ] Errors logged
- [ ] No infinite loops

---

## 📝 Version History

### v2.2.0 (Current)
- ✅ Full group chat support
- ✅ Mention-based triggering
- ✅ Quoted message context
- ✅ Telegram auto-correct handling
- ✅ Metrics tracking

### v2.1
- Multi-bot support via workspace-specific MCP config

### v2.0
- Persistent sessions
- Pairing system
- Typing indicators
- Admin commands

### v1.0
- Initial release with basic MCP integration

---

## 📚 Documentation

- **[VIBE-INSTALL.md](VIBE-INSTALL.md)** - LLM agent installation guide
- **[VIBE-CONFIG.md](VIBE-CONFIG.md)** - LLM agent configuration guide
- **[VIBE-REPAIR.md](VIBE-REPAIR.md)** - LLM agent troubleshooting guide
- **[DOCUMENTATION.md](DOCUMENTATION.md)** - Detailed technical documentation
- **[CONTRIBUTING.md](CONTRIBUTING.md)** - Contribution guidelines
- **[CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md)** - Code of conduct

---

## 🤝 Contributing

Contributions welcome! Please read [CONTRIBUTING.md](CONTRIBUTING.md) first.

### Quick Contributing
1. Fork repository
2. Create branch: `git checkout -b feature/your-feature`
3. Make changes
4. Test thoroughly
5. Submit PR

---

## 📄 License

ISC License - see [LICENSE](LICENSE) file.

---

## 🆘 Support

**For Issues:**
1. Check [VIBE-REPAIR.md](VIBE-REPAIR.md) first
2. Review logs: `temp/telegram-bot.log`
3. Create GitHub issue with:
   - Error message
   - What you were doing
   - Your environment (Node.js, OS)

**For Questions:**
- Create GitHub Discussion
- Check [DOCUMENTATION.md](DOCUMENTATION.md)

---

## 🎯 Why Vibe Coding?

This project is designed for **Qwen Code vibe coding**:

- ✅ **LLM-Friendly Setup** - VIBE-* guides for automated installation
- ✅ **Zero Configuration** - LLM agent handles everything
- ✅ **Smart Troubleshooting** - VIBE-REPAIR for automated fixes
- ✅ **User Confirmation** - Sensitive data requires user approval
- ✅ **Well Documented** - Every step clearly explained

**Just clone and let your LLM agent do the work!** 🚀

---

*Built with ❤️ for Qwen Code*  
*Last updated: 2026-03-26*
