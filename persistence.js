/**
 * Persistence Module
 * 
 * Handles saving and loading agent state to/from disk.
 * Phase 3: JSON file-based persistence.
 * Future: SQLite or other storage backends.
 */

import fs from 'fs';
import path from 'path';
import { log } from './logger.js';

/**
 * Default storage directory for agent data
 */
const DEFAULT_STORAGE_DIR = '.vibe-agent';

/**
 * Ensures the storage directory exists.
 * 
 * @param {string} [baseDir] - Base directory (defaults to cwd)
 * @returns {string} Path to storage directory
 */
export function ensureStorageDir(baseDir = process.cwd()) {
  const storageDir = path.join(baseDir, DEFAULT_STORAGE_DIR);
  
  if (!fs.existsSync(storageDir)) {
    fs.mkdirSync(storageDir, { recursive: true });
    log('INFO', `Created storage directory: ${storageDir}`);
  }
  
  return storageDir;
}

/**
 * Saves a session to disk.
 * 
 * @param {Object} session - Session data to save
 * @param {string} [baseDir] - Base directory
 * @returns {string|null} Path to saved file, or null on failure
 */
export function saveSession(session, baseDir = process.cwd()) {
  if (!session || !session.sessionId) {
    log('ERROR', 'Cannot save session: invalid session data');
    return null;
  }

  try {
    const storageDir = ensureStorageDir(baseDir);
    const sessionFile = path.join(storageDir, `session-${session.sessionId}.json`);
    
    // Convert Map to object for JSON serialization
    const serializable = {
      ...session,
      files: session.files instanceof Map 
        ? Object.fromEntries(session.files) 
        : session.files,
      savedAt: Date.now()
    };
    
    fs.writeFileSync(sessionFile, JSON.stringify(serializable, null, 2), 'utf8');
    log('INFO', `Session saved: ${sessionFile}`);
    
    // Also update the latest session pointer
    const latestFile = path.join(storageDir, 'latest-session.json');
    fs.writeFileSync(latestFile, JSON.stringify({ sessionId: session.sessionId }, null, 2), 'utf8');
    
    return sessionFile;
  } catch (err) {
    log('ERROR', `Failed to save session: ${err.message}`);
    return null;
  }
}

/**
 * Loads a session from disk.
 * 
 * @param {string} sessionId - Session ID to load
 * @param {string} [baseDir] - Base directory
 * @returns {Object|null} Session data, or null if not found
 */
export function loadSession(sessionId, baseDir = process.cwd()) {
  try {
    const storageDir = path.join(baseDir, DEFAULT_STORAGE_DIR);
    const sessionFile = path.join(storageDir, `session-${sessionId}.json`);
    
    if (!fs.existsSync(sessionFile)) {
      log('WARN', `Session not found: ${sessionId}`);
      return null;
    }
    
    const data = JSON.parse(fs.readFileSync(sessionFile, 'utf8'));
    
    // Convert files object back to Map
    if (data.files && typeof data.files === 'object') {
      data.files = new Map(Object.entries(data.files));
    }
    
    log('INFO', `Session loaded: ${sessionId}`);
    return data;
  } catch (err) {
    log('ERROR', `Failed to load session: ${err.message}`);
    return null;
  }
}

/**
 * Loads the most recent session.
 * 
 * @param {string} [baseDir] - Base directory
 * @returns {Object|null} Session data, or null if none found
 */
export function loadLatestSession(baseDir = process.cwd()) {
  try {
    const storageDir = path.join(baseDir, DEFAULT_STORAGE_DIR);
    const latestFile = path.join(storageDir, 'latest-session.json');
    
    if (!fs.existsSync(latestFile)) {
      return null;
    }
    
    const { sessionId } = JSON.parse(fs.readFileSync(latestFile, 'utf8'));
    return loadSession(sessionId, baseDir);
  } catch (err) {
    log('ERROR', `Failed to load latest session: ${err.message}`);
    return null;
  }
}

/**
 * Lists all saved sessions.
 * 
 * @param {string} [baseDir] - Base directory
 * @returns {Object[]} Array of session summaries
 */
export function listSessions(baseDir = process.cwd()) {
  try {
    const storageDir = path.join(baseDir, DEFAULT_STORAGE_DIR);
    
    if (!fs.existsSync(storageDir)) {
      return [];
    }
    
    const files = fs.readdirSync(storageDir)
      .filter(f => f.startsWith('session-') && f.endsWith('.json'));
    
    const sessions = [];
    
    for (const file of files) {
      try {
        const data = JSON.parse(fs.readFileSync(path.join(storageDir, file), 'utf8'));
        sessions.push({
          sessionId: data.sessionId,
          intent: data.intent,
          status: data.status,
          startTime: data.startTime,
          savedAt: data.savedAt,
          actionCount: data.actions?.length ?? 0
        });
      } catch {
        // Skip invalid files
      }
    }
    
    // Sort by most recent first
    sessions.sort((a, b) => (b.savedAt || b.startTime) - (a.savedAt || a.startTime));
    
    return sessions;
  } catch (err) {
    log('ERROR', `Failed to list sessions: ${err.message}`);
    return [];
  }
}

/**
 * Deletes a session from disk.
 * 
 * @param {string} sessionId - Session ID to delete
 * @param {string} [baseDir] - Base directory
 * @returns {boolean} Whether deletion succeeded
 */
export function deleteSession(sessionId, baseDir = process.cwd()) {
  try {
    const storageDir = path.join(baseDir, DEFAULT_STORAGE_DIR);
    const sessionFile = path.join(storageDir, `session-${sessionId}.json`);
    
    if (fs.existsSync(sessionFile)) {
      fs.unlinkSync(sessionFile);
      log('INFO', `Session deleted: ${sessionId}`);
      return true;
    }
    
    return false;
  } catch (err) {
    log('ERROR', `Failed to delete session: ${err.message}`);
    return false;
  }
}

/**
 * Saves conversation history for a session.
 * 
 * @param {string} sessionId - Session ID
 * @param {Object[]} messages - Array of conversation messages
 * @param {string} [baseDir] - Base directory
 * @returns {boolean} Whether save succeeded
 */
export function saveConversation(sessionId, messages, baseDir = process.cwd()) {
  try {
    const storageDir = ensureStorageDir(baseDir);
    const convFile = path.join(storageDir, `conversation-${sessionId}.json`);
    
    fs.writeFileSync(convFile, JSON.stringify(messages, null, 2), 'utf8');
    return true;
  } catch (err) {
    log('ERROR', `Failed to save conversation: ${err.message}`);
    return false;
  }
}

/**
 * Loads conversation history for a session.
 * 
 * @param {string} sessionId - Session ID
 * @param {string} [baseDir] - Base directory
 * @returns {Object[]} Array of messages
 */
export function loadConversation(sessionId, baseDir = process.cwd()) {
  try {
    const storageDir = path.join(baseDir, DEFAULT_STORAGE_DIR);
    const convFile = path.join(storageDir, `conversation-${sessionId}.json`);
    
    if (!fs.existsSync(convFile)) {
      return [];
    }
    
    return JSON.parse(fs.readFileSync(convFile, 'utf8'));
  } catch (err) {
    log('ERROR', `Failed to load conversation: ${err.message}`);
    return [];
  }
}

/**
 * Cleans up old sessions (keeps last N).
 * 
 * @param {number} [keepCount=10] - Number of sessions to keep
 * @param {string} [baseDir] - Base directory
 * @returns {number} Number of sessions deleted
 */
export function cleanupOldSessions(keepCount = 10, baseDir = process.cwd()) {
  const sessions = listSessions(baseDir);
  
  if (sessions.length <= keepCount) {
    return 0;
  }
  
  const toDelete = sessions.slice(keepCount);
  let deleted = 0;
  
  for (const session of toDelete) {
    if (deleteSession(session.sessionId, baseDir)) {
      deleted++;
    }
  }
  
  log('INFO', `Cleaned up ${deleted} old session(s)`);
  return deleted;
}

export default {
  ensureStorageDir,
  saveSession,
  loadSession,
  loadLatestSession,
  listSessions,
  deleteSession,
  saveConversation,
  loadConversation,
  cleanupOldSessions
};
