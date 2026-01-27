/**
 * Global UTF-8 I/O Module
 * 
 * Enforces consistent encoding across all file operations.
 * Eliminates encoding corruption (BOM issues, broken characters).
 * 
 * Rules:
 * - All reads use UTF-8 explicitly
 * - All writes use UTF-8 explicitly
 * - Line endings normalized to LF (\n)
 * - No reliance on OS defaults
 */

import fs from 'fs';
import path from 'path';

/**
 * Reads a file with explicit UTF-8 encoding.
 * Strips BOM if present. Normalizes line endings to LF.
 * 
 * @param {string} filePath - Absolute path to file
 * @returns {{success: boolean, content?: string, error?: string}}
 */
export function readFileUTF8(filePath) {
  try {
    const absolutePath = path.resolve(filePath);
    let content = fs.readFileSync(absolutePath, { encoding: 'utf8' });
    
    // Strip UTF-8 BOM if present
    if (content.charCodeAt(0) === 0xFEFF) {
      content = content.slice(1);
    }
    
    // Normalize line endings to LF
    content = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    
    return { success: true, content };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * Writes content to a file with explicit UTF-8 encoding.
 * Normalizes line endings to LF. No BOM.
 * 
 * @param {string} filePath - Absolute path to file
 * @param {string} content - Content to write
 * @returns {{success: boolean, error?: string}}
 */
export function writeFileUTF8(filePath, content) {
  try {
    const absolutePath = path.resolve(filePath);
    
    // Ensure parent directory exists
    const dir = path.dirname(absolutePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    // Normalize line endings to LF
    const normalizedContent = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    
    // Write with explicit UTF-8, no BOM
    fs.writeFileSync(absolutePath, normalizedContent, { encoding: 'utf8' });
    
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * Copies a file preserving UTF-8 encoding.
 * 
 * @param {string} srcPath - Source file path
 * @param {string} destPath - Destination file path
 * @returns {{success: boolean, error?: string}}
 */
export function copyFileUTF8(srcPath, destPath) {
  try {
    const absoluteSrc = path.resolve(srcPath);
    const absoluteDest = path.resolve(destPath);
    
    // Ensure destination directory exists
    const dir = path.dirname(absoluteDest);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    fs.copyFileSync(absoluteSrc, absoluteDest);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * Checks if a file exists.
 * 
 * @param {string} filePath - Path to check
 * @returns {boolean}
 */
export function fileExists(filePath) {
  try {
    return fs.existsSync(path.resolve(filePath));
  } catch {
    return false;
  }
}

/**
 * Deletes a file.
 * 
 * @param {string} filePath - Path to delete
 * @returns {{success: boolean, error?: string}}
 */
export function deleteFile(filePath) {
  try {
    fs.unlinkSync(path.resolve(filePath));
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * Creates a directory recursively.
 * 
 * @param {string} dirPath - Path to create
 * @returns {{success: boolean, error?: string}}
 */
export function ensureDir(dirPath) {
  try {
    fs.mkdirSync(path.resolve(dirPath), { recursive: true });
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * Removes a directory recursively.
 * 
 * @param {string} dirPath - Path to remove
 * @returns {{success: boolean, error?: string}}
 */
export function removeDir(dirPath) {
  try {
    fs.rmSync(path.resolve(dirPath), { recursive: true, force: true });
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

export default {
  readFileUTF8,
  writeFileUTF8,
  copyFileUTF8,
  fileExists,
  deleteFile,
  ensureDir,
  removeDir
};
