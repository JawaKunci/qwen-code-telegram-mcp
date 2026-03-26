# ⚙️ VIBE CONFIGURATION GUIDE

**For:** Qwen Code-Telegram MCP Server  
**Target:** LLM Agents (Qwen Code, Claude Code, etc.)  
**Purpose:** Automated configuration with user confirmation

---

## 📋 Overview

This guide helps LLM agents configure the Telegram MCP Server **with explicit user confirmation** at each critical step.

**⚠️ IMPORTANT:** Always ask user for confirmation before modifying sensitive data!

---

## 🔐 Step 1: Telegram Bot Token (REQUIRED)

### 1.1 Ask User

```
🤖 I need your Telegram Bot Token to configure the MCP server.

Do you already have a Telegram bot?
- Yes → Please provide your bot token
- No → I'll guide you through creating one
```

### 1.2 If User Has Token

**Ask for confirmation:**
```
📝 Please paste your bot token:

⚠️ SECURITY NOTE: 
- Never share your token publicly
- I'll store it in .env file (gitignored)
- Token format: 123456789:ABCdefGHIjklMNOpqrsTUVwxyz

Ready to proceed? (yes/no)
```

**Action:**
```bash
# Edit .env file
# Replace this line:
TELEGRAM_BOT_TOKEN=your_bot_token_here

# With user's token:
TELEGRAM_BOT_TOKEN=USER_PROVIDED_TOKEN
```

### 1.3 If User Needs New Bot

**Guide user:**
```
📱 Let's create a new Telegram bot!

1. Open Telegram and search for: @BotFather
2. Send command: /newbot
3. Follow these steps:
   - Choose a name (e.g., "My Assistant")
   - Choose a username (e.g., "my_assistant_bot")
   - BotFather will give you a token

4. Copy the token and paste it here

Need help? Type "help" for detailed instructions.
```

**After user provides token:**
```
✅ Bot token received!
Saving to .env file...

Bot username: @USER_BOT_USERNAME
Token: 123456789:ABCdef... (partially hidden for security)

Proceed to next step? (yes/no)
```

---

## 📁 Step 2: Workspace Path (REQUIRED)

### 2.1 Ask User

```
📂 Where should the bot store session data?

Current directory: [CURRENT_PATH]

Options:
1. Use current directory (recommended)
2. Choose custom path
3. Use default ([DEFAULT_PATH])

Which option? (1/2/3)
```

### 2.2 Configuration

**Action:**
```bash
# Edit .env file
# Replace:
WORKSPACE_PATH=[WORKSPACE_PATH]

# With confirmed path:
WORKSPACE_PATH=/user/confirmed/path
```

**Confirmation:**
```
✅ Workspace path configured: [PATH]

This path will store:
- Session data (temp/telegram-sessions/)
- Bot logs (temp/telegram-bot.log)
- Downloaded files (temp/telegram-files/)

Proceed to next step? (yes/no)
```

---

## 🔧 Step 3: MCP Configuration (REQUIRED)

### 3.1 Ask User

```
🔌 Let's configure Qwen Code to use this MCP server!

Your Qwen Code config location:
~/.qwen/settings.json

Do you want me to:
1. Add Telegram MCP to existing config (recommended)
2. Create new config file
3. Skip MCP configuration (manual setup later)

Which option? (1/2/3)
```

### 3.2 Add to Existing Config

**Read current config:**
```bash
# Read ~/.qwen/settings.json
# Check if mcpServers section exists
```

**Ask for confirmation:**
```
📝 I'll add this to your Qwen Code config:

```json
{
  "mcpServers": {
    "telegram": {
      "command": "node",
      "args": ["[PROJECT_PATH]/dist/index.js"],
      "env": {
        "TELEGRAM_BOT_TOKEN": "${TELEGRAM_BOT_TOKEN}",
        "WORKSPACE_PATH": "[WORKSPACE_PATH]"
      }
    }
  }
}
```

Proceed? (yes/no)
```

**Action:**
```bash
# Backup existing config
cp ~/.qwen/settings.json ~/.qwen/settings.json.backup

# Add MCP server configuration
# Use jq or manual JSON editing
```

**Confirmation:**
```
✅ MCP server added to Qwen Code config!

Config location: ~/.qwen/settings.json
Backup created: ~/.qwen/settings.json.backup

Restart Qwen Code to apply changes.
```

### 3.3 Create New Config

**If no existing config:**
```
📝 Creating new Qwen Code config...

Config location: ~/.qwen/settings.json

Proceed? (yes/no)
```

**Action:**
```bash
# Create .qwen directory if not exists
mkdir -p ~/.qwen

# Create settings.json with MCP config
```

---

## 🎯 Step 4: Custom Configuration (OPTIONAL)

### 4.1 Ask User

```
🎨 Want to customize your bot?

Optional settings:
- Custom commands directory
- Session timeout settings
- Approval mode defaults
- Log file location

Configure optional settings? (yes/no)
```

### 4.2 If Yes

**Guide through each option:**

```
📌 Custom Commands

Do you want custom slash commands (e.g., /health, /status)?
- Yes → I'll create the commands folder
- No → Skip

Proceed? (yes/no)
```

**Action:**
```bash
# If yes:
mkdir -p [WORKSPACE_PATH]/.qwen/commands

# Create example command files
```

---

## ✅ Configuration Complete!

### Summary

```
✅ Configuration Summary:

Telegram Bot: @BOT_USERNAME ✅
Bot Token: Configured (hidden) ✅
Workspace Path: [PATH] ✅
MCP Config: ~/.qwen/settings.json ✅
Custom Commands: [Yes/No] ✅

Files modified:
- .env
- ~/.qwen/settings.json
```

### Next Steps

```
🚀 You're almost ready!

1. Restart Qwen Code (MANDATORY):
   - Close and reopen Qwen Code
   - Or run: qwen (if CLI)

2. Test the bot:
   - Open Telegram
   - Search: @BOT_USERNAME
   - Send: /start

3. If issues occur:
   - Check [VIBE-REPAIR.md](VIBE-REPAIR.md)
   - Review logs: [WORKSPACE_PATH]/temp/telegram-bot.log

Ready to test? (yes/no)
```

---

## 🔒 Security Reminders

**Always remind user:**

```
🔐 SECURITY REMINDERS:

✅ Your bot token is stored in .env (gitignored)
✅ Never commit .env to GitHub
✅ Never share your token publicly
✅ Rotate token if compromised:
   1. @BotFather → /revoke
   2. Update .env with new token
   3. Restart bot
```

---

## 📝 Configuration Checklist

- [ ] Bot token obtained and stored
- [ ] Workspace path configured
- [ ] MCP config added to Qwen Code
- [ ] Custom commands (optional)
- [ ] Security reminders acknowledged
- [ ] User ready to test

---

## 🆘 Need Help?

If configuration fails:

1. **Check .env file** - Verify all values are correct
2. **Test bot token** - Send message to bot in Telegram
3. **Review logs** - Check `temp/telegram-bot.log`
4. **See [VIBE-REPAIR.md](VIBE-REPAIR.md)** - Common issues

---

*Last updated: 2026-03-26*  
*Version: 1.0.0*
