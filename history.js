/**
 * Change History Module
 * 
 * Tracks all GLM operations for traceability and debugging.
 * History is append-only, stored in .glm/history.json
 */

import path from 'path';
import { readFileUTF8, writeFileUTF8, ensureDir, fileExists } from './io.js';
import { getDefaultWorkspaceRoot } from './workspace.js';

/**
 * @typedef {Object} HistoryEntry
 * @property {string} timestamp - ISO 8601 timestamp
 * @property {string} command - Command type (add, edit, remove, create, ask)
 * @property {string[]} files - Files affected
 * @property {string} instruction - User instruction or question
 * @property {string} provider - LLM provider used
 * @property {string} result - success | rejected | failed | dry-run
 * @property {string} [error] - Error message if failed
 */

/**
 * Gets the .glm directory path for the current context.
 * Uses workspace root for project-level history.
 * 
 * @returns {string}
 */
export function getGlmDir() {
  const workspaceRoot = getDefaultWorkspaceRoot();
  return path.join(workspaceRoot, '.glm');
}

/**
 * Gets the history file path.
 * 
 * @returns {string}
 */
export function getHistoryPath() {
  return path.join(getGlmDir(), 'history.json');
}

/**
 * Gets the backups directory path.
 * 
 * @returns {string}
 */
export function getBackupsDir() {
  return path.join(getGlmDir(), 'backups');
}

/**
 * Ensures .glm directory structure exists.
 * 
 * @returns {{success: boolean, error?: string}}
 */
export function ensureGlmDir() {
  const glmDir = getGlmDir();
  const backupsDir = getBackupsDir();
  
  let result = ensureDir(glmDir);
  if (!result.success) return result;
  
  result = ensureDir(backupsDir);
  return result;
}

/**
 * Reads the current history.
 * 
 * @returns {{success: boolean, entries?: HistoryEntry[], error?: string}}
 */
export function readHistory() {
  const historyPath = getHistoryPath();
  
  if (!fileExists(historyPath)) {
    return { success: true, entries: [] };
  }
  
  const readResult = readFileUTF8(historyPath);
  if (!readResult.success) {
    return { success: false, error: readResult.error };
  }
  
  try {
    const entries = JSON.parse(readResult.content);
    return { success: true, entries };
  } catch (err) {
    return { success: false, error: `Invalid history file: ${err.message}` };
  }
}

/**
 * Appends an entry to history.
 * 
 * @param {HistoryEntry} entry 
 * @returns {{success: boolean, error?: string}}
 */
export function appendHistory(entry) {
  // Ensure .glm directory exists
  const dirResult = ensureGlmDir();
  if (!dirResult.success) {
    console.error(`Warning: Could not create .glm directory: ${dirResult.error}`);
    return { success: false, error: dirResult.error };
  }
  
  // Read existing history
  const readResult = readHistory();
  const entries = readResult.success ? readResult.entries : [];
  
  // Add timestamp if not present
  if (!entry.timestamp) {
    entry.timestamp = new Date().toISOString();
  }
  
  // Append new entry
  entries.push(entry);
  
  // Write back
  const historyPath = getHistoryPath();
  const content = JSON.stringify(entries, null, 2);
  const writeResult = writeFileUTF8(historyPath, content);
  
  if (!writeResult.success) {
    console.error(`Warning: Could not write history: ${writeResult.error}`);
    return { success: false, error: writeResult.error };
  }
  
  return { success: true };
}

/**
 * Records a command execution.
 * 
 * @param {Object} params
 * @param {string} params.command - Command type
 * @param {string|string[]} params.files - File(s) affected
 * @param {string} params.instruction - User instruction
 * @param {string} params.provider - Provider used
 * @param {string} params.result - Result status
 * @param {string} [params.error] - Error message if failed
 * @returns {{success: boolean, error?: string}}
 */
export function recordCommand({ command, files, instruction, provider, result, error }) {
  const entry = {
    timestamp: new Date().toISOString(),
    command,
    files: Array.isArray(files) ? files : [files],
    instruction: instruction || '',
    provider: provider || 'unknown',
    result
  };
  
  if (error) {
    entry.error = error;
  }
  
  return appendHistory(entry);
}

/**
 * Gets the provider name from environment.
 * 
 * @returns {string}
 */
export function getCurrentProvider() {
  const provider = process.env.GLM_PROVIDER || 'gemini';
  return provider;
}

/**
 * Gets the last N history entries.
 * 
 * @param {number} count - Number of entries to return
 * @returns {{success: boolean, entries?: HistoryEntry[], error?: string}}
 */
export function getLastEntries(count = 1) {
  const result = readHistory();
  if (!result.success) return result;
  
  const entries = result.entries.slice(-count);
  return { success: true, entries };
}

/**
 * Gets history entries for a specific file.
 * 
 * @param {string} filePath - File path to filter by
 * @returns {{success: boolean, entries?: HistoryEntry[], error?: string}}
 */
export function getEntriesForFile(filePath) {
  const result = readHistory();
  if (!result.success) return result;
  
  const normalized = path.basename(filePath);
  const entries = result.entries.filter(e => 
    e.files && e.files.some(f => f.includes(normalized) || normalized.includes(path.basename(f)))
  );
  
  return { success: true, entries };
}

export default {
  getGlmDir,
  getHistoryPath,
  getBackupsDir,
  ensureGlmDir,
  readHistory,
  appendHistory,
  recordCommand,
  getCurrentProvider,
  getLastEntries,
  getEntriesForFile
};
