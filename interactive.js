/**
 * Interactive Loop Module
 * 
 * Provides an interactive REPL-style interface for the agent.
 * Plain text output, no colors (v1), no emojis.
 */

import readline from 'readline';
import fs from 'fs';
import path from 'path';
import { memory } from './memory.js';
import { saveSession, loadLatestSession, listSessions, saveConversation, loadConversation } from './persistence.js';
import { callLLM, validateDiffFormat } from './llm.js';
import { applyDiffToFile } from './applyDiff.js';
import { runVerification } from './executor.js';
import { gatherProjectContext } from './planner.js';
import * as logger from './logger.js';
import { SECTIONS } from './logger.js';

/**
 * @typedef {Object} ConversationMessage
 * @property {string} role - 'user' | 'assistant' | 'system'
 * @property {string} content - Message content
 * @property {number} timestamp - Unix timestamp
 * @property {Object} [metadata] - Optional metadata (files, actions, etc.)
 */

/**
 * Interactive Agent Loop class
 */
export class InteractiveLoop {
  constructor(options = {}) {
    this.workingDir = options.workingDir || process.cwd();
    this.conversation = [];
    this.context = null;
    this.autoApprove = options.autoApprove || false;
    this.verifyCommand = options.verifyCommand || null;
    this.targetFiles = options.files || [];
    this.running = false;
    this.rl = null;
  }

  /**
   * Initializes the interactive loop.
   */
  async initialize() {
    // Try to load previous session
    const previousSession = loadLatestSession(this.workingDir);
    
    if (previousSession && previousSession.status === 'active') {
      logger.info('Found previous active session');
      const resume = await this.confirm('Resume previous session?');
      
      if (resume) {
        memory.session = previousSession;
        memory.session.files = new Map(Object.entries(previousSession.files || {}));
        this.conversation = loadConversation(previousSession.sessionId, this.workingDir);
        logger.success(`Resumed session: ${previousSession.sessionId}`);
      }
    }

    // Gather project context if files specified
    if (this.targetFiles.length > 0) {
      this.context = await gatherProjectContext(this.workingDir, this.targetFiles);
      logger.info(`Loaded context for ${this.context.files.length} file(s)`);
    }

    // Start new session if needed
    if (!memory.session) {
      memory.startSession('Interactive session');
    }
  }

  /**
   * Prompts user for confirmation.
   * 
   * @param {string} question - Question to ask
   * @returns {Promise<boolean>}
   */
  async confirm(question) {
    return new Promise((resolve) => {
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
      });

      rl.question(`${question} (y/n): `, (answer) => {
        rl.close();
        resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes');
      });
    });
  }

  /**
   * Prints the TUI header.
   */
  printHeader() {
    console.log(`
=================================================
   Vibe Agent - Interactive Mode
=================================================
`);
    console.log(`Working directory: ${this.workingDir}`);
    console.log(`Session: ${memory.session?.sessionId || 'none'}`);
    if (this.targetFiles.length > 0) {
      console.log(`Files: ${this.targetFiles.join(', ')}`);
    }
    console.log();
  }

  /**
   * Prints available commands.
   */
  printHelp() {
    console.log(`
Available Commands:
  /help              Show this help message
  /files             List current target files
  /add <file>        Add a file to context
  /remove <file>     Remove a file from context
  /status            Show session status
  /history           Show conversation history
  /undo              Restore last backup
  /verify [cmd]      Run verification command
  /auto              Toggle auto-approve mode
  /save              Save session to disk
  /sessions          List saved sessions
  /clear             Clear screen
  /exit              Exit interactive mode

Or just type your instruction to edit files.
`);
  }

  /**
   * Adds a message to conversation history.
   * 
   * @param {string} role - Message role
   * @param {string} content - Message content
   * @param {Object} [metadata] - Optional metadata
   */
  addMessage(role, content, metadata = null) {
    this.conversation.push({
      role,
      content,
      timestamp: Date.now(),
      metadata
    });
  }

  /**
   * Handles a user command (starts with /).
   * 
   * @param {string} input - User input
   * @returns {Promise<boolean>} Whether to continue the loop
   */
  async handleCommand(input) {
    const [cmd, ...args] = input.slice(1).split(' ');

    switch (cmd.toLowerCase()) {
      case 'help':
        this.printHelp();
        break;

      case 'files':
        if (this.targetFiles.length === 0) {
          console.log('No files in context. Use /add <file> to add files.');
        } else {
          console.log('Target files:');
          for (const file of this.targetFiles) {
            const exists = fs.existsSync(path.resolve(this.workingDir, file));
            const status = exists ? '[OK]' : '[NOT FOUND]';
            console.log(`  ${status} ${file}`);
          }
        }
        break;

      case 'add':
        if (args.length === 0) {
          console.log('Usage: /add <file>');
        } else {
          const file = args.join(' ');
          const absPath = path.resolve(this.workingDir, file);
          if (fs.existsSync(absPath)) {
            if (!this.targetFiles.includes(file)) {
              this.targetFiles.push(file);
              this.context = await gatherProjectContext(this.workingDir, this.targetFiles);
              console.log(`Added: ${file}`);
            } else {
              console.log(`File already in context: ${file}`);
            }
          } else {
            console.log(`File not found: ${file}`);
          }
        }
        break;

      case 'remove':
        if (args.length === 0) {
          console.log('Usage: /remove <file>');
        } else {
          const file = args.join(' ');
          const index = this.targetFiles.indexOf(file);
          if (index >= 0) {
            this.targetFiles.splice(index, 1);
            this.context = await gatherProjectContext(this.workingDir, this.targetFiles);
            console.log(`Removed: ${file}`);
          } else {
            console.log(`File not in context: ${file}`);
          }
        }
        break;

      case 'status':
        console.log(memory.getSummary());
        break;

      case 'history':
        if (this.conversation.length === 0) {
          console.log('No conversation history.');
        } else {
          console.log('Conversation History:\n');
          for (const msg of this.conversation.slice(-10)) {
            const role = msg.role === 'user' ? 'You' : 'Agent';
            const time = new Date(msg.timestamp).toLocaleTimeString();
            console.log(`[${time}] ${role}:`);
            console.log(`  ${msg.content.slice(0, 200)}${msg.content.length > 200 ? '...' : ''}\n`);
          }
        }
        break;

      case 'undo':
        await this.handleUndo();
        break;

      case 'verify':
        const verifyCmd = args.length > 0 ? args.join(' ') : this.verifyCommand;
        if (!verifyCmd) {
          console.log('No verification command. Use: /verify <command>');
        } else {
          this.verifyCommand = verifyCmd;
          console.log(`Running: ${verifyCmd}`);
          const result = await runVerification(verifyCmd, this.workingDir);
          if (result.success) {
            console.log('Verification: PASSED');
          } else {
            console.log('Verification: FAILED');
          }
          if (result.stdout) console.log(result.stdout);
          if (result.stderr) console.log(result.stderr);
        }
        break;

      case 'auto':
        this.autoApprove = !this.autoApprove;
        console.log(`Auto-approve: ${this.autoApprove ? 'ON' : 'OFF'}`);
        break;

      case 'save':
        this.saveState();
        console.log('Session saved.');
        break;

      case 'sessions':
        const sessions = listSessions(this.workingDir);
        if (sessions.length === 0) {
          console.log('No saved sessions.');
        } else {
          console.log('Saved Sessions:');
          for (const s of sessions.slice(0, 10)) {
            const time = new Date(s.startTime).toLocaleString();
            console.log(`  [${s.status.toUpperCase()}] ${s.sessionId}`);
            console.log(`    ${time} | ${s.actionCount} actions | ${s.intent.slice(0, 40)}`);
          }
        }
        break;

      case 'clear':
        console.clear();
        this.printHeader();
        break;

      case 'exit':
      case 'quit':
        this.saveState();
        console.log('Session saved. Goodbye!');
        return false;

      default:
        console.log(`Unknown command: /${cmd}. Type /help for commands.`);
    }

    return true;
  }

  /**
   * Handles undo (restore from backup).
   */
  async handleUndo() {
    // Find recent file edits
    const editActions = memory.getActionsByType('apply-diff')
      .filter(a => a.success && a.output?.backupPath);

    if (editActions.length === 0) {
      console.log('No backups available.');
      return;
    }

    const lastEdit = editActions[editActions.length - 1];
    const backupPath = lastEdit.output.backupPath;
    const filePath = lastEdit.input.filePath;

    if (!fs.existsSync(backupPath)) {
      console.log(`Backup file not found: ${backupPath}`);
      return;
    }

    const confirm = await this.confirm(`Restore ${path.basename(filePath)} from backup?`);
    if (confirm) {
      fs.copyFileSync(backupPath, filePath);
      console.log(`Restored: ${filePath}`);
      memory.recordAction('undo', `Restored ${path.basename(filePath)}`, { filePath, backupPath });
    }
  }

  /**
   * Handles a natural language instruction.
   * 
   * @param {string} instruction - User instruction
   */
  async handleInstruction(instruction) {
    if (this.targetFiles.length === 0) {
      console.log('No files in context. Use /add <file> first.');
      return;
    }

    this.addMessage('user', instruction);
    memory.nextIteration();

    // Read file contents
    const files = [];
    for (const file of this.targetFiles) {
      const absPath = path.resolve(this.workingDir, file);
      if (fs.existsSync(absPath)) {
        files.push({
          path: absPath,
          name: file,
          content: fs.readFileSync(absPath, 'utf8')
        });
      }
    }

    // Build context from conversation
    const conversationContext = this.conversation
      .slice(-6)
      .map(m => `${m.role}: ${m.content}`)
      .join('\n');

    // Call LLM for each file
    for (const file of files) {
      console.log(`\nProcessing: ${file.name}`);
      
      const actionId = memory.recordAction('llm-call', `Generate diff for ${file.name}`, {
        filePath: file.path,
        instruction
      });

      const response = await callLLM({
        fileContent: file.content,
        filePath: file.name,
        instruction,
        feedbackContext: conversationContext
      });

      if (!response.success) {
        memory.completeAction(actionId, null, false, response.error);
        console.log(`LLM error: ${response.error}`);
        continue;
      }

      const validation = validateDiffFormat(response.diff);
      if (!validation.valid) {
        memory.completeAction(actionId, null, false, validation.error);
        console.log(`Invalid diff: ${validation.error}`);
        continue;
      }

      memory.completeAction(actionId, { diff: response.diff }, true);

      // Display diff
      logger.section(SECTIONS.DIFF);
      logger.printDiff(response.diff);

      // Apply or ask for confirmation
      let approved = this.autoApprove;
      if (!approved) {
        approved = await this.confirm('Apply this change?');
      }

      if (approved) {
        const applyId = memory.recordAction('apply-diff', `Apply to ${file.name}`, {
          filePath: file.path
        });

        const result = applyDiffToFile(file.path, response.diff);
        
        if (result.success) {
          memory.completeAction(applyId, { backupPath: result.backupPath }, true);
          console.log(`Applied to ${file.name}`);
          this.addMessage('assistant', `Applied changes to ${file.name}`, { diff: response.diff });

          // Auto-verify if command set
          if (this.verifyCommand) {
            console.log('Verifying...');
            const verifyResult = await runVerification(this.verifyCommand, this.workingDir);
            if (verifyResult.success) {
              console.log('Verification: PASSED');
            } else {
              console.log('Verification: FAILED');
              if (verifyResult.stderr) {
                console.log(verifyResult.stderr.slice(0, 300));
              }
            }
          }
        } else {
          memory.completeAction(applyId, null, false, result.error);
          console.log(`Failed: ${result.error}`);
        }
      } else {
        console.log('Skipped');
        this.addMessage('assistant', `Proposed changes to ${file.name} (skipped by user)`);
      }
    }

    // Save state periodically
    this.saveState();
  }

  /**
   * Saves current state to disk.
   */
  saveState() {
    if (memory.session) {
      saveSession(memory.exportSession(), this.workingDir);
      saveConversation(memory.session.sessionId, this.conversation, this.workingDir);
    }
  }

  /**
   * Main interactive loop.
   */
  async run() {
    await this.initialize();
    
    console.clear();
    this.printHeader();
    this.printHelp();

    this.running = true;
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: '> '
    });

    this.rl.prompt();

    this.rl.on('line', async (line) => {
      const input = line.trim();

      if (!input) {
        this.rl.prompt();
        return;
      }

      try {
        if (input.startsWith('/')) {
          const shouldContinue = await this.handleCommand(input);
          if (!shouldContinue) {
            this.rl.close();
            return;
          }
        } else {
          await this.handleInstruction(input);
        }
      } catch (err) {
        console.log(`Error: ${err.message}`);
      }

      console.log();
      this.rl.prompt();
    });

    this.rl.on('close', () => {
      this.running = false;
      this.saveState();
      process.exit(0);
    });
  }
}

/**
 * Starts the interactive loop.
 * 
 * @param {Object} options - Options
 * @returns {Promise<void>}
 */
export async function startInteractiveLoop(options = {}) {
  const loop = new InteractiveLoop(options);
  await loop.run();
}

export default { InteractiveLoop, startInteractiveLoop };
