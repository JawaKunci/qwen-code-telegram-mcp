# Qwen Code Telegram MCP Server - Complete Documentation

**Last Updated:** 2026-03-26  
**Version:** v2.2.0  
**Status:** ✅ PRODUCTION READY

---

## 🎯 Overview

Telegram MCP Server is a bridge between Telegram Bot API and Qwen Code via MCP protocol, enabling direct interaction with Qwen Code from Telegram.

### Key Features

- ✅ **Private Chat** - Full AI conversation with session persistence
- ✅ **Group Chat** - Mention-based triggering (`@bot_name`)
- ✅ **Custom Commands** - Load from markdown files
- ✅ **File Handling** - Send/receive documents & photos
- ✅ **Confirmation Management** - Handle interactive prompts
- ✅ **Approval Modes** - Plan/Auto-accept/Yolo
- ✅ **Pairing System** - 6-digit code security
- ✅ **Session Persistence** - JSON file-based storage
- ✅ **File Logging** - Debugging for interactive mode
- ✅ **Quoted Message Support** - Bot reads reply/quote in groups
- ✅ **Telegram Auto-Correct** - Handle `/command@botname` (no space)
- ✅ **Metrics Tracking** - Request count & token usage

---

## 📋 Quick Start

### For Qwen Code Users (Recommended)

**Let your LLM agent handle everything!**

After cloning, tell your Qwen Code:

```
Read and implement VIBE-INSTALL.md, then VIBE-CONFIG.md. 
Ask for my confirmation before sensitive data.
```

**📚 Vibe Coding Guides:**
- 📦 [VIBE-INSTALL.md](VIBE-INSTALL.md) - Automated installation
- ⚙️ [VIBE-CONFIG.md](VIBE-CONFIG.md) - Automated configuration
- 🛠️ [VIBE-REPAIR.md](VIBE-REPAIR.md) - Automated troubleshooting

### Manual Installation

#### 1. Installation

```bash
cd [YOUR_WORKSPACE]/qwen-code-telegram-mcp
npm install
npm run build
```

#### 2. Configuration

Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```

Edit `.env`:
```env
TELEGRAM_BOT_TOKEN=your_bot_token_from_botfather
WORKSPACE_PATH=[YOUR_WORKSPACE_PATH]
CUSTOM_COMMANDS_DIR=[YOUR_WORKSPACE_PATH]/.qwen/commands
```

#### 3. BotFather Setup

**IMPORTANT:** Disable privacy mode!

1. Open Telegram → `@BotFather`
2. Send: `/setprivacy`
3. Select bot: `@your_bot`
4. Choose: `Disable privacy`

#### 4. MCP Configuration

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

#### 5. Start

```bash
npx qwen
```

Chat with your bot on Telegram!

---

## 💬 Usage

### Private Chat

Just send message to bot:
```
User: Hello
Bot: [AI response from Qwen Code]
```

### Group Chat

**Must mention bot:**
```
User: @your_bot_name What's the capital of France?
Bot: [AI response]

User: hello everyone
Bot: [Ignored - no mention]
```

**With quoted message:**
```
User 1: [sends message] "This is important"
User 2: [reply] @your_bot_name summarize this
Bot: [Reads quoted message + instruction]
```

**Telegram auto-correct (no space):**
```
User types: /help @your_bot_name
Telegram sends: /help@your_bot_name
Bot: [Still works! Auto-correct handled]
```

### Custom Commands

```
/health - Run workspace health check
/sym - Symbiote diagnostic (if configured)
/end - Exit Venom
/go - Activate Venom
```

### Built-in Commands

```
/start - Welcome + pairing info
/help - Help information
/status - Server status
/session - Your session info
/clear - Clear your session
/whoami - Your Telegram info
/approvalmode - View/set approval mode
/pair <CODE> - Pair with bot
```

---

## 🗂️ File Structure

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
├── README.md                 # User documentation
├── DOCUMENTATION.md          # This file (technical docs)
├── VIBE-INSTALL.md           # LLM agent installation guide
├── VIBE-CONFIG.md            # LLM agent configuration guide
├── VIBE-REPAIR.md            # LLM agent troubleshooting guide
├── CONTRIBUTING.md           # Contribution guidelines
├── CODE_OF_CONDUCT.md        # Code of conduct
└── LICENSE                   # ISC License

Workspace/
├── temp/
│   ├── telegram-bot.log              # Runtime log
│   └── telegram-sessions/
│       ├── {chatId}.json             # User sessions
│       ├── allowlist.json            # Paired users
│       └── approval-modes.json       # Approval modes
└── .qwen/
    └── commands/
        ├── end.md                    # Custom commands
        ├── go.md
        ├── health.md
        └── ...
```

---

## 🔧 Configuration Options

### Environment Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `TELEGRAM_BOT_TOKEN` | Bot token from @BotFather | `123456:ABCdef...` |
| `WORKSPACE_PATH` | Path to workspace | `/home/user/workspace` |
| `CUSTOM_COMMANDS_DIR` | Custom commands folder | `.../workspace/.qwen/commands` |
| `MCP_SERVER_PORT` | MCP server port | `3000` |
| `MCP_TRANSPORT` | Transport type | `stdio` |

### Session Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `MAX_CONVERSATION_HISTORY` | 50 | Max messages per session |
| `INACTIVE_CHAT_TIMEOUT_MS` | 86400000 | Session expiry (24h) |

---

## 📊 Features Detail

### 1. Group Chat Support

**Behavior:**
- Respond ONLY when mentioned (`@bot_name`)
- Silent ignore for non-mentions
- Auto-reply to original message
- Mention removed from processed text
- **READS QUOTED MESSAGE** - Bot can see reply/quote context
- **TELEGRAM AUTO-CORRECT** - Handles `/command@botname` (no space)

**Example:**
```
Input:  "@your_bot_name hello how are you"
Process: "hello how are you" (mention removed)
Output: [AI response]

Input:  "/help@your_bot_name" (Telegram auto-correct, no space)
Process: command="help", args="" (parsed correctly)
Output: [Help command executed]

Input:  [reply to message] "@your_bot_name summarize this"
Process: quoted="User1: \"message\"\n\n" + "summarize this"
Output: [AI response with context]
```

**Requirements:**
- Privacy mode MUST be disabled via @BotFather

### 1.1. Quoted Message Support

Bot automatically reads and includes quoted/replied messages in group chats:

```typescript
// Detected from msg.reply_to_message
const quotedMessage = `${replyFrom}: "${replyText}"\n\n`;
const fullText = quotedMessage + userMessage;
```

**Use case:**
```
User 1: "The quick brown fox jumps over the lazy dog"
User 2: [reply] @bot summarize this
Bot context: "User1: \"The quick brown fox...\"\n\nsummarize this"
```

### 1.2. Telegram Auto-Correct Handling

Telegram auto-corrects `/command @botname` → `/command@botname` (no space).

**Enhanced regex:**
```typescript
// Old: /^\/(\S+)(?:\s+(.*))?$/
// New: /^\/(\w+)(?:@\w+)?(?:\s+(.*))?$/
//                   └──┬──┘
//            optional @botname (no space)
```

**Works with:**
- `/help @your_bot_name` ✅ (with space)
- `/help@your_bot_name` ✅ (no space, Telegram auto-correct)
- `/help` ✅ (DM, no mention)

### 1.3. Metrics Tracking

Bot now tracks usage metrics:

- `totalRequests` - Total message count
- `totalErrors` - Error count
- `tokens.total` - Estimated token usage
- `tokens.prompt` - Input tokens
- `tokens.output` - Output tokens

**View with:** `/status` command

### 2. Session Management

**Storage:** `[WORKSPACE_PATH]/temp/telegram-sessions/{chatId}.json`

**Structure:**
```json
{
  "chatId": "123456789",
  "messages": [
    {"role": "user", "content": "Hello", "timestamp": 1234567890}
  ],
  "lastActive": 1234567890
}
```

**Auto-Cleanup:**
- Inactive > 7 days → Deleted
- Runs every 1 hour

### 3. Custom Commands

**Format:** `[CUSTOM_COMMANDS_DIR]/{name}.md`

```markdown
---
description: Command description
---

Command content here...
```

**Usage:** `/{name} [args]`

**Loading:**
- On bot startup
- Deduplication (same name = skip)
- Max 100 commands

### 4. Confirmation Management

**Detects patterns:**
- `? Are you sure...`
- `(y/n)`, `[yes/no]`
- `Type 'yes' to confirm`

**Flow:**
1. Qwen asks confirmation
2. Bot forwards to Telegram
3. User replies yes/no
4. Bot forwards to Qwen stdin
5. Qwen continues

**Timeout:** 5 minutes

### 5. Approval Modes

**Modes:**
- `plan` (default) - Show plan before execute
- `auto-accept` - Auto-approve plans
- `yolo` - No confirmation

**Storage:** `[WORKSPACE_PATH]/temp/telegram-sessions/approval-modes.json`

**Command:** `/approvalmode [mode]`

### 6. Pairing System

**Purpose:** Security - only paired users can access

**Flow:**
1. Admin generates code (MCP tool)
2. Code: 6-digit, valid 15 min
3. User: `/pair ABC123`
4. Access granted

**Storage:** `[WORKSPACE_PATH]/temp/telegram-sessions/allowlist.json`

### 7. File Handling

**Supported:**
- Documents (any type)
- Photos (auto-download)

**MCP Tools:**
- `send_telegram_file`
- `list_telegram_downloads`

**Storage:** `[WORKSPACE_PATH]/temp/telegram-files/`

### 8. File Logging

**Location:** `[WORKSPACE_PATH]/temp/telegram-bot.log`

**Logs:**
- Incoming messages
- Bot responses
- Errors (with stack trace)
- Session operations
- Command executions

**Format:**
```
[2026-03-26T16:16:01.003Z] 📨 MESSAGE: chatId=-5176826110, type=group, text="@your_bot_name hello"
[2026-03-26T16:16:01.004Z] 🤖 BOT INFO: username=your_bot_name, ready=true
[2026-03-26T16:16:01.004Z] 📊 CHECK: isGroup=true, isMentioned=true
[2026-03-26T16:16:01.395Z] ✅ Response sent successfully
```

---

## 🐛 Troubleshooting

### Bot doesn't respond in group

**Problem:** Privacy mode enabled  
**Solution:** `/setprivacy` @BotFather → Disable

### Bot doesn't respond at all

**Check:**
1. Bot token valid?
2. Bot running in Qwen Code?
3. Check log file: `temp/telegram-bot.log`

### Session not saving

**Check:**
1. `WORKSPACE_PATH` correct?
2. Folder has write permission?
3. `temp/telegram-sessions/` exists?

### MCP disconnects constantly

**Check log file for:**
- `❌ ERROR` entries
- Infinite loops
- Initialization errors

### Custom commands don't load

**Check:**
1. Folder exists?
2. Files end with `.md`?
3. Frontmatter correct?

### Need More Help?

👉 **See [VIBE-REPAIR.md](VIBE-REPAIR.md)** for comprehensive troubleshooting!

---

## 🧪 Testing Checklist

### Basic
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

**Major Features:**
- ✅ Full group chat support with mention-based triggering
- ✅ File logging for interactive mode debugging
- ✅ Quoted message support (bot reads reply/quote context)
- ✅ Telegram auto-correct handling (`/command@botname` no space)
- ✅ Metrics tracking (requests, tokens, errors)

**Bug Fixes:**
- Fixed: Initialization order (`fetchBotInfo` after `bot` declaration)
- Fixed: Infinite recursion (`console.log` ↔ `logToFile` circular call)
- Fixed: Custom command deduplication (infinite loop loading)
- Fixed: Metrics always showing 0 (now increments correctly)
- Fixed: Bot can't read quoted messages (now includes reply context)
- Fixed: Telegram auto-correct breaks commands (enhanced regex)

### v2.1.7
- Enhanced commands
- System prompt improvements

### v2.1.6
- Windows command line limit fix

### v2.1.5
- Chat ID context

### v2.1.4
- File context fix

### v2.1.3
- Command syntax (`/` vs `.qwen`)
- Session startup prompt

### v2.1.2
- Smart chunking
- Progressive streaming

### v2.1.1
- Confirmation forwarding
- File support

### v2.1
- Multi-bot support via workspace-specific MCP config

### v2.0
- Persistent sessions
- Pairing system
- Typing indicators
- Admin commands
- Auto-cleanup

### v1.0
- Initial release with basic MCP integration

---

## 🔍 Technical Details

### Architecture

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   Telegram      │────▶│  MCP Server      │────▶│   Qwen Code     │
│   Bot API       │◀────│  (index.ts)      │◀────│   CLI           │
└─────────────────┘     └──────────────────┘     └─────────────────┘
                               │
                               ▼
                        ┌──────────────────┐
                        │  Session Storage │
                        │  (JSON files)    │
                        └──────────────────┘
```

### Message Flow

1. **User sends message** → Telegram Bot API
2. **Bot receives** → Checks allowlist/pairing
3. **Group detection** → Checks mention
4. **Session load** → Gets conversation history
5. **Qwen CLI spawn** → Sends prompt via stdin
6. **Response stream** → Forwards to Telegram
7. **Session save** → Updates JSON file
8. **Log write** → Appends to log file

### Key Components

| Component | File | Purpose |
|-----------|------|---------|
| Bot Initialization | Line ~100 | Setup Telegram bot |
| MCP Server | Line ~990 | MCP protocol implementation |
| Session Manager | Class ~400 | File-based session storage |
| Allowlist Manager | Inline | Pairing system |
| Qwen Client | Class ~600 | Qwen Code CLI interaction |
| Custom Commands | Function ~850 | Markdown command loader |
| Logger | Function ~50 | File-based logging |

---

## 📞 Support

**Documentation:**
- [README.md](README.md) - User guide
- [VIBE-INSTALL.md](VIBE-INSTALL.md) - Installation guide
- [VIBE-CONFIG.md](VIBE-CONFIG.md) - Configuration guide
- [VIBE-REPAIR.md](VIBE-REPAIR.md) - Troubleshooting guide
- [temp/telegram-bot.log](temp/telegram-bot.log) - Runtime logs

**Issues:**
1. Check log file first
2. Verify configuration
3. Test with `/start` command
4. Check BotFather privacy settings
5. Create GitHub issue with error details

---

*Qwen Code Telegram MCP Server v2.2.0 - Built with ❤️ for Qwen Code*
