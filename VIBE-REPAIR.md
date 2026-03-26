# 🛠️ VIBE REPAIR GUIDE

**For:** Qwen Code-Telegram MCP Server  
**Target:** LLM Agents (Qwen Code, Claude Code, etc.)  
**Purpose:** Diagnose and fix deployment issues

---

## 📋 Overview

This guide helps LLM agents **analyze, diagnose, and fix** common issues during deployment and usage.

**Approach:**
1. 🔍 **Analyze** - Gather error information
2. 🧠 **Diagnose** - Identify root cause
3. 🔧 **Fix** - Apply solution
4. ✅ **Verify** - Confirm fix works

---

## 🔍 Step 1: Gather Information

### Ask User

```
🔍 Let's diagnose the issue!

Please provide:
1. What were you trying to do?
2. What error message did you see?
3. When did it happen? (installation/config/running)
4. Your OS: (Windows/Mac/Linux)

Paste the full error output here:
```

### Check Logs

```bash
# Find log file
[WORKSPACE_PATH]/temp/telegram-bot.log

# Read last 50 lines
tail -n 50 [WORKSPACE_PATH]/temp/telegram-bot.log

# Or on Windows:
Get-Content [WORKSPACE_PATH]\temp\telegram-bot.log -Tail 50
```

**Look for:**
- `❌ ERROR` entries
- `TypeError`, `ReferenceError`, `SyntaxError`
- Connection failures
- Authentication errors

---

## 🧠 Common Issues & Solutions

### Issue 1: `npm install` Fails

**Symptoms:**
```
npm ERR! code ENOENT
npm ERR! Cannot find module
npm ERR! peer dependencies
```

**Diagnosis:**
```bash
# Check Node.js version
node --version

# Check npm version
npm --version

# Clear npm cache
npm cache clean --force
```

**Solutions:**

**A. Node.js Version Mismatch**
```
🔧 FIX: Node.js version issue!

Required: Node.js 18.x or higher
Your version: [VERSION]

Action:
1. Download Node.js from: https://nodejs.org/
2. Install LTS version (18.x or 20.x)
3. Restart terminal
4. Run: npm install

Proceed? (yes/no)
```

**B. Corrupted node_modules**
```
🔧 FIX: Cleaning node_modules!

Action:
1. Remove node_modules folder
2. Remove package-lock.json
3. Reinstall dependencies

Commands:
```bash
rm -rf node_modules package-lock.json
npm install
```

Proceed? (yes/no)
```

**C. Network Issues**
```
🔧 FIX: Network connectivity issue!

Action:
1. Check internet connection
2. Try different npm registry
3. Use npm mirror

Commands:
```bash
npm config set registry https://registry.npmmirror.com
npm install
```

Proceed? (yes/no)
```

---

### Issue 2: TypeScript Build Fails

**Symptoms:**
```
error TS2300: Duplicate identifier
error TS2307: Cannot find module
Found X errors. Same as before.
```

**Diagnosis:**
```bash
# Check TypeScript version
npx tsc --version

# Try build with verbose output
npm run build --verbose
```

**Solutions:**

**A. Missing Dependencies**
```
🔧 FIX: Missing TypeScript dependencies!

Action:
1. Install dev dependencies
2. Rebuild

Commands:
```bash
npm install typescript ts-node @types/node --save-dev
npm run build
```

Proceed? (yes/no)
```

**B. TypeScript Version Mismatch**
```
🔧 FIX: TypeScript version issue!

Action:
1. Update TypeScript to latest
2. Rebuild

Commands:
```bash
npm install typescript@latest --save-dev
npm run build
```

Proceed? (yes/no)
```

**C. Syntax Errors in Code**
```
🔧 FIX: Syntax errors detected!

Error location: [FILE:LINE]
Error message: [MESSAGE]

Action:
1. Open file: [FILE]
2. Go to line: [LINE]
3. Fix syntax error
4. Rebuild

Need help fixing? Paste the code and I'll help!
```

---

### Issue 3: Bot Token Invalid

**Symptoms:**
```
❌ TELEGRAM_BOT_TOKEN is required!
Error: 401 Unauthorized
```

**Diagnosis:**
```bash
# Check .env file exists
ls -la .env

# Check token format
cat .env | grep TELEGRAM_BOT_TOKEN
```

**Solutions:**

**A. Token Not Set**
```
🔧 FIX: Bot token not configured!

Action:
1. Open .env file
2. Add your bot token
3. Save and restart

Commands:
```bash
# Edit .env file
# Add: TELEGRAM_BOT_TOKEN=123456789:ABCdef...

# Or use echo:
echo "TELEGRAM_BOT_TOKEN=YOUR_TOKEN" >> .env
```

Don't have a bot? See [VIBE-CONFIG.md](VIBE-CONFIG.md#step-1-telegram-bot-token)

Proceed? (yes/no)
```

**B. Token Format Invalid**
```
🔧 FIX: Invalid bot token format!

Expected format: 123456789:ABCdefGHIjklMNOpqrsTUVwxyz
Your token: [FIRST_PART]... (appears invalid)

Action:
1. Get token from @BotFather
2. Replace in .env file
3. Restart bot

Get new token:
1. Open Telegram → @BotFather
2. Send: /mybots
3. Select your bot
4. Copy token

Proceed? (yes/no)
```

---

### Issue 4: MCP Server Not Connecting

**Symptoms:**
```
MCP server disconnected
Failed to connect to MCP server
```

**Diagnosis:**
```bash
# Check Qwen Code config
cat ~/.qwen/settings.json

# Check if path exists
ls -la [PROJECT_PATH]/dist/index.js
```

**Solutions:**

**A. Wrong Path in Config**
```
🔧 FIX: Incorrect path in MCP config!

Current config path: [CONFIG_PATH]
Actual project path: [ACTUAL_PATH]

Action:
1. Open ~/.qwen/settings.json
2. Update args path to: [ACTUAL_PATH]/dist/index.js
3. Save and restart Qwen Code

Proceed? (yes/no)
```

**B. dist/index.js Missing**
```
🔧 FIX: Build output missing!

Expected: [PROJECT_PATH]/dist/index.js
Status: Not found

Action:
1. Rebuild TypeScript
2. Verify dist folder exists

Commands:
```bash
npm run build
ls -la dist/
```

Proceed? (yes/no)
```

**C. Config JSON Invalid**
```
🔧 FIX: Invalid JSON in config!

Error: [JSON_PARSE_ERROR]

Action:
1. Backup config
2. Fix JSON syntax
3. Validate JSON

Commands:
```bash
cp ~/.qwen/settings.json ~/.qwen/settings.json.backup
# Edit and fix JSON
```

Need help fixing JSON? Paste the config and I'll validate it!
```

---

### Issue 5: Bot Not Responding

**Symptoms:**
```
Bot doesn't respond to messages
Bot offline
```

**Diagnosis:**
```bash
# Check if bot is running
# Check logs for errors
tail -f [WORKSPACE_PATH]/temp/telegram-bot.log

# Test bot token
curl "https://api.telegram.org/bot[TOKEN]/getMe"
```

**Solutions:**

**A. Bot Not Started**
```
🔧 FIX: Bot not running!

Action:
1. Restart Qwen Code
2. Check if MCP server loads
3. Send /start to bot

Commands:
```bash
# Restart Qwen Code
qwen

# Or if running:
# Close and reopen
```

Proceed? (yes/no)
```

**B. Privacy Mode Enabled**
```
🔧 FIX: Telegram privacy mode blocking bot!

Issue: Bot can't read group messages
Solution: Disable privacy mode

Action:
1. Open Telegram → @BotFather
2. Send: /setprivacy
3. Select your bot
4. Choose: "Disable privacy"

Test: Send message in group with @bot_name

Proceed? (yes/no)
```

**C. Session Corrupted**
```
🔧 FIX: Session data corrupted!

Action:
1. Clear session data
2. Restart bot
3. Re-pair if needed

Commands:
```bash
# Backup sessions
cp -r [WORKSPACE_PATH]/temp/telegram-sessions/ ./session-backup/

# Clear sessions
rm -rf [WORKSPACE_PATH]/temp/telegram-sessions/*

# Restart bot
```

⚠️ This will delete all user sessions!

Proceed? (yes/no)
```

---

### Issue 6: Pairing Code Not Working

**Symptoms:**
```
Invalid pairing code
Code expired
```

**Diagnosis:**
```bash
# Check allowlist file
cat [WORKSPACE_PATH]/temp/telegram-sessions/allowlist.json

# Check code format
# Should be: 6 uppercase alphanumeric
```

**Solutions:**

**A. Code Expired**
```
🔧 FIX: Pairing code expired!

Codes are valid for 15 minutes only.

Action:
1. Generate new code
2. Use immediately

Generate code:
```
generate_telegram_pairing_code
```

Then tell user:
"Your new pairing code is: [CODE]
Valid for 15 minutes. Use: /pair [CODE]"

Proceed? (yes/no)
```

**B. User Not in Allowlist**
```
🔧 FIX: User not paired!

Action:
1. Generate pairing code
2. User runs: /pair [CODE]
3. Verify pairing success

Check allowlist:
```bash
cat [WORKSPACE_PATH]/temp/telegram-sessions/allowlist.json
```

Proceed? (yes/no)
```

---

### Issue 7: File Not Found Errors

**Symptoms:**
```
ENOENT: no such file or directory
Cannot find module
```

**Diagnosis:**
```bash
# Check which file is missing
# Check current directory
pwd

# Check file exists
ls -la [FILE_PATH]
```

**Solutions:**

**A. Wrong Working Directory**
```
🔧 FIX: Wrong working directory!

Expected: [PROJECT_PATH]
Current: [CURRENT_PATH]

Action:
1. Change to project directory
2. Restart

Commands:
```bash
cd [PROJECT_PATH]
npm run build
```

Proceed? (yes/no)
```

**B. File Actually Missing**
```
🔧 FIX: Required file missing!

Missing file: [FILE_PATH]

Action:
1. Check if file was deleted
2. Restore from git
3. Recreate if needed

Commands:
```bash
# Restore from git
git checkout [FILE_PATH]

# Or recreate
# [Provide file content]
```

Proceed? (yes/no)
```

---

## 🧪 Verification Steps

After applying fix:

```
✅ Let's verify the fix!

1. Restart the bot:
   - Close Qwen Code
   - Reopen Qwen Code

2. Test basic functionality:
   - Send /start to bot
   - Expected: Welcome message

3. Check logs:
   - No new errors
   - Bot responding logged

4. Test your original action:
   - [Original user action]

Did it work? (yes/no)
```

---

## 📊 Error Pattern Recognition

### Quick Reference

| Error Pattern | Likely Cause | Solution |
|--------------|--------------|----------|
| `Cannot find module` | Missing dependency | `npm install` |
| `Duplicate identifier` | TypeScript error | Check imports |
| `401 Unauthorized` | Invalid token | Get new token |
| `ENOENT` | File not found | Check path |
| `ECONNREFUSED` | Connection refused | Check server |
| `SyntaxError` | Code error | Fix syntax |
| `TypeError` | Wrong type | Check types |

---

## 🆘 Still Having Issues?

### Escalation Steps

```
🔍 Advanced troubleshooting needed!

Please provide:
1. Full error output
2. Log file (last 100 lines)
3. Your OS and versions:
   - Node.js: [VERSION]
   - npm: [VERSION]
   - OS: [OS]
4. What you've tried already

Commands to gather info:
```bash
node --version
npm --version
uname -a  # or ver on Windows
tail -n 100 [WORKSPACE_PATH]/temp/telegram-bot.log
```

Paste all output here and I'll analyze!
```

---

## 📝 Repair Checklist

After fixing:

- [ ] Error identified and understood
- [ ] Root cause diagnosed
- [ ] Solution applied
- [ ] Fix verified
- [ ] User confirmed working
- [ ] Logs clean (no new errors)
- [ ] Documentation updated (if new issue)

---

## 🎯 Pro Tips

**For LLM Agents:**

1. **Always check logs first** - 90% of issues are in logs
2. **Verify environment** - Node version, paths, permissions
3. **Test incrementally** - One fix at a time
4. **Document new issues** - Add to this guide
5. **Ask for full error output** - Don't guess!

---

*Last updated: 2026-03-26*  
*Version: 1.0.0*

**Remember:** Every error is a learning opportunity! Add new issues to this guide.
