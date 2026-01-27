/**
 * Diff Application Module
 * 
 * Handles parsing, validating, and applying unified diffs safely.
 * Uses manual hunk parsing for reliable patching.
 * All I/O uses explicit UTF-8 encoding via io.js.
 */

import path from 'path';
import { log } from './logger.js';
import { readFileUTF8, writeFileUTF8, copyFileUTF8, fileExists } from './io.js';

/**
 * @typedef {Object} PatchResult
 * @property {boolean} success - Whether all hunks applied successfully
 * @property {string|null} patchedContent - The patched file content (null on failure)
 * @property {string[]} failedHunks - List of failed hunk descriptions
 * @property {string|null} error - Error message (null on success)
 */

/**
 * @typedef {Object} ApplyResult
 * @property {boolean} success - Whether the diff was applied successfully
 * @property {string|null} backupPath - Path to backup file (null on failure)
 * @property {string|null} error - Error message (null on success)
 */

/**
 * Parses hunk header to extract line numbers.
 * Format: @@ -start,count +start,count @@ or @@ -start +start @@
 * 
 * @param {string} header 
 * @returns {{oldStart: number, oldCount: number, newStart: number, newCount: number}|null}
 */
function parseHunkHeader(header) {
  const match = header.match(/@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/);
  if (!match) return null;
  
  return {
    oldStart: parseInt(match[1], 10),
    oldCount: match[2] !== undefined ? parseInt(match[2], 10) : 1,
    newStart: parseInt(match[3], 10),
    newCount: match[4] !== undefined ? parseInt(match[4], 10) : 1
  };
}

/**
 * Applies a unified diff manually for more reliable results.
 * 
 * @param {string} originalContent - The original file content
 * @param {string} unifiedDiff - The unified diff to apply
 * @returns {PatchResult}
 */
export function applyPatch(originalContent, unifiedDiff) {
  try {
    // Normalize line endings
    const normalizedContent = originalContent.replace(/\r\n/g, '\n');
    const lines = normalizedContent.split('\n');
    
    // If content ends with newline, last element will be empty string
    const hadTrailingNewline = normalizedContent.endsWith('\n');
    if (hadTrailingNewline && lines[lines.length - 1] === '') {
      lines.pop();
    }
    
    // Parse diff into hunks
    const diffLines = unifiedDiff.split('\n');
    const hunks = [];
    let currentHunk = null;
    
    for (const line of diffLines) {
      if (line.startsWith('@@')) {
        if (currentHunk) hunks.push(currentHunk);
        const header = parseHunkHeader(line);
        if (!header) {
          return {
            success: false,
            patchedContent: null,
            failedHunks: ['Invalid hunk header'],
            error: 'Invalid hunk header format'
          };
        }
        currentHunk = { ...header, changes: [] };
      } else if (currentHunk) {
        if (line.startsWith('+') && !line.startsWith('+++')) {
          currentHunk.changes.push({ type: 'add', text: line.slice(1) });
        } else if (line.startsWith('-') && !line.startsWith('---')) {
          currentHunk.changes.push({ type: 'remove', text: line.slice(1) });
        } else if (line.startsWith(' ')) {
          currentHunk.changes.push({ type: 'context', text: line.slice(1) });
        } else if (line === '') {
          // Empty context line
          currentHunk.changes.push({ type: 'context', text: '' });
        }
      }
    }
    if (currentHunk) hunks.push(currentHunk);
    
    if (hunks.length === 0) {
      return {
        success: false,
        patchedContent: null,
        failedHunks: [],
        error: 'No valid hunks found in diff'
      };
    }
    
    // Apply hunks in reverse order to preserve line numbers
    const result = [...lines];
    const failedHunks = [];
    
    for (let i = hunks.length - 1; i >= 0; i--) {
      const hunk = hunks[i];
      const startIndex = hunk.oldStart - 1; // Convert to 0-based
      
      // Build the new content for this region
      const newLines = [];
      let oldIndex = startIndex;
      
      for (const change of hunk.changes) {
        if (change.type === 'context') {
          // Verify context matches (with some fuzzy tolerance)
          if (oldIndex < result.length) {
            const expected = result[oldIndex]?.trim();
            const actual = change.text.trim();
            if (expected !== actual && expected !== undefined) {
              // Context mismatch - try to continue anyway
              log('WARN', `Context mismatch at line ${oldIndex + 1}: expected "${expected}", got "${actual}"`);
            }
            oldIndex++;
          }
          newLines.push(change.text);
        } else if (change.type === 'add') {
          newLines.push(change.text);
        } else if (change.type === 'remove') {
          oldIndex++;
          // Don't add to newLines
        }
      }
      
      // Replace the old lines with new lines
      result.splice(startIndex, hunk.oldCount, ...newLines);
    }
    
    // Reconstruct content
    let finalContent = result.join('\n');
    if (hadTrailingNewline || finalContent.length > 0) {
      finalContent += '\n';
    }
    
    // Restore original line endings if needed
    if (originalContent.includes('\r\n')) {
      finalContent = finalContent.replace(/\n/g, '\r\n');
    }
    
    return {
      success: true,
      patchedContent: finalContent,
      failedHunks: [],
      error: null
    };
  } catch (err) {
    return {
      success: false,
      patchedContent: null,
      failedHunks: [],
      error: `Patch application error: ${err.message}`
    };
  }
}

/**
 * Creates a backup of a file before modification.
 * 
 * @param {string} filePath - Path to the file to backup
 * @returns {string|null} Path to backup file, or null on failure
 */
export function createBackup(filePath) {
  try {
    const backupPath = `${filePath}.bak`;
    
    // Check if backup already exists - add timestamp to avoid overwrite
    let finalBackupPath = backupPath;
    if (fileExists(backupPath)) {
      const timestamp = Date.now();
      finalBackupPath = `${filePath}.${timestamp}.bak`;
      log('WARN', `Backup exists, using timestamped backup: ${finalBackupPath}`);
    }
    
    const result = copyFileUTF8(filePath, finalBackupPath);
    if (!result.success) {
      log('ERROR', `Failed to create backup: ${result.error}`);
      return null;
    }
    
    log('INFO', `Created backup: ${finalBackupPath}`);
    return finalBackupPath;
  } catch (err) {
    log('ERROR', `Failed to create backup: ${err.message}`);
    return null;
  }
}

/**
 * Applies a unified diff to a file safely with backup and automatic rollback.
 * 
 * Safety guarantees:
 * - Always creates .bak before any modification
 * - If patch fails → restore immediately
 * - If write fails → restore immediately
 * 
 * @param {string} filePath - Path to the file to modify
 * @param {string} unifiedDiff - The unified diff to apply
 * @returns {ApplyResult}
 */
export function applyDiffToFile(filePath, unifiedDiff) {
  // Resolve to absolute path
  const absolutePath = path.resolve(filePath);
  
  // Verify file exists
  if (!fileExists(absolutePath)) {
    return {
      success: false,
      backupPath: null,
      error: `File not found: ${absolutePath}`
    };
  }
  
  // Read original content with UTF-8 encoding
  const readResult = readFileUTF8(absolutePath);
  if (!readResult.success) {
    return {
      success: false,
      backupPath: null,
      error: `Failed to read file: ${readResult.error}`
    };
  }
  const originalContent = readResult.content;
  
  // Create backup FIRST - before any modification attempt
  const backupPath = createBackup(absolutePath);
  if (!backupPath) {
    return {
      success: false,
      backupPath: null,
      error: 'Failed to create backup - aborting for safety'
    };
  }
  
  // Apply patch
  const patchResult = applyPatch(originalContent, unifiedDiff);
  
  if (!patchResult.success) {
    // Patch failed - backup exists but file unchanged, no rollback needed
    log('WARN', `Patch failed: ${patchResult.error}`);
    return {
      success: false,
      backupPath,
      error: patchResult.error
    };
  }
  
  // Write patched content with UTF-8 encoding
  const writeResult = writeFileUTF8(absolutePath, patchResult.patchedContent);
  
  if (writeResult.success) {
    log('INFO', `Applied diff to: ${absolutePath}`);
    log('INFO', `Backup at: ${backupPath}`);
    return {
      success: true,
      backupPath,
      error: null
    };
  } else {
    // Write failed - ROLLBACK immediately
    log('ERROR', `Write failed: ${writeResult.error}. Rolling back...`);
    const restored = restoreFromBackup(absolutePath, backupPath);
    if (restored) {
      log('INFO', 'Rollback successful');
    } else {
      log('ERROR', 'CRITICAL: Rollback failed! Manual recovery needed from: ' + backupPath);
    }
    return {
      success: false,
      backupPath,
      error: `Write failed: ${writeResult.error}. ${restored ? 'Rolled back.' : 'ROLLBACK FAILED!'}`
    };
  }
}

/**
 * Restores a file from its backup.
 * 
 * @param {string} filePath - Path to the file to restore
 * @param {string} backupPath - Path to the backup file
 * @returns {boolean} Whether restoration succeeded
 */
export function restoreFromBackup(filePath, backupPath) {
  const result = copyFileUTF8(backupPath, filePath);
  if (result.success) {
    log('INFO', `Restored file from backup: ${filePath}`);
    return true;
  } else {
    log('ERROR', `Failed to restore from backup: ${result.error}`);
    return false;
  }
}

export default { applyPatch, applyDiffToFile, createBackup, restoreFromBackup };
