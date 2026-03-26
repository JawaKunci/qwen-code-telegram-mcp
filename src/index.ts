/**
 * Telegram MCP Server v2.2.0
 *
 * Bridge between Telegram Bot API and Qwen Code via MCP protocol.
 * Allows chatting with Qwen Code through Telegram.
 *
 * Features:
 * - File-based session storage (persistent across restarts)
 * - Dynamic workspace configuration
 * - Allowlist/pairing system for security
 * - Typing indicators and streaming output
 * - Admin commands for session management
 * - Auto-cleanup for maintenance
 * - Group chat support with mention-based triggering (v2.2.0)
 * - Quoted message context awareness (v2.2.0)
 *
 * @version 2.2.0
 * @author Venom
 */

import TelegramBot from 'node-telegram-bot-api';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { exec, spawn } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';

const execAsync = promisify(exec);

// Load environment variables
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const WORKSPACE_PATH = process.env.WORKSPACE_PATH || process.cwd();

if (!TELEGRAM_BOT_TOKEN) {
  console.error('❌ TELEGRAM_BOT_TOKEN is required!');
  console.error('Please set it in your .env file or environment variables.');
  process.exit(1);
}

console.log(`📁 Workspace: ${WORKSPACE_PATH}`);

// ============================================================================
// FILE LOGGER (for interactive mode debugging)
// ============================================================================

const LOG_FILE = path.join(WORKSPACE_PATH, 'temp', 'telegram-bot.log');

// Ensure log directory exists
const logDir = path.dirname(LOG_FILE);
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

// Clear log file on startup
fs.writeFileSync(LOG_FILE, `=== Telegram Bot Log Started: ${new Date().toISOString()} ===\n`);

function logToFile(message: string) {
  const timestamp = new Date().toISOString();
  const logLine = `[${timestamp}] ${message}\n`;
  fs.appendFileSync(LOG_FILE, logLine);
  // Don't call console.log here - it will cause infinite recursion!
  // The console.log override will call us, we don't need to call it back
}

// Override console.log to also write to file
const originalConsoleLog = console.log;
console.log = (...args) => {
  // Write to file first
  const message = args.join(' ');
  const timestamp = new Date().toISOString();
  const logLine = `[${timestamp}] ${message}\n`;
  fs.appendFileSync(LOG_FILE, logLine);
  // Then call original console.log
  originalConsoleLog(...args);
};

const originalConsoleError = console.error;
console.error = (...args) => {
  const message = `ERROR: ${args.join(' ')}`;
  const timestamp = new Date().toISOString();
  const logLine = `[${timestamp}] ${message}\n`;
  fs.appendFileSync(LOG_FILE, logLine);
  originalConsoleError(...args);
};

// ============================================================================
// Bot Info Cache (for group mention detection)
// ============================================================================

let BOT_USERNAME: string | null = null;
let BOT_ID: number | null = null;
let BOT_INFO_READY = false;

// NOTE: fetchBotInfo() will be called AFTER bot is initialized (see below)
async function fetchBotInfo(botInstance: any): Promise<void> {
  try {
    const me = await botInstance.getMe();
    BOT_USERNAME = me.username || null;
    BOT_ID = me.id;
    BOT_INFO_READY = true;
    logToFile(`🤖 Bot initialized: @${BOT_USERNAME} (ID: ${BOT_ID})`);
  } catch (error: any) {
    logToFile(`❌ Failed to fetch bot info: ${error.message}`);
    // Set a fallback username from env var if available
    const fallbackUsername = process.env.TELEGRAM_BOT_USERNAME;
    if (fallbackUsername) {
      BOT_USERNAME = fallbackUsername;
      BOT_INFO_READY = true;
      logToFile(`🤖 Using fallback username: @${BOT_USERNAME}`);
    }
  }
}

// ============================================================================
// Global State Tracking (Metrics & Approval Mode)
// ============================================================================

interface ServerMetrics {
  totalRequests: number;
  totalErrors: number;
  tokens: {
    total: number;
    prompt: number;
    cached: number;
    thoughts: number;
    output: number;
  };
  startTime: number;
}

interface ApprovalModeState {
  mode: 'plan' | 'auto-accept' | 'yolo';
  setBy?: string;
  setAt?: number;
}

// Global metrics (in-memory, reset on restart)
const serverMetrics: ServerMetrics = {
  totalRequests: 0,
  totalErrors: 0,
  tokens: {
    total: 0,
    prompt: 0,
    cached: 0,
    thoughts: 0,
    output: 0
  },
  startTime: Date.now()
};

// Approval mode per chat (persistent via JSON)
const approvalModePath = path.join(WORKSPACE_PATH, 'temp', 'telegram-sessions', 'approval-modes.json');

function loadApprovalModes(): Map<string, ApprovalModeState> {
  try {
    if (fs.existsSync(approvalModePath)) {
      const data = JSON.parse(fs.readFileSync(approvalModePath, 'utf-8'));
      return new Map(Object.entries(data));
    }
  } catch (error: any) {
    console.error('❌ Error loading approval modes:', error.message);
  }
  return new Map();
}

function saveApprovalModes(modes: Map<string, ApprovalModeState>) {
  try {
    const obj = Object.fromEntries(modes);
    fs.writeFileSync(approvalModePath, JSON.stringify(obj, null, 2), 'utf-8');
  } catch (error: any) {
    console.error('❌ Error saving approval modes:', error.message);
  }
}

function getApprovalMode(chatId: string): ApprovalModeState {
  const modes = loadApprovalModes();
  return modes.get(chatId) || { mode: 'plan' }; // Default to 'plan'
}

function setApprovalMode(chatId: string, mode: 'plan' | 'auto-accept' | 'yolo', setBy?: string) {
  const modes = loadApprovalModes();
  modes.set(chatId, {
    mode,
    setBy,
    setAt: Date.now()
  });
  saveApprovalModes(modes);
  console.log(`📋 Approval mode for ${chatId}: ${mode}`);
}

// ============================================================================
// PHASE 0: SessionManager (File-Based JSON Storage)
// ============================================================================

interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

interface Session {
  chatId: string;
  messages: Message[];
  lastActive: number;
}

// ============================================================================
// Pending Confirmation Management
// ============================================================================

interface PendingConfirmation {
  chatId: string;
  prompt: string;
  qwenProcess: any;
  createdAt: number;
  expiresAt: number;
}

class ConfirmationManager {
  private pending = new Map<string, PendingConfirmation>();
  private readonly EXPIRY_MS = 5 * 60 * 1000; // 5 minutes

  addPending(chatId: string, prompt: string, qwenProcess: any): void {
    this.pending.set(chatId, {
      chatId,
      prompt,
      qwenProcess,
      createdAt: Date.now(),
      expiresAt: Date.now() + this.EXPIRY_MS
    });
  }

  hasPendingConfirmation(chatId: string): boolean {
    const pending = this.pending.get(chatId);
    if (!pending) return false;

    // Check expiry
    if (Date.now() > pending.expiresAt) {
      this.pending.delete(chatId);
      return false;
    }

    return true;
  }

  getConfirmation(chatId: string): PendingConfirmation | undefined {
    return this.pending.get(chatId);
  }

  removePending(chatId: string): void {
    this.pending.delete(chatId);
  }

  cleanup(): void {
    const now = Date.now();
    for (const [chatId, confirmation] of this.pending.entries()) {
      if (now > confirmation.expiresAt) {
        this.pending.delete(chatId);
        console.log(`🗑️ Cleaned up expired confirmation for ${chatId}`);
      }
    }
  }
}

const confirmationManager = new ConfirmationManager();

// ============================================================================
// Group Chat Utilities (v2.2.0)
// ============================================================================

/**
 * Check if message is from a group/supergroup/channel
 */
function isGroupChat(msg: any): boolean {
  return msg.chat.type === 'group' || msg.chat.type === 'supergroup' || msg.chat.type === 'channel';
}

/**
 * Check if bot is mentioned in the message
 * Handles: @bot_username, @BotUsername (case insensitive)
 */
function isBotMentioned(text: string, botUsername: string | null): boolean {
  if (!botUsername) return false;
  
  // Case-insensitive mention check
  const mentionRegex = new RegExp(`@${botUsername}`, 'i');
  return mentionRegex.test(text);
}

/**
 * Remove bot mentions from message text for cleaner processing
 * Example: "Hello @bot_name how are you?" → "Hello how are you?"
 */
function removeBotMentions(text: string, botUsername: string | null): string {
  if (!botUsername) return text;
  
  const mentionRegex = new RegExp(`@${botUsername}`, 'gi');
  return text.replace(mentionRegex, '').trim();
}

/**
 * Extract quoted/replied message content from Telegram message
 * Returns null if no reply or reply content unavailable
 */
function getQuotedMessageContent(msg: any): { text: string; from?: string } | null {
  // Check if this message is a reply to another message
  if (msg.reply_to_message) {
    const replyMsg = msg.reply_to_message;
    const replyText = replyMsg.text || replyMsg.caption || '';
    const replyFrom = replyMsg.from?.username || replyMsg.from?.first_name || 'Unknown';
    
    if (replyText) {
      return {
        text: replyText,
        from: replyFrom
      };
    }
  }
  
  return null;
}

/**
 * Check if bot was mentioned in a quoted/replied message
 * This allows context-aware conversations in groups
 */
function wasBotMentionedInQuote(quotedContent: { text: string; from?: string } | null, botUsername: string | null): boolean {
  if (!quotedContent || !botUsername) return false;
  
  const mentionRegex = new RegExp(`@${botUsername}`, 'i');
  return mentionRegex.test(quotedContent.text);
}

/**
 * Validate if bot should respond in a group chat
 * Rules:
 * 1. Must be mentioned (@bot_username)
 * 2. OR replying to bot's previous message with mention
 * 3. Ignore all other group messages silently
 */
function shouldBotRespondInGroup(msg: any, botUsername: string | null): { should: boolean; reason: string; cleanedText?: string } {
  const text = msg.text || msg.caption || '';
  const chatType = msg.chat.type;

  console.log(`🔍 shouldBotRespondInGroup called:`);
  console.log(`   chatType: ${chatType}`);
  console.log(`   botUsername: ${botUsername}`);
  console.log(`   text: ${text.substring(0, 50)}...`);

  // Always respond in private chats
  if (chatType === 'private') {
    console.log(`   → Decision: private_chat (respond)`);
    return { should: true, reason: 'private_chat' };
  }

  // Safety check: if bot username not ready yet, don't respond in groups
  if (!botUsername) {
    console.log(`   → Decision: bot_username_not_ready (ignore)`);
    return { should: false, reason: 'bot_username_not_ready' };
  }

  // Check for direct mention
  const isMentioned = isBotMentioned(text, botUsername);
  console.log(`   isMentioned: ${isMentioned}`);

  // Check for quoted message
  const quotedContent = getQuotedMessageContent(msg);
  console.log(`   quotedContent:`, quotedContent);
  
  const mentionedInQuote = wasBotMentionedInQuote(quotedContent, botUsername);
  console.log(`   mentionedInQuote: ${mentionedInQuote}`);

  // Decision logic
  if (isMentioned) {
    const cleanedText = removeBotMentions(text, botUsername);
    console.log(`   → Decision: direct_mention (respond)`);
    return {
      should: true,
      reason: 'direct_mention',
      cleanedText: quotedContent
        ? `${quotedContent.from}: "${quotedContent.text}"\n\nUser: ${cleanedText}`
        : cleanedText
    };
  }

  if (quotedContent && mentionedInQuote) {
    console.log(`   → Decision: mention_in_quote (respond)`);
    return {
      should: true,
      reason: 'mention_in_quote',
      cleanedText: `${quotedContent.from}: "${quotedContent.text}"\n\nUser: ${text}`
    };
  }

  // Bot not mentioned, ignore silently
  console.log(`   → Decision: no_mention (ignore)`);
  return { should: false, reason: 'no_mention' };
}

class SessionManager {
  private sessionsDir: string;
  private readonly MAX_MESSAGES = 50;

  constructor(workspacePath: string = process.cwd()) {
    this.sessionsDir = path.join(workspacePath, 'temp', 'telegram-sessions');
    this.ensureDir();
  }

  private ensureDir() {
    if (!fs.existsSync(this.sessionsDir)) {
      fs.mkdirSync(this.sessionsDir, { recursive: true });
      console.log(`📁 Created sessions directory: ${this.sessionsDir}`);
    }
  }

  getSessionPath(chatId: string): string {
    return path.join(this.sessionsDir, `${chatId}.json`);
  }

  loadSession(chatId: string): Message[] {
    const sessionPath = this.getSessionPath(chatId);
    if (!fs.existsSync(sessionPath)) {
      return [];
    }
    try {
      const data = fs.readFileSync(sessionPath, 'utf-8');
      const session = JSON.parse(data);
      return session.messages || [];
    } catch (error: any) {
      console.error(`Failed to load session ${chatId}:`, error.message);
      return [];
    }
  }

  async saveSession(chatId: string, messages: Message[]): Promise<void> {
    const sessionPath = this.getSessionPath(chatId);
    const session: Session = {
      chatId,
      messages,
      lastActive: Date.now()
    };
    await fs.promises.writeFile(sessionPath, JSON.stringify(session, null, 2), 'utf-8');
  }

  deleteSession(chatId: string): boolean {
    const sessionPath = this.getSessionPath(chatId);
    if (fs.existsSync(sessionPath)) {
      fs.unlinkSync(sessionPath);
      console.log(`🧹 Deleted session: ${chatId}`);
      return true;
    }
    return false;
  }

  listSessions(): string[] {
    if (!fs.existsSync(this.sessionsDir)) {
      return [];
    }
    return fs.readdirSync(this.sessionsDir)
      .filter(f => f.endsWith('.json'))
      .map(f => f.replace('.json', ''));
  }

  async cleanupInactive(days: number = 7): Promise<number> {
    const sessions = this.listSessions();
    const threshold = Date.now() - (days * 24 * 60 * 60 * 1000);
    let cleaned = 0;

    for (const chatId of sessions) {
      const sessionPath = this.getSessionPath(chatId);
      try {
        const data = fs.readFileSync(sessionPath, 'utf-8');
        const session = JSON.parse(data);
        if (session.lastActive < threshold) {
          fs.unlinkSync(sessionPath);
          cleaned++;
          console.log(`🧹 Cleaned inactive session: ${chatId}`);
        }
      } catch (error: any) {
        console.error(`Failed to process session ${chatId}:`, error.message);
      }
    }

    return cleaned;
  }
}

// ============================================================================
// PHASE 2: AllowlistManager (Pairing System)
// ============================================================================

interface AllowlistData {
  allowed: AllowedUser[];
  pending: PendingPairing[];
}

interface AllowedUser {
  chatId: string;
  username?: string;
  firstName?: string;
  pairedAt: string;
}

interface PendingPairing {
  code: string;
  chatId: string;
  expiresAt: string;
}

class AllowlistManager {
  private allowlistPath: string;

  constructor(workspacePath: string) {
    this.allowlistPath = path.join(workspacePath, 'temp', 'telegram-sessions', 'allowlist.json');
    this.ensureFile();
  }

  private ensureFile() {
    const dir = path.dirname(this.allowlistPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    if (!fs.existsSync(this.allowlistPath)) {
      fs.writeFileSync(this.allowlistPath, JSON.stringify({
        allowed: [],
        pending: []
      }, null, 2), 'utf-8');
      console.log(`📄 Created allowlist file: ${this.allowlistPath}`);
    }
  }

  private read(): AllowlistData {
    const data = fs.readFileSync(this.allowlistPath, 'utf-8');
    return JSON.parse(data);
  }

  private write(data: AllowlistData) {
    fs.writeFileSync(this.allowlistPath, JSON.stringify(data, null, 2), 'utf-8');
  }

  isAllowed(chatId: string): boolean {
    const data = this.read();
    return data.allowed.some(u => u.chatId === chatId);
  }

  addAllowed(chatId: string, username?: string, firstName?: string) {
    const data = this.read();
    if (!data.allowed.some(u => u.chatId === chatId)) {
      data.allowed.push({
        chatId,
        username,
        firstName,
        pairedAt: new Date().toISOString()
      });
      this.write(data);
      console.log(`✅ Added to allowlist: ${chatId} (${username || firstName})`);
    }
  }

  removeAllowed(chatId: string) {
    const data = this.read();
    const before = data.allowed.length;
    data.allowed = data.allowed.filter(u => u.chatId !== chatId);
    this.write(data);
    if (data.allowed.length < before) {
      console.log(`❌ Removed from allowlist: ${chatId}`);
    }
  }

  generatePairingCode(chatId: string): string {
    const code = Math.random().toString(36).substring(2, 8).toUpperCase();
    const data = this.read();
    data.pending.push({
      code,
      chatId,
      expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString()
    });
    this.write(data);
    console.log(`🔑 Generated pairing code ${code} for ${chatId}`);
    return code;
  }

  verifyPairingCode(code: string): string | null {
    const data = this.read();
    const pending = data.pending.find(p =>
      p.code === code.toUpperCase() &&
      new Date(p.expiresAt) > new Date()
    );

    if (pending) {
      // Remove from pending
      data.pending = data.pending.filter(p => p.code !== code.toUpperCase());
      
      // Add to allowed (check if not already there)
      if (!data.allowed.some(u => u.chatId === pending.chatId)) {
        data.allowed.push({
          chatId: pending.chatId,
          pairedAt: new Date().toISOString()
        });
      }
      
      // Write once with both changes
      this.write(data);
      
      console.log(`✅ Pairing verified: ${pending.chatId} (removed from pending, added to allowed)`);
      return pending.chatId;
    }
    
    console.log(`❌ Pairing code invalid or expired: ${code}`);
    return null;
  }

  cleanupExpired(): number {
    const data = this.read();
    const now = new Date();
    const before = data.pending.length;
    data.pending = data.pending.filter(p => new Date(p.expiresAt) > now);
    this.write(data);
    const cleaned = before - data.pending.length;
    if (cleaned > 0) {
      console.log(`🧹 Cleaned ${cleaned} expired pairing codes`);
    }
    return cleaned;
  }

  getAllowed(): AllowedUser[] {
    return this.read().allowed;
  }

  getPending(): PendingPairing[] {
    return this.read().pending;
  }
}

// Initialize managers with workspace path
const sessionManager = new SessionManager(WORKSPACE_PATH);
const allowlistManager = new AllowlistManager(WORKSPACE_PATH);

// ============================================================================
// PHASE 1: Dynamic Workspace (QwenClient)
// ============================================================================

class QwenClient {
  private workspacePath: string;
  private readonly MAX_CONTEXT_MESSAGES = 10;
  private readonly MAX_CONTEXT_CHARS = 8000; // Limit context to ~8k chars

  constructor(workspacePath: string) {
    this.workspacePath = workspacePath;
  }

  /**
   * Chat with Qwen Code - non-interactive mode (for simple queries)
   * Uses stdin to pass prompt (avoids Windows command line length limit of ~8k chars)
   */
  async chat(message: string, context: Message[] = [], chatId?: string): Promise<string> {
    return new Promise((resolve, reject) => {
      try {
        // Build prompt with conversation history
        let prompt = '';
        let contextSize = 0;

        if (context.length > 0) {
          // Include conversation context as system instruction
          prompt = 'You are having a conversation via Telegram. Run your Session Startup sequence - read QWEN.md before responding to the user. Then greet the user - USER.md - in your SOUL.MD configured persona. Be yourself - use your defined voice, mannerisms, and mood. Keep it to 1-3 sentences and ask what they want to do. Do not mention internal steps, files, tools, or reasoning for greetings. ';

          // Include chat ID for file operations
          if (chatId) {
            prompt += `\n\n**IMPORTANT: Your Current Chat ID is: ${chatId}**\n`;
            prompt += `When using Telegram tools (send_telegram_file, send_telegram_message), use this chatId: "${chatId}"\n\n`;
          }

          prompt += 'Here is the conversation history:\n';

          // Take last N messages AND respect char limit
          let messagesToInclude: Message[] = [];
          for (let i = context.length - 1; i >= 0; i--) {
            if (messagesToInclude.length >= this.MAX_CONTEXT_MESSAGES) break;

            const msgSize = context[i].content.length;
            if (contextSize + msgSize > this.MAX_CONTEXT_CHARS) break;

            messagesToInclude.unshift(context[i]);
            contextSize += msgSize;
          }

          messagesToInclude.forEach((m) => {
            const speaker = m.role === 'user' ? 'User' : 'Assistant';
            prompt += `${speaker}: ${m.content}\n`;
          });

          prompt += '\nNow respond to this latest message:\n';
          prompt += `User: ${message}\n\nAssistant:`;
        } else {
          // No context, just the message
          prompt = message;
        }

        // Spawn Qwen CLI process and write prompt via stdin (avoids command line limit)
        const qwenProcess = spawn('qwen', ['-p'], {
          cwd: this.workspacePath,
          env: { ...process.env },
          shell: true
        });

        let stdout = '';
        let stderr = '';

        qwenProcess.stdout.on('data', (data: Buffer) => {
          stdout += data.toString();
        });

        qwenProcess.stderr.on('data', (data: Buffer) => {
          stderr += data.toString();
        });

        qwenProcess.on('close', (code) => {
          if (code === 0 || stdout.trim()) {
            resolve(stdout.trim());
          } else {
            const errorMsg = stderr || `Process exited with code ${code}`;
            console.error('❌ Qwen Code error:', errorMsg);
            resolve(`Sorry, I encountered an error processing your message: ${errorMsg}`);
          }
        });

        qwenProcess.on('error', (err: any) => {
          console.error('❌ Qwen process error:', err.message);
          resolve(`Sorry, I encountered an error processing your message: ${err.message}`);
        });

        // Write prompt to stdin
        qwenProcess.stdin.write(prompt);
        qwenProcess.stdin.end();

        // Timeout after 5 minutes
        setTimeout(() => {
          if (!stdout.trim()) {
            qwenProcess.kill();
            resolve(`Sorry, I encountered an error: Qwen CLI timeout after 5 minutes`);
          }
        }, 5 * 60 * 1000);

      } catch (error: any) {
        console.error('❌ Qwen Code error:', error.message);
        resolve(`Sorry, I encountered an error processing your message: ${error.message}`);
      }
    });
  }

  /**
   * Chat with Qwen Code - interactive mode (for tasks requiring confirmations)
   * Uses stdin to pass prompt (avoids Windows command line length limit)
   * Returns the qwenProcess so confirmations can be handled via stdin
   */
  async chatInteractive(
    message: string,
    chatId: string,
    context: Message[] = []
  ): Promise<{ output: string; process?: any }> {
    return new Promise(async (resolve, reject) => {
      try {
        // Build prompt same as non-interactive
        let prompt = '';
        let contextSize = 0;

        if (context.length > 0) {
          // Enhanced system prompt with QWEN.md, USER.md, SOUL.md references
          prompt = 'You are having a conversation via Telegram. Run your Session Startup sequence - read QWEN.md before responding to the user. Then greet the user - USER.md - in your SOUL.MD configured persona. Be yourself - use your defined voice, mannerisms, and mood. Keep it to 1-3 sentences and ask what they want to do. Do not mention internal steps, files, tools, or reasoning for greetings. ';
          prompt += 'Here is the conversation history:\n';

          let messagesToInclude: Message[] = [];
          for (let i = context.length - 1; i >= 0; i--) {
            if (messagesToInclude.length >= this.MAX_CONTEXT_MESSAGES) break;

            const msgSize = context[i].content.length;
            if (contextSize + msgSize > this.MAX_CONTEXT_CHARS) break;

            messagesToInclude.unshift(context[i]);
            contextSize += msgSize;
          }

          messagesToInclude.forEach((m) => {
            const speaker = m.role === 'user' ? 'User' : 'Assistant';
            prompt += `${speaker}: ${m.content}\n`;
          });

          prompt += '\nNow respond to this latest message:\n';
          prompt += `User: ${message}\n\nAssistant:`;
        } else {
          prompt = message;
        }

        // Spawn Qwen CLI process with -p flag (will read prompt from stdin)
        const qwenProcess = spawn('qwen', ['-p'], {
          cwd: this.workspacePath,
          env: { ...process.env },
          shell: true
        });

        let stdout = '';
        let stderr = '';
        let outputBuffer = '';
        let confirmationSent = false;

        // Regex patterns for confirmation prompts
        const confirmationPatterns = [
          /\?\s+(Are you sure|Do you want|Proceed|Confirm|Continue|Delete|Remove|Overwrite)/i,
          /\(y\/n\)|\[yes\/no\]|yes\/no/i,
          /Type 'yes' to confirm|Enter yes to proceed/i,
          /Would you like to|Do you agree/i
        ];

        const isConfirmationPrompt = (text: string): boolean => {
          return confirmationPatterns.some(pattern => pattern.test(text));
        };

        qwenProcess.stdout.on('data', (data: Buffer) => {
          const chunk = data.toString();
          outputBuffer += chunk;
          stdout += chunk;

          // Check if this is a confirmation prompt
          if (!confirmationSent && isConfirmationPrompt(outputBuffer)) {
            confirmationSent = true;

            // Extract the prompt message
            const promptLines = outputBuffer.split('\n').filter(l => l.trim());
            const confirmationText = promptLines[promptLines.length - 1] || 'Confirmation required';

            // Store the process and notify Telegram
            confirmationManager.addPending(chatId, confirmationText, qwenProcess);

            // Send notification to Telegram (will be handled by main bot code)
            console.log(`⚠️ Confirmation needed for ${chatId}: ${confirmationText}`);
          }
        });

        qwenProcess.stderr.on('data', (data: Buffer) => {
          stderr += data.toString();
        });

        qwenProcess.on('close', (code) => {
          confirmationManager.removePending(chatId);
          if (code === 0 || stdout.trim()) {
            resolve({ output: stdout.trim(), process: undefined });
          } else {
            reject(new Error(stderr || `Process exited with code ${code}`));
          }
        });

        qwenProcess.on('error', (err) => {
          confirmationManager.removePending(chatId);
          reject(err);
        });

        // Write prompt to stdin (avoids command line length limit)
        qwenProcess.stdin.write(prompt);
        qwenProcess.stdin.end();

        // Timeout after 5 minutes
        setTimeout(() => {
          if (!stdout.trim()) {
            qwenProcess.kill();
            reject(new Error('Qwen CLI timeout after 5 minutes'));
          }
        }, 5 * 60 * 1000);

      } catch (error: any) {
        reject(error);
      }
    });
  }
}

const qwenClient = new QwenClient(WORKSPACE_PATH);

// ============================================================================
// Custom CLI Commands Loader
// ============================================================================

interface CliCommand {
  name: string;
  description: string;
  filePath: string;
}

const CUSTOM_COMMANDS_DIR = path.join(WORKSPACE_PATH, '.qwen', 'commands');
const loadedCommands: Map<string, CliCommand> = new Map();

function loadCustomCommands() {
  if (!fs.existsSync(CUSTOM_COMMANDS_DIR)) {
    console.log(`📂 Custom commands directory not found: ${CUSTOM_COMMANDS_DIR}`);
    return;
  }

  const files = fs.readdirSync(CUSTOM_COMMANDS_DIR)
    .filter(f => f.endsWith('.md'));

  console.log(`📂 Found ${files.length} .md files in custom commands directory`);

  for (const file of files) {
    const filePath = path.join(CUSTOM_COMMANDS_DIR, file);
    
    // Skip if already loaded (deduplication)
    const name = file.replace('.md', '');
    if (loadedCommands.has(name)) {
      continue;
    }

    const content = fs.readFileSync(filePath, 'utf-8');

    // Parse frontmatter
    const frontmatterMatch = content.match(/^---\s*\ndescription:\s*(.+)\s*\n---/i);
    if (frontmatterMatch) {
      const description = frontmatterMatch[1].trim();

      loadedCommands.set(name, {
        name,
        description,
        filePath
      });

      console.log(`📜 Loaded custom command: ${name} - ${description}`);
    }
  }

  console.log(`✅ Loaded ${loadedCommands.size} unique custom commands`);
}

// Load commands on startup
loadCustomCommands();

// ============================================================================
// File Handling Configuration
// ============================================================================

const FILES_DIR = path.join(WORKSPACE_PATH, 'temp', 'telegram-files');
const DOWNLOADS_DIR = path.join(FILES_DIR, 'downloads');
const UPLOADS_DIR = path.join(FILES_DIR, 'uploads');

// Ensure file directories exist
if (!fs.existsSync(FILES_DIR)) {
  fs.mkdirSync(FILES_DIR, { recursive: true });
  console.log(`📁 Created files directory: ${FILES_DIR}`);
}
if (!fs.existsSync(DOWNLOADS_DIR)) {
  fs.mkdirSync(DOWNLOADS_DIR, { recursive: true });
  console.log(`📁 Created downloads directory: ${DOWNLOADS_DIR}`);
}
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  console.log(`📁 Created uploads directory: ${UPLOADS_DIR}`);
}

// ============================================================================
// Initialize Telegram Bot
// ============================================================================

const bot = new TelegramBot(TELEGRAM_BOT_TOKEN, {
  polling: {
    interval: 300,
    params: { timeout: 30 }
  }
});

// NOW fetch bot info AFTER bot is initialized
fetchBotInfo(bot);

// Bot polling status
logToFile(`🚀 Telegram Bot polling started...`);

// Log all bot events for debugging
bot.on('polling_error', (error) => {
  logToFile(`❌ BOT POLLING ERROR: ${error.message}`);
});

bot.on('connected', () => {
  logToFile(`✅ Bot connected to Telegram servers`);
});

bot.on('disconnected', () => {
  logToFile(`⚠️ Bot disconnected from Telegram servers`);
});

// Initialize MCP Server
const server = new McpServer({
  name: 'qwen-code-telegram-mcp',
  version: '2.0.0',
  description: 'Telegram Bot integration for Qwen Code via MCP protocol (v2.0 with persistent sessions)'
});

// Active chats tracking
const activeChats = new Map<string, { username?: string; firstName?: string; lastMessage: number; chatType?: string; chatTitle?: string }>();

// ============================================================================
// PHASE 3: Streaming Output Helper & Message Chunking
// ============================================================================

/**
 * Split long message into chunks that fit Telegram's 4096 char limit
 * Splits at 3900 chars to be safe, always breaks at paragraph/code block boundaries
 */
function splitMessage(text: string, limit: number = 3900): string[] {
  const chunks: string[] = [];
  
  if (text.length <= limit) {
    return [text];
  }

  let remaining = text;

  while (remaining.length > limit) {
    let splitPos = -1;

    // Priority 1: Split at code block boundary (```)\n
    splitPos = remaining.lastIndexOf('```\n', limit);
    if (splitPos !== -1 && splitPos > limit * 0.3) {
      splitPos += 4; // Include the ```\n
      chunks.push(remaining.substring(0, splitPos));
      remaining = remaining.substring(splitPos);
      continue;
    }

    // Priority 2: Split at double newline (paragraph break)
    splitPos = remaining.lastIndexOf('\n\n', limit);
    if (splitPos !== -1 && splitPos > limit * 0.3) {
      splitPos += 2; // Include the \n\n
      chunks.push(remaining.substring(0, splitPos));
      remaining = remaining.substring(splitPos);
      continue;
    }

    // Priority 3: Split at single newline
    splitPos = remaining.lastIndexOf('\n', limit);
    if (splitPos !== -1 && splitPos > limit * 0.3) {
      splitPos += 1; // Include the \n
      chunks.push(remaining.substring(0, splitPos));
      remaining = remaining.substring(splitPos);
      continue;
    }

    // Fallback: Force split at limit (should rarely happen)
    chunks.push(remaining.substring(0, limit));
    remaining = remaining.substring(limit);
  }

  if (remaining.length > 0) {
    chunks.push(remaining);
  }

  return chunks;
}

/**
 * Send message with automatic chunking for long messages
 * No prefix notification, just send chunks sequentially
 */
async function sendChunkedMessage(
  chatId: string,
  text: string,
  options?: any
): Promise<void> {
  const chunks = splitMessage(text);
  
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    
    await bot.sendMessage(chatId, chunk, {
      ...options,
      disable_web_page_preview: true
    });
    
    // Small delay between chunks to avoid rate limits
    if (i < chunks.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 150));
    }
  }
}

/**
 * Stream response with progressive delay to avoid Telegram rate limits
 * Telegram limit: ~30 edits/minute = 2s per edit
 * Strategy: Start fast (500ms), slow down progressively (max 2s)
 */
async function streamResponse(chatId: string, qwenProcess: any): Promise<string> {
  const statusMsg = await bot.sendMessage(chatId, '🤔 Thinking...');
  const messageId = statusMsg.message_id;

  let buffer: string[] = [];
  let lastEdit = Date.now();
  let fullOutput = '';
  let editCount = 0;
  let consecutiveEdits = 0;

  const MIN_LINES = 5;
  const BASE_WAIT = 500; // Start with 500ms
  const MAX_WAIT = 2000; // Cap at 2000ms (safe for 30 edits/min)

  // Progressive delay: increase wait time as edit count increases
  const getProgressiveDelay = (): number => {
    // After 10 edits, slow down significantly
    if (editCount >= 10) return MAX_WAIT;
    // After 5 edits, start slowing down
    if (editCount >= 5) return BASE_WAIT + (editCount - 5) * 200;
    // First 5 edits: fast
    return BASE_WAIT;
  };

  return new Promise<string>((resolve) => {
    qwenProcess.stdout.on('data', (chunk: Buffer) => {
      const lines = chunk.toString().split('\n');
      buffer.push(...lines);
      fullOutput += chunk.toString();

      const now = Date.now();
      const waitTime = getProgressiveDelay();

      // Edit if: enough lines OR enough time passed
      if (buffer.length >= MIN_LINES || (now - lastEdit >= waitTime && buffer.length > 0)) {
        bot.editMessageText(
          fullOutput,
          { chat_id: chatId, message_id: messageId }
        ).then(() => {
          editCount++;
          consecutiveEdits = 0;
        }).catch((err: any) => {
          // Rate limit hit, wait longer
          if (err.code === 429) {
            consecutiveEdits++;
            console.log(`⚠️ Rate limit hit, waiting longer...`);
          }
        });
        buffer = [];
        lastEdit = now;
      }
    });

    qwenProcess.on('close', () => {
      // Final update
      bot.editMessageText(
        fullOutput,
        { chat_id: chatId, message_id: messageId }
      ).catch(() => {});
      resolve(fullOutput);
    });
  });
}

// ============================================================================
// Telegram Bot Event Handlers - FULL FEATURES + GROUP SUPPORT (v2.2.0-fix9)
// ============================================================================

bot.on('message', async (msg) => {
  const chatId = msg.chat.id.toString();
  const chatType = msg.chat.type;
  const chatTitle = msg.chat.title || 'N/A';
  const text = msg.text || msg.caption || '';
  const username = msg.from?.username;
  const firstName = msg.from?.first_name;
  let isGroup = false;

  try {
    logToFile(`📨 MESSAGE: chatId=${chatId}, type=${chatType}, title=${chatTitle}, from=${username || firstName}, text="${text.substring(0, 50)}"`);

    // ✅ FIX: Update active chats tracking (was missing!)
    activeChats.set(chatId, {
      username: username,
      firstName: firstName,
      lastMessage: Date.now(),
      chatType: chatType,
      chatTitle: chatTitle
    });

    // Wait for bot info if not ready
    let waitCount = 0;
    while (!BOT_INFO_READY && waitCount < 100) {
      await new Promise(r => setTimeout(r, 100));
      waitCount++;
    }

    logToFile(`🤖 BOT INFO: username=${BOT_USERNAME}, ready=${BOT_INFO_READY}`);

    // Check if group and mentioned
    isGroup = chatType === 'group' || chatType === 'supergroup';
    const isMentioned = BOT_USERNAME && text.includes(`@${BOT_USERNAME}`);

    logToFile(`📊 CHECK: isGroup=${isGroup}, isMentioned=${isMentioned}`);

    // For groups: only respond if mentioned
    if (isGroup && !isMentioned) {
      logToFile(`🔇 IGNORED: Group message without mention`);
      return;
    }

    // Process text - remove mention for groups
    let processedText = text;
    if (isGroup && BOT_USERNAME) {
      processedText = text.replace(new RegExp(`@${BOT_USERNAME}`, 'gi'), '').trim();
    }

    // Check for quoted/replied message (works in both DM and group)
    let quotedMessage = '';
    if (msg.reply_to_message) {
      const replyMsg = msg.reply_to_message;
      const replyFrom = replyMsg.from?.username || replyMsg.from?.first_name || 'Unknown';
      const replyText = replyMsg.text || replyMsg.caption || '';
      
      if (replyText) {
        quotedMessage = `${replyFrom}: "${replyText}"\n\n`;
        logToFile(`💬 Quoted message from ${replyFrom}: ${replyText.substring(0, 50)}...`);
      }
    }

    // Prepend quoted message for context
    const fullText = quotedMessage + processedText;

    // ============================================================================
    // Check for pending confirmation first
    // ============================================================================

    if (confirmationManager.hasPendingConfirmation(chatId)) {
      const confirmation = confirmationManager.getConfirmation(chatId);
      if (confirmation) {
        logToFile(`📝 Processing confirmation response from ${chatId}: ${text}`);

        const lowerText = text.toLowerCase().trim();
        const isYes = ['yes', 'y', 'ya', 'sure', 'confirm', 'approve', 'setuju'].includes(lowerText);
        const isNo = ['no', 'n', 'nope', 'cancel', 'reject', 'batal'].includes(lowerText);

        if (isYes || isNo) {
          const response = isYes ? 'yes\n' : 'no\n';
          confirmation.qwenProcess.stdin.write(response);

          await bot.sendMessage(chatId, `✅ Confirmation received: ${isYes ? 'YES' : 'NO'}. Processing...`);

          setTimeout(async () => {
            try {
              // Process will complete on its own
            } catch (error: any) {
              await bot.sendMessage(chatId, `❌ Error after confirmation: ${error.message}`);
            }
          }, 2000);

          return;
        } else {
          await bot.sendMessage(chatId, '⚠️ Please reply with "yes" or "no" to confirm.');
          return;
        }
      }
    }

    // ============================================================================
    // Handle custom CLI commands (/<command> syntax)
    // ============================================================================

    // Check if message starts with /<command>
    // Enhanced regex to handle Telegram's auto-correct: /help@botname (no space)
    const commandMatch = processedText.match(/^\/(\w+)(?:@\w+)?(?:\s+(.*))?$/);
    if (commandMatch) {
      const commandName = commandMatch[1];
      const args = commandMatch[2] || '';

      const customCommand = loadedCommands.get(commandName);
      if (customCommand) {
        logToFile(`📜 Executing custom command: /${commandName} ${args}`);

        bot.sendChatAction(chatId, 'typing');

        const fullCommand = `${commandName} ${args}`.trim();

        try {
          const response = await qwenClient.chat(fullCommand, [], chatId);

          await sendChunkedMessage(chatId, response, {
            parse_mode: 'Markdown'
          });

          logToFile(`✅ Custom command /${commandName} executed`);
        } catch (error: any) {
          await bot.sendMessage(chatId, `❌ Error executing command: ${error.message}`);
        }

        return;
      }
    }

    // ============================================================================
    // Handle file messages (documents, photos)
    // ============================================================================

    const document = msg.document;
    const photos = msg.photo;
    const hasFile = document || (photos && photos.length > 0);

    if (hasFile) {
      await handleFileMessage(msg, chatId, username, firstName);
      return;
    }

    // ============================================================================
    // Regular text message handling
    // ============================================================================

    logToFile(`💬 Processing message from ${chatId}`);

    // Skip allowlist check for groups and /start, /pair commands
    if (!isGroup && !processedText.startsWith('/start') && !processedText.startsWith('/pair')) {
      if (!allowlistManager.isAllowed(chatId)) {
        await bot.sendMessage(chatId,
          `❌ **Access Denied**\n\n` +
          `You need to pair this bot first.\n\n` +
          `**Steps:**\n` +
          `1. Use command: \`/start\` to see pairing instructions\n` +
          `2. Admin will generate pairing code\n` +
          `3. Run: \`/pair <CODE>\`\n\n` +
          `Example: \`/pair ABC123\``
        );
        return;
      }
    }

    // Handle /start command
    if (processedText.startsWith('/start')) {
      const pairingStatus = allowlistManager.isAllowed(chatId) ? '✅ Paired' : '❌ Unpaired';
      const approvalMode = getApprovalMode(chatId);

      await bot.sendMessage(chatId,
        `👋 Welcome to Telegram MCP Bot v2.2.0!\n\n` +
        `This bot connects Telegram to Qwen Code via MCP protocol.\n\n` +
        `**Pairing Status:** ${pairingStatus}\n\n` +
        `**To Get Started:**\n` +
        `${allowlistManager.isAllowed(chatId)
          ? '✅ You are already paired! Start chatting or send files.'
          : '1. Contact admin for pairing code\n2. Use /pair <CODE> to activate\n\n**Example:** `/pair ABC123`'
        }\n\n` +
        `**Commands:**\n` +
        `/start - Welcome message\n` +
        `/help - Help information\n` +
        `/status - Server status with metrics\n` +
        `/session - Your session info\n` +
        `/clear - Clear your session\n` +
        `/whoami - Your Telegram info\n` +
        `/approvalmode - View/set approval mode\n\n` +
        `**Current Approval Mode:** \`${approvalMode.mode}\`\n\n` +
        `**Files:** Send documents or photos to process them.\n\n` +
        `**Confirmations:** Reply "yes" or "no" to confirmation prompts.\n\n` +
        `**Groups:** Mention bot with @${BOT_USERNAME || 'bot_name'} to get a response!`
      );
      return;
    }

    // Handle /pair command
    if (processedText.startsWith('/pair')) {
      const code = processedText.split(' ')[1];
      if (!code) {
        await bot.sendMessage(chatId, 'Usage: /pair <CODE>\nExample: /pair ABC123');
        return;
      }

      const result = allowlistManager.verifyPairingCode(code);
      if (result) {
        const userInfo = msg.from;
        const username = userInfo?.username;
        const firstName = userInfo?.first_name;
        const isNowAllowed = allowlistManager.isAllowed(chatId);

        await bot.sendMessage(chatId,
          `✅ **Pairing successful!**\n\n` +
          `You now have full access to the bot.\n\n` +
          `**Status:** ${isNowAllowed ? '✅ Verified' : '⚠️ Check failed - try /start'}\n` +
          `**Chat ID:** \`${chatId}\`\n\n` +
          `Start chatting or use /help to see available commands.`
        );

        logToFile(`✅ Pairing verified for ${chatId} (${username || firstName}) - Allowlist: ${isNowAllowed ? 'YES' : 'NO'}`);
      } else {
        await bot.sendMessage(chatId, '❌ Invalid or expired code. Please request a new one.');
      }
      return;
    }

    // Load session from file
    let session = sessionManager.loadSession(chatId);
    logToFile(`📂 Session loaded for ${chatId}: ${session.length} messages`);

    // Handle other commands FIRST (before adding message to session)
    if (processedText.startsWith('/')) {
      await handleCommand(msg, session, sessionManager);
      return;
    }

    // Add user message to session (with quoted context for groups)
    session.push({ role: 'user', content: fullText, timestamp: Date.now() });
    logToFile(`💾 Message added to session: ${fullText.substring(0, 50)}...`);

    // Increment metrics
    serverMetrics.totalRequests++;
    logToFile(`📊 Metrics: requests=${serverMetrics.totalRequests}, errors=${serverMetrics.totalErrors}`);

    // ============================================================================
    // PHASE 3: Typing Indicator
    // ============================================================================

    bot.sendChatAction(chatId, 'typing');

    const typingInterval = setInterval(() => {
      bot.sendChatAction(chatId, 'typing');
    }, 5000);

    try {
      // Get conversation context (last 10 messages)
      const context = session.slice(-10);

      // Get response from Qwen Code (include quoted message context)
      const response = await qwenClient.chat(fullText, context, chatId);

      // Update token metrics (estimate based on character count)
      // Rough estimate: 1 token ≈ 4 characters for English, 2 for Indonesian
      const inputTokens = Math.ceil(processedText.length / 3);
      const outputTokens = Math.ceil(response.length / 3);
      serverMetrics.tokens.prompt += inputTokens;
      serverMetrics.tokens.output += outputTokens;
      serverMetrics.tokens.total += inputTokens + outputTokens;

      clearInterval(typingInterval);

      // Add assistant response to session
      session.push({ role: 'assistant', content: response, timestamp: Date.now() });

      // Keep only last MAX_MESSAGES
      if (session.length > 50) {
        session = session.slice(-50);
      }

      // Save session to file
      await sessionManager.saveSession(chatId, session);
      logToFile(`💾 Session saved for ${chatId}: ${session.length} messages`);

      // Send response to Telegram (with automatic chunking)
      // Reply to original message in groups for better UX
      const replyOptions = isGroup ? { reply_to_message_id: msg.message_id } : {};

      await sendChunkedMessage(chatId, response, {
        parse_mode: 'Markdown',
        ...replyOptions
      });

      logToFile(`✅ Response sent to ${chatId} (${isGroup ? 'group: ' + chatTitle : 'private'})`);
    } catch (error: any) {
      clearInterval(typingInterval);
      logToFile(`❌ Error processing message for ${chatId}: ${error.message}`);
      await bot.sendMessage(chatId, `❌ Error: ${error.message}`);
    }
  } catch (error: any) {
    logToFile(`❌ CRITICAL ERROR in message handler (${isGroup ? 'group' : 'private'}): ${error.message}`);
    logToFile(error.stack || 'No stack trace');

    try {
      if (!isGroup) {
        await bot.sendMessage(chatId, `❌ Critical error: ${error.message}`);
      } else {
        await bot.sendMessage(chatId, `❌ Sorry, encountered an error.`, {
          reply_to_message_id: msg.message_id
        });
      }
    } catch (sendError: any) {
      logToFile(`❌ Failed to send error message: ${sendError.message}`);
    }
  }
});

logToFile(`✅ Bot message handler registered (FULL FEATURES + GROUP SUPPORT)`);

// Bot polling status
logToFile(`🚀 Telegram Bot polling started...`);

bot.on('polling_error', (error) => {
  logToFile(`❌ BOT POLLING ERROR: ${error.message}`);
});

bot.on('connected', () => {
  logToFile(`✅ Bot connected to Telegram servers`);
});

bot.on('disconnected', () => {
  logToFile(`⚠️ Bot disconnected from Telegram servers`);
});

bot.on('error', (error) => {
  logToFile(`❌ Telegram Bot Error: ${error.message}`);
});

logToFile(`✅ All bot event handlers registered`);

bot.on('edited_message', async (msg) => {
  const chatId = msg.chat.id.toString();
  const text = msg.text || '';
  console.log(`✏️ Edited message from ${chatId}: ${text.substring(0, 100)}`);
});

bot.on('callback_query', async (query) => {
  const chatId = query.message?.chat.id.toString() || '';
  const data = query.data || '';
  console.log(`🔘 Callback query from ${chatId}: ${data}`);
});

bot.on('error', (error) => {
  console.error('❌ Telegram Bot Error:', error.message);
  // Don't exit - just log the error and continue
});

// ============================================================================
// GLOBAL ERROR HANDLERS (Prevent MCP Disconnect)
// ============================================================================

process.on('uncaughtException', (error) => {
  console.error('❌ UNCAUGHT EXCEPTION:', error.message);
  console.error(error.stack);
  // Keep process alive - don't exit!
  console.log('⚠️ Process continuing despite error...');
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ UNHANDLED REJECTION:', reason);
  // Keep process alive - don't exit!
  console.log('⚠️ Process continuing despite rejection...');
});

// Wrap async operations with error boundary
async function withErrorBoundary<T>(operation: () => Promise<T>, context: string): Promise<T | null> {
  try {
    return await operation();
  } catch (error: any) {
    console.error(`❌ Error in ${context}:`, error.message);
    return null;
  }
}

// ============================================================================
// PHASE 4: Command Handler with Admin Commands
// ============================================================================

async function handleCommand(msg: any, session: Message[], sessionManager: SessionManager) {
  const chatId = msg.chat.id.toString();
  const text = msg.text || '';
  
  // Parse command with support for @botname suffix (Telegram auto-correct)
  const commandMatch = text.match(/^\/(\w+)(?:@\w+)?(?:\s+(.*))?$/);
  const commandName = commandMatch ? commandMatch[1].toLowerCase() : text.split(' ')[0].toLowerCase().replace('/', '');
  const args = commandMatch ? (commandMatch[2] || '') : text.split(' ').slice(1).join(' ');

  // Check for custom commands first (priority over built-in)
  if (loadedCommands.has(commandName)) {
    const customCommand = loadedCommands.get(commandName)!;
    console.log(`📜 Executing custom command: /${commandName} ${args}`);
    
    bot.sendChatAction(chatId, 'typing');
    
    const fullCommand = `${commandName} ${args}`.trim();
    
    try {
      const response = await qwenClient.chat(fullCommand, [], chatId);

      await sendChunkedMessage(chatId, response, {
        parse_mode: 'Markdown'
      });

      // Save command execution to session
      session.push({ role: 'user', content: `/${commandName} ${args}`, timestamp: Date.now() });
      session.push({ role: 'assistant', content: response, timestamp: Date.now() });
      await sessionManager.saveSession(chatId, session);

      console.log(`✅ Custom command /${commandName} executed`);
    } catch (error: any) {
      await bot.sendMessage(chatId, `❌ Error executing command: ${error.message}`);
    }

    return;
  }

  switch (commandName) {
    case 'help':
      const customCommandsList = Array.from(loadedCommands.entries())
        .map(([name, cmd]) => `/${name} - ${cmd.description}`)
        .join('\n');

      await bot.sendMessage(
        chatId,
        '📖 Help\n\n' +
        'This bot connects Telegram to Qwen Code via MCP protocol.\n\n' +
        '*Commands:*\n' +
        '/start - Welcome message\n' +
        '/help - This help\n' +
        '/status - Server status with metrics\n' +
        '/session - Your session info\n' +
        '/sessions - List all sessions\n' +
        '/clear - Clear your session\n' +
        '/whoami - Your Telegram info\n' +
        '/approvalmode - View/set approval mode (plan/auto-accept/yolo)\n\n' +
        '*Custom Commands:*\n' +
        (customCommandsList || 'No custom commands loaded') +
        '\n\n' +
        '*Files:*\n' +
        'Send documents or photos to process them.\n\n' +
        '*Confirmations:*\n' +
        'Reply "yes" or "no" to confirmation prompts.'
      );
      break;

    case 'status':
      const stats = {
        activeChats: activeChats.size,
        uptime: process.uptime(),
        memory: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
        sessionsCount: sessionManager.listSessions().length,
        allowedUsers: allowlistManager.getAllowed().length,
        pendingUsers: allowlistManager.getPending().length
      };
      
      const uptimeFormatted = Math.round(stats.uptime);
      const uptimeStr = uptimeFormatted < 60 
        ? `${uptimeFormatted}s` 
        : `${Math.round(uptimeFormatted / 60)}m ${uptimeFormatted % 60}s`;
      
      await bot.sendMessage(
        chatId,
        '📊 Server Status v2.1.6\n\n' +
        '━━━ Server Info ━━━\n' +
        `Active Chats: ${stats.activeChats}\n` +
        `Uptime: ${uptimeStr}\n` +
        `Memory: ${stats.memory}MB\n` +
        `Saved Sessions: ${stats.sessionsCount}\n` +
        `Allowed Users: ${stats.allowedUsers}\n` +
        `Pending Pairings: ${stats.pendingUsers}\n\n` +
        '━━━ API Metrics ━━━\n' +
        `Requests: ${serverMetrics.totalRequests}\n` +
        `Errors: ${serverMetrics.totalErrors}\n` +
        `Error Rate: ${serverMetrics.totalRequests > 0 ? ((serverMetrics.totalErrors / serverMetrics.totalRequests) * 100).toFixed(2) : '0.00'}%\n\n` +
        '━━━ Token Usage ━━━\n' +
        `Total: ${serverMetrics.tokens.total.toLocaleString()}\n` +
        `├─ Prompt: ${serverMetrics.tokens.prompt.toLocaleString()}\n` +
        `├─ Cached: ${serverMetrics.tokens.cached.toLocaleString()}\n` +
        `├─ Thoughts: ${serverMetrics.tokens.thoughts.toLocaleString()}\n` +
        `└─ Output: ${serverMetrics.tokens.output.toLocaleString()}`
      );
      break;

    case 'approvalmode':
    case 'approval':
      const currentMode = getApprovalMode(chatId);
      const modeArg = args[0]?.toLowerCase() as 'plan' | 'auto-accept' | 'yolo' | undefined;
      
      if (!modeArg) {
        // Show current mode
        await bot.sendMessage(chatId,
          '📋 **Approval Mode**\n\n' +
          `**Current Mode:** \`${currentMode.mode}\`\n\n` +
          '**Modes:**\n' +
          '• `plan` - Show plan first, ask for confirmation (default)\n' +
          '• `auto-accept` - Auto-accept suggestions, ask for edits\n' +
          '• `yolo` - No confirmations, execute everything\n\n' +
          '**Usage:** `/approvalmode <mode>`\n' +
          'Example: `/approvalmode yolo`'
        );
      } else if (['plan', 'auto-accept', 'yolo'].includes(modeArg)) {
        setApprovalMode(chatId, modeArg, msg.from?.username || msg.from?.first_name);
        const modeDescriptions = {
          'plan': 'Show plan first, ask for confirmation',
          'auto-accept': 'Auto-accept suggestions, ask for edits',
          'yolo': 'No confirmations, execute everything'
        };
        await bot.sendMessage(chatId,
          `✅ **Approval mode changed**\n\n` +
          `**Mode:** \`${modeArg}\`\n` +
          `**Description:** ${modeDescriptions[modeArg]}\n\n` +
          `This setting is persistent and will be used for all Qwen Code operations.`
        );
      } else {
        await bot.sendMessage(chatId,
          '❌ Invalid mode. Available modes: `plan`, `auto-accept`, `yolo`\n\n' +
          'Usage: `/approvalmode <mode>`\n' +
          'Example: `/approvalmode yolo`'
        );
      }
      break;

    case 'session':
      const userSession = sessionManager.loadSession(chatId);
      await bot.sendMessage(chatId,
        `📊 **Session Info**\n\n` +
        `**Chat ID:** \`${chatId}\`\n` +
        `**Messages:** ${userSession.length}\n` +
        `**Status:** ${allowlistManager.isAllowed(chatId) ? '✅ Paired' : '❌ Unpaired'}`
      );
      break;

    case 'sessions':
      const sessions = sessionManager.listSessions();
      await bot.sendMessage(chatId,
        `📋 **Active Sessions**\n\n` +
        (sessions.length > 0
          ? sessions.map(s => `- \`${s}\``).join('\n')
          : 'No active sessions')
      );
      break;

    case 'clear':
      sessionManager.deleteSession(chatId);
      // Force save empty session to ensure clean state
      await sessionManager.saveSession(chatId, []);
      await bot.sendMessage(chatId, '🧹 Session cleared! Starting fresh. Previous conversation context has been removed.');
      return; // Exit early to prevent any further processing

    case 'whoami':
      const user = msg.from;
      await bot.sendMessage(chatId,
        `👤 **Your Info**\n\n` +
        `**ID:** \`${user?.id}\`\n` +
        `**Name:** ${user?.first_name} ${user?.last_name || ''}\n` +
        `**Username:** @${user?.username || 'N/A'}\n` +
        `**Language:** ${user?.language_code || 'N/A'}`
      );
      break;

    default:
      await bot.sendMessage(chatId, 'Unknown command: /' + commandName + '\nUse /help for available commands.');
  }
}

// ============================================================================
// File Message Handler
// ============================================================================

async function handleFileMessage(
  msg: any,
  chatId: string,
  username?: string,
  firstName?: string
) {
  const document = msg.document;
  const photos = msg.photo;
  const caption = msg.caption || '';

  try {
    let fileId: string;
    let fileName: string;
    let fileType: string;

    if (document) {
      fileId = document.file_id;
      // Use original filename from Telegram, fallback to timestamp only if missing
      fileName = document.file_name || `file_${Date.now()}`;
      fileType = 'document';
    } else if (photos && photos.length > 0) {
      // Get highest quality photo
      const photo = photos[photos.length - 1];
      fileId = photo.file_id;
      fileName = `photo_${Date.now()}.jpg`;
      fileType = 'photo';
    } else {
      return;
    }

    console.log(`📎 File received from ${chatId}: ${fileName} (${fileType})`);

    // Send download notification
    await bot.sendMessage(chatId, `⬇️ Downloading ${fileType}...`);

    // Get file info
    const file = await bot.getFile(fileId);
    
    // Download file with ORIGINAL filename (custom implementation)
    // node-telegram-bot-api's downloadFile() renames files, so we do it manually
    const safeFileName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_'); // Sanitize filename
    const filePath = path.join(DOWNLOADS_DIR, safeFileName);
    
    const fileStream = fs.createWriteStream(filePath);
    const downloadStream = await bot.getFileStream(fileId);
    
    await new Promise<void>((resolve, reject) => {
      downloadStream.pipe(fileStream);
      downloadStream.on('end', () => resolve());
      downloadStream.on('error', (err: any) => reject(err));
    });

    console.log(`✅ File downloaded to: ${filePath}`);

    // Add to session with FULL context (filename + path)
    const session = sessionManager.loadSession(chatId);
    
    // Create detailed file context message
    const fileContext = `[File Received]\n` +
      `**Filename:** ${fileName}\n` +
      `**Full Path:** ${filePath}\n` +
      `**Type:** ${fileType}\n` +
      `**Size:** ${file.file_size ? (file.file_size / 1024).toFixed(2) + ' KB' : 'Unknown'}\n` +
      `**Caption:** ${caption || '(none)'}\n\n` +
      `The file is saved and ready to process. You can reference it by its full path: ${filePath}`;
    
    session.push({
      role: 'user',
      content: fileContext,
      timestamp: Date.now()
    });

    // Send file info to user
    await bot.sendMessage(chatId,
      `✅ **File Received**\n\n` +
      `**Name:** \`${fileName}\`\n` +
      `**Type:** ${fileType}\n` +
      `**Size:** ${file.file_size ? (file.file_size / 1024).toFixed(2) + ' KB' : 'Unknown'}\n` +
      `**Saved to:** \`${filePath}\`\n\n` +
      `The file is now available for processing. You can ask me to do something with it.`
    );

    await sessionManager.saveSession(chatId, session);

  } catch (error: any) {
    console.error(`❌ Error handling file from ${chatId}:`, error.message);
    await bot.sendMessage(chatId, `❌ Error downloading file: ${error.message}`);
  }
}

// ============================================================================
// PHASE 5: Cleanup & Maintenance
// ============================================================================

// Cleanup on startup
console.log('🧹 Running startup cleanup...');
sessionManager.cleanupInactive(7);
allowlistManager.cleanupExpired();
confirmationManager.cleanup();

// Scheduled cleanup (every hour)
setInterval(() => {
  console.log('🧹 Running scheduled cleanup...');
  sessionManager.cleanupInactive(7);
  allowlistManager.cleanupExpired();
  confirmationManager.cleanup();
}, 60 * 60 * 1000);

// File cleanup (every 24 hours) - delete files older than 7 days
setInterval(() => {
  console.log('🧹 Running file cleanup...');
  const cleanupOldFiles = (dir: string, days: number = 7) => {
    if (!fs.existsSync(dir)) return;
    
    const now = Date.now();
    const threshold = days * 24 * 60 * 60 * 1000;
    
    const files = fs.readdirSync(dir);
    for (const file of files) {
      const filePath = path.join(dir, file);
      try {
        const stats = fs.statSync(filePath);
        if (stats.isFile() && (now - stats.mtimeMs) > threshold) {
          fs.unlinkSync(filePath);
          console.log(`🧹 Deleted old file: ${filePath}`);
        }
      } catch (error: any) {
        console.error(`Error processing file ${file}:`, error.message);
      }
    }
  };
  
  cleanupOldFiles(DOWNLOADS_DIR);
  cleanupOldFiles(UPLOADS_DIR);
}, 24 * 60 * 60 * 1000);

// ============================================================================
// MCP Tools Registration
// ============================================================================

/**
 * Send a message to a Telegram chat
 */
server.registerTool(
  'send_telegram_message',
  {
    title: 'Send Telegram Message',
    description: 'Send a message to a Telegram chat. Use this to respond to Telegram users or broadcast messages.',
    inputSchema: {
      chatId: z.string().describe('Telegram chat ID (e.g., "123456789")'),
      text: z.string().describe('Message text to send')
    },
    outputSchema: {
      success: z.boolean(),
      messageId: z.number().optional(),
      error: z.string().optional()
    }
  },
  async ({ chatId, text }) => {
    try {
      const message = await bot.sendMessage(chatId, text);
      console.log(`✅ Sent message to ${chatId}: ${text.substring(0, 50)}...`);
      const output = {
        success: true,
        messageId: message.message_id
      };
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(output) }],
        structuredContent: output
      };
    } catch (error: any) {
      console.error(`❌ Failed to send message to ${chatId}:`, error.message);
      const output = {
        success: false,
        error: error.message
      };
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(output) }],
        structuredContent: output
      };
    }
  }
);

/**
 * Get information about a Telegram chat
 */
server.registerTool(
  'get_chat_info',
  {
    title: 'Get Chat Info',
    description: 'Get information about a Telegram chat including title, type, and member count.',
    inputSchema: {
      chatId: z.string().describe('Telegram chat ID')
    },
    outputSchema: {
      success: z.boolean(),
      chatInfo: z.object({
        id: z.number(),
        type: z.string(),
        title: z.string().optional(),
        firstName: z.string().optional(),
        lastName: z.string().optional(),
        username: z.string().optional(),
        membersCount: z.number().optional()
      }).optional(),
      error: z.string().optional()
    }
  },
  async ({ chatId }) => {
    try {
      const chat = await bot.getChat(chatId);
      const chatInfo = {
        id: chat.id,
        type: chat.type,
        title: chat.title,
        firstName: (chat as any).first_name,
        lastName: (chat as any).last_name,
        username: chat.username || undefined,
        membersCount: (chat as any).members_count
      };
      console.log(`📋 Retrieved chat info for ${chatId}`);
      const output = {
        success: true,
        chatInfo
      };
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(output) }],
        structuredContent: output
      };
    } catch (error: any) {
      console.error(`❌ Failed to get chat info for ${chatId}:`, error.message);
      const output = {
        success: false,
        error: error.message
      };
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(output) }],
        structuredContent: output
      };
    }
  }
);

/**
 * List all active chats
 */
server.registerTool(
  'list_active_chats',
  {
    title: 'List Active Chats',
    description: 'List all Telegram chats that have been active in this session.',
    inputSchema: {},
    outputSchema: {
      success: z.boolean(),
      chats: z.array(z.object({
        chatId: z.string(),
        username: z.string().optional(),
        firstName: z.string().optional(),
        lastMessage: z.number()
      })),
      count: z.number()
    }
  },
  async () => {
    const chats = Array.from(activeChats.entries()).map(([chatId, data]) => ({
      chatId,
      username: data.username,
      firstName: data.firstName,
      lastMessage: data.lastMessage
    }));

    console.log(`📋 Listed ${chats.length} active chats`);
    const output = {
      success: true,
      chats,
      count: chats.length
    };
    return {
      content: [{ type: 'text' as const, text: JSON.stringify(output) }],
      structuredContent: output
    };
  }
);

/**
 * Get conversation history for a chat
 */
server.registerTool(
  'get_conversation_history',
  {
    title: 'Get Conversation History',
    description: 'Get the conversation history for a specific Telegram chat.',
    inputSchema: {
      chatId: z.string().describe('Telegram chat ID'),
      limit: z.number().optional().default(10).describe('Number of messages to retrieve (default: 10)')
    },
    outputSchema: {
      success: z.boolean(),
      messages: z.array(z.object({
        role: z.string(),
        content: z.string(),
        timestamp: z.number()
      })),
      count: z.number()
    }
  },
  async ({ chatId, limit = 10 }) => {
    const messages = sessionManager.loadSession(chatId).slice(-limit);
    console.log(`📋 Retrieved ${messages.length} messages for chat ${chatId}`);
    const output = {
      success: true,
      messages,
      count: messages.length
    };
    return {
      content: [{ type: 'text' as const, text: JSON.stringify(output) }],
      structuredContent: output
    };
  }
);

/**
 * Generate pairing code for Telegram access (NEW in v2.0)
 */
server.registerTool(
  'generate_telegram_pairing_code',
  {
    title: 'Generate Telegram Pairing Code',
    description: 'Generate a 6-digit pairing code for Telegram bot access. Valid for 15 minutes.',
    inputSchema: {
      chatId: z.string().optional().describe('Telegram chat ID (auto-detected from last unpaired chat if not provided)')
    },
    outputSchema: {
      success: z.boolean(),
      code: z.string().optional(),
      chatId: z.string().optional(),
      error: z.string().optional()
    }
  },
  async ({ chatId }) => {
    try {
      let targetChatId = chatId;

      // If no chatId provided, find the last unpaired chat from active chats
      if (!targetChatId) {
        const pending = allowlistManager.getPending();
        if (pending.length > 0) {
          targetChatId = pending[pending.length - 1].chatId;
        } else {
          // Find active chat that's not allowed
          for (const [cid, data] of activeChats.entries()) {
            if (!allowlistManager.isAllowed(cid)) {
              targetChatId = cid;
              break;
            }
          }
        }
      }

      if (!targetChatId) {
        const output = {
          success: false,
          error: 'No pending chat found. Please have user message the bot first.'
        };
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(output) }],
          structuredContent: output
        };
      }

      const code = allowlistManager.generatePairingCode(targetChatId);
      console.log(`🔑 Generated pairing code ${code} for ${targetChatId}`);

      const output = {
        success: true,
        code,
        chatId: targetChatId
      };
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(output) }],
        structuredContent: output
      };
    } catch (error: any) {
      console.error('❌ Failed to generate pairing code:', error.message);
      const output = {
        success: false,
        error: error.message
      };
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(output) }],
        structuredContent: output
      };
    }
  }
);

/**
 * Verify pairing code and grant access (NEW in v2.0)
 */
server.registerTool(
  'verify_telegram_pairing',
  {
    title: 'Verify Telegram Pairing Code',
    description: 'Verify a pairing code and grant access to the bot.',
    inputSchema: {
      code: z.string().describe('6-digit pairing code')
    },
    outputSchema: {
      success: z.boolean(),
      chatId: z.string().optional(),
      error: z.string().optional()
    }
  },
  async ({ code }) => {
    try {
      const chatId = allowlistManager.verifyPairingCode(code);
      if (chatId) {
        await bot.sendMessage(chatId, '✅ Pairing successful! You now have access to the bot.');
        console.log(`✅ Verified pairing code ${code} for ${chatId}`);
        const output = { success: true, chatId };
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(output) }],
          structuredContent: output
        };
      }
      const output = {
        success: false,
        error: 'Invalid or expired code. Please request a new one.'
      };
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(output) }],
        structuredContent: output
      };
    } catch (error: any) {
      console.error('❌ Failed to verify pairing code:', error.message);
      const output = {
        success: false,
        error: error.message
      };
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(output) }],
        structuredContent: output
      };
    }
  }
);

/**
 * Send a file to a Telegram chat
 */
server.registerTool(
  'send_telegram_file',
  {
    title: 'Send Telegram File',
    description: 'Send a file (document, photo, etc.) to a Telegram chat. File must exist on the server.',
    inputSchema: {
      chatId: z.string().describe('Telegram chat ID'),
      filePath: z.string().describe('Path to the file on server'),
      caption: z.string().optional().describe('Optional caption for the file')
    },
    outputSchema: {
      success: z.boolean(),
      messageId: z.number().optional(),
      error: z.string().optional()
    }
  },
  async ({ chatId, filePath, caption }) => {
    try {
      if (!fs.existsSync(filePath)) {
        throw new Error(`File not found: ${filePath}`);
      }

      const fileStream = fs.createReadStream(filePath);
      const message = await bot.sendDocument(chatId, fileStream, { caption });
      console.log(`✅ Sent file to ${chatId}: ${filePath}`);
      const output = {
        success: true,
        messageId: message.message_id
      };
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(output) }],
        structuredContent: output
      };
    } catch (error: any) {
      console.error(`❌ Failed to send file to ${chatId}:`, error.message);
      const output = {
        success: false,
        error: error.message
      };
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(output) }],
        structuredContent: output
      };
    }
  }
);

/**
 * List files in downloads directory
 */
server.registerTool(
  'list_telegram_downloads',
  {
    title: 'List Telegram Downloads',
    description: 'List all files downloaded from Telegram.',
    inputSchema: {},
    outputSchema: {
      success: z.boolean(),
      files: z.array(z.object({
        name: z.string(),
        path: z.string(),
        size: z.number(),
        modifiedAt: z.string()
      })),
      count: z.number()
    }
  },
  async () => {
    try {
      const files: Array<{ name: string; path: string; size: number; modifiedAt: string }> = [];
      
      if (fs.existsSync(DOWNLOADS_DIR)) {
        const fileNames = fs.readdirSync(DOWNLOADS_DIR);
        for (const fileName of fileNames) {
          const filePath = path.join(DOWNLOADS_DIR, fileName);
          const stats = fs.statSync(filePath);
          files.push({
            name: fileName,
            path: filePath,
            size: stats.size,
            modifiedAt: stats.mtime.toISOString()
          });
        }
      }

      console.log(`📋 Listed ${files.length} downloaded files`);
      const output = {
        success: true,
        files,
        count: files.length
      };
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(output) }],
        structuredContent: output
      };
    } catch (error: any) {
      console.error('❌ Failed to list downloads:', error.message);
      const output = {
        success: false,
        error: error.message
      };
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(output) }],
        structuredContent: output
      };
    }
  }
);

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n👋 Shutting down gracefully...');
  bot.stopPolling();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n👋 Shutting down gracefully...');
  bot.stopPolling();
  process.exit(0);
});

// Start MCP Server
async function main() {
  console.log('🚀 Starting Telegram MCP Server v2.1...');
  console.log(`📁 Workspace: ${WORKSPACE_PATH}`);
  console.log(`📡 Telegram Bot Token: ${TELEGRAM_BOT_TOKEN!.substring(0, 20)}...`);
  console.log(`🤖 Bot Username: ${(await bot.getMe()).username}`);
  console.log(`📂 Sessions Directory: ${sessionManager['sessionsDir']}`);
  console.log(`📋 Allowlist File: ${allowlistManager['allowlistPath']}`);
  console.log(`📁 Files Directory: ${FILES_DIR}`);

  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.log('✅ MCP Server running on stdio');
  console.log('📡 Listening for Telegram messages...');
  console.log('');
  console.log('Registered MCP Tools:');
  console.log('  • send_telegram_message');
  console.log('  • get_chat_info');
  console.log('  • list_active_chats');
  console.log('  • get_conversation_history');
  console.log('  • generate_telegram_pairing_code');
  console.log('  • verify_telegram_pairing');
  console.log('  • send_telegram_file (NEW)');
  console.log('  • list_telegram_downloads (NEW)');
  console.log('');
  console.log('Telegram commands:');
  console.log('  /start, /help, /status, /session, /sessions, /clear, /whoami, /ask');
  console.log('  /pair <CODE> - Pair with bot');
  console.log('  📎 Send files directly to process them');
  console.log('  ✅ Reply "yes" or "no" to confirmations');
}

main().catch((error) => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});
