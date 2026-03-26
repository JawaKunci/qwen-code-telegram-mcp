# 🚀 VIBE INSTALLATION GUIDE

**For:** Qwen Code-Telegram MCP Server  
**Target:** LLM Agents (Qwen Code, Claude Code, etc.)  
**Purpose:** Automated installation and setup

---

## 📋 Overview

This guide is designed for **LLM agents** to automatically install and configure the Telegram MCP Server for their users. Follow these steps sequentially.

---

## 🔍 Pre-Installation Checks

### 1. Verify Environment

```bash
# Check Node.js version (required: 18.x or higher)
node --version

# Check npm version
npm --version

# Check if git is available
git --version
```

**Expected Output:**
- Node.js: `v18.x.x` or higher
- npm: `9.x.x` or higher
- git: `git version 2.x.x`

**If any missing:**
- Node.js: Install from https://nodejs.org/
- git: Install from https://git-scm.com/

---

## 📦 Installation Steps

### Step 1: Clone Repository

```bash
# Navigate to user's preferred directory
cd [USER_WORKSPACE_PATH]

# Clone the repository
git clone https://github.com/[USERNAME]/qwen-code-telegram-mcp.git

# Enter project directory
cd qwen-code-telegram-mcp
```

**Confirmation:**
- ✅ Repository cloned successfully
- ✅ Inside project directory

---

### Step 2: Install Dependencies

```bash
# Install all npm dependencies
npm install
```

**Expected Output:**
```
added [X] packages in [X]s
```

**Troubleshooting:**
- If `npm install` fails → See [VIBE-REPAIR.md](VIBE-REPAIR.md#npm-install-fails)
- If peer dependencies warning → Safe to ignore

---

### Step 3: Build TypeScript

```bash
# Compile TypeScript to JavaScript
npm run build
```

**Expected Output:**
```
Found 0 errors. Same as before.
```

**Confirmation:**
- ✅ `dist/` folder created
- ✅ `dist/index.js` exists

**Troubleshooting:**
- If build fails → See [VIBE-REPAIR.md](VIBE-REPAIR.md#typescript-build-fails)

---

### Step 4: Setup Environment Variables

```bash
# Copy example environment file
cp .env.example .env
```

**Confirmation:**
- ✅ `.env` file created

**Next Step:**
- Verify Installation

---

### Step 5: Verify Installation

```bash
# Check if all required files exist
ls -la

# Expected files:
# - package.json ✅
# - tsconfig.json ✅
# - .env ✅
# - .env.example ✅
# - dist/index.js ✅
# - src/index.ts ✅
```

---

## ✅ Installation Complete!

**Status:** Repository installed and built successfully

**Next Steps:**
1. ⚙️ **Configuration** → Read [VIBE-CONFIG.md](VIBE-CONFIG.md) (MANDATORY AFTER INSTALL)
2. 🐛 **Troubleshooting** → Read [VIBE-REPAIR.md](VIBE-REPAIR.md)
3. 📖 **Documentation** → Read [DOCUMENTATION.md](DOCUMENTATION.md)

---

## 📝 Installation Checklist

- [ ] Node.js 18.x+ installed
- [ ] npm 9.x+ installed
- [ ] git installed
- [ ] Repository cloned
- [ ] Dependencies installed (`npm install`)
- [ ] TypeScript built (`npm run build`)
- [ ] Environment file created (`.env`)
- [ ] All required files verified

---

## 🆘 Need Help?

If installation fails at any step:

1. **Check error message** in terminal
2. **Read [VIBE-REPAIR.md](VIBE-REPAIR.md)** for common issues
3. **Ask user** to provide error output for analysis
4. **Search issues** on GitHub repository

---

*Last updated: 2026-03-26*  
*Version: 1.0.0*
