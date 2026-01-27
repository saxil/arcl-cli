/**
 * Memory Module
 * 
 * Tracks agent actions, outcomes, and state across iterations.
 * Phase 2: In-memory JSON storage.
 * Phase 3+: Persistent JSON or SQLite.
 */

import { log } from './logger.js';

/**
 * @typedef {Object} ActionRecord
 * @property {string} id - Unique action identifier
 * @property {number} timestamp - Unix timestamp
 * @property {string} type - Action type (edit, verify, plan)
 * @property {string} description - Human-readable description
 * @property {Object} input - Input data for the action
 * @property {Object|null} output - Output/result of the action
 * @property {boolean} success - Whether the action succeeded
 * @property {string|null} error - Error message if failed
 */

/**
 * @typedef {Object} FileState
 * @property {string} path - File path
 * @property {string} originalHash - Hash of original content
 * @property {string} currentHash - Hash of current content
 * @property {string[]} appliedDiffs - List of applied diff IDs
 * @property {number} lastModified - Last modification timestamp
 */

/**
 * @typedef {Object} SessionState
 * @property {string} sessionId - Unique session identifier
 * @property {number} startTime - Session start timestamp
 * @property {string} intent - Original user intent
 * @property {ActionRecord[]} actions - All actions taken
 * @property {Map<string, FileState>} files - File states
 * @property {number} iteration - Current iteration count
 * @property {string} status - Session status (active, completed, failed)
 */

/**
 * Simple hash function for content comparison.
 * 
 * @param {string} str - String to hash
 * @returns {string} Hash string
 */
function simpleHash(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return hash.toString(16);
}

/**
 * Generates a unique ID.
 * 
 * @returns {string} Unique identifier
 */
function generateId() {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Agent Memory class for tracking state across iterations.
 */
export class AgentMemory {
  constructor() {
    /** @type {SessionState|null} */
    this.session = null;
  }

  /**
   * Starts a new session.
   * 
   * @param {string} intent - The user's intent/instruction
   * @returns {string} Session ID
   */
  startSession(intent) {
    this.session = {
      sessionId: generateId(),
      startTime: Date.now(),
      intent,
      actions: [],
      files: new Map(),
      iteration: 0,
      status: 'active'
    };
    
    log('INFO', `Started session: ${this.session.sessionId}`);
    return this.session.sessionId;
  }

  /**
   * Records an action taken by the agent.
   * 
   * @param {string} type - Action type
   * @param {string} description - Description of the action
   * @param {Object} input - Input data
   * @returns {string} Action ID
   */
  recordAction(type, description, input) {
    if (!this.session) {
      throw new Error('No active session');
    }

    const action = {
      id: generateId(),
      timestamp: Date.now(),
      type,
      description,
      input,
      output: null,
      success: false,
      error: null
    };

    this.session.actions.push(action);
    log('INFO', `Recorded action: ${type} - ${description}`);
    
    return action.id;
  }

  /**
   * Updates an action with its result.
   * 
   * @param {string} actionId - Action ID
   * @param {Object} output - Action output
   * @param {boolean} success - Whether action succeeded
   * @param {string|null} error - Error message if failed
   */
  completeAction(actionId, output, success, error = null) {
    if (!this.session) return;

    const action = this.session.actions.find(a => a.id === actionId);
    if (action) {
      action.output = output;
      action.success = success;
      action.error = error;
    }
  }

  /**
   * Tracks a file's state.
   * 
   * @param {string} filePath - Path to file
   * @param {string} content - File content
   * @param {string} [diffId] - Applied diff ID
   */
  trackFile(filePath, content, diffId = null) {
    if (!this.session) return;

    const hash = simpleHash(content);
    
    if (this.session.files.has(filePath)) {
      const state = this.session.files.get(filePath);
      state.currentHash = hash;
      state.lastModified = Date.now();
      if (diffId) {
        state.appliedDiffs.push(diffId);
      }
    } else {
      this.session.files.set(filePath, {
        path: filePath,
        originalHash: hash,
        currentHash: hash,
        appliedDiffs: diffId ? [diffId] : [],
        lastModified: Date.now()
      });
    }
  }

  /**
   * Increments the iteration counter.
   * 
   * @returns {number} New iteration count
   */
  nextIteration() {
    if (!this.session) return 0;
    this.session.iteration++;
    log('INFO', `Starting iteration ${this.session.iteration}`);
    return this.session.iteration;
  }

  /**
   * Gets the current iteration count.
   * 
   * @returns {number}
   */
  getIteration() {
    return this.session?.iteration ?? 0;
  }

  /**
   * Gets all actions of a specific type.
   * 
   * @param {string} type - Action type to filter
   * @returns {ActionRecord[]}
   */
  getActionsByType(type) {
    return this.session?.actions.filter(a => a.type === type) ?? [];
  }

  /**
   * Gets failed actions.
   * 
   * @returns {ActionRecord[]}
   */
  getFailedActions() {
    return this.session?.actions.filter(a => !a.success) ?? [];
  }

  /**
   * Gets the last N actions.
   * 
   * @param {number} n - Number of actions
   * @returns {ActionRecord[]}
   */
  getRecentActions(n = 5) {
    return this.session?.actions.slice(-n) ?? [];
  }

  /**
   * Generates a summary of the session for LLM context.
   * 
   * @returns {string}
   */
  getSummary() {
    if (!this.session) return 'No active session';

    const lines = [
      `Session: ${this.session.sessionId}`,
      `Intent: ${this.session.intent}`,
      `Iteration: ${this.session.iteration}`,
      `Actions: ${this.session.actions.length}`,
      `Files tracked: ${this.session.files.size}`,
      '',
      'Recent actions:'
    ];

    const recent = this.getRecentActions(5);
    for (const action of recent) {
      const status = action.success ? '✓' : '✗';
      lines.push(`  ${status} [${action.type}] ${action.description}`);
      if (action.error) {
        lines.push(`    Error: ${action.error}`);
      }
    }

    return lines.join('\n');
  }

  /**
   * Generates feedback context for the LLM based on failures.
   * 
   * @returns {string}
   */
  getFailureFeedback() {
    const failed = this.getFailedActions();
    if (failed.length === 0) return '';

    const lines = ['Previous failures to address:'];
    
    for (const action of failed.slice(-3)) {
      lines.push(`- ${action.type}: ${action.description}`);
      if (action.error) {
        lines.push(`  Error: ${action.error}`);
      }
      if (action.output?.stderr) {
        lines.push(`  Output: ${action.output.stderr.slice(0, 200)}`);
      }
    }

    return lines.join('\n');
  }

  /**
   * Ends the current session.
   * 
   * @param {string} status - Final status (completed, failed, aborted)
   */
  endSession(status = 'completed') {
    if (this.session) {
      this.session.status = status;
      log('INFO', `Session ended: ${status}`);
    }
  }

  /**
   * Exports session data as JSON.
   * 
   * @returns {Object}
   */
  exportSession() {
    if (!this.session) return null;

    return {
      ...this.session,
      files: Object.fromEntries(this.session.files)
    };
  }

  /**
   * Clears the current session.
   */
  clear() {
    this.session = null;
  }
}

// Singleton instance
export const memory = new AgentMemory();

export default { AgentMemory, memory };
