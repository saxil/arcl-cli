/**
 * Configuration Module (v2.3)
 * 
 * User-defined guardrails via .arcl/config.json
 * 
 * Policies:
 * - allow_full_rewrites: Permit diffs that replace entire files
 * - forbid_patterns: Regex patterns to reject in LLM output
 * - max_diff_lines: Maximum lines in a single diff
 * - require_confirmation: Always ask before applying (default true)
 */

import path from 'path';
import { readFileUTF8, writeFileUTF8, fileExists } from './io.js';
import { getArclDir, ensureArclDir } from './history.js';

/**
 * @typedef {Object} Config
 * @property {boolean} allow_full_rewrites - Allow diffs that replace entire files
 * @property {string[]} forbid_patterns - Regex patterns to reject
 * @property {number} max_diff_lines - Max lines per diff (0 = unlimited)
 * @property {boolean} require_confirmation - Always confirm before applying
 */

/**
 * Default configuration.
 */
const DEFAULT_CONFIG = {
  allow_full_rewrites: false,
  forbid_patterns: ['eval\\(', 'exec\\(', '__import__\\('],
  max_diff_lines: 500,
  require_confirmation: true
};

/**
 * Gets the config file path.
 * 
 * @returns {string}
 */
export function getConfigPath() {
  return path.join(getArclDir(), 'config.json');
}

/**
 * Loads configuration from .arcl/config.json.
 * Returns default config if file doesn't exist.
 * 
 * @returns {{success: boolean, config?: Config, error?: string}}
 */
export function loadConfig() {
  const configPath = getConfigPath();
  
  if (!fileExists(configPath)) {
    return { success: true, config: { ...DEFAULT_CONFIG } };
  }
  
  const readResult = readFileUTF8(configPath);
  if (!readResult.success) {
    return { success: false, error: readResult.error };
  }
  
  try {
    const userConfig = JSON.parse(readResult.content);
    // Merge with defaults
    const config = { ...DEFAULT_CONFIG, ...userConfig };
    return { success: true, config };
  } catch (err) {
    return { success: false, error: `Invalid config file: ${err.message}` };
  }
}

/**
 * Creates default config file if it doesn't exist.
 * 
 * @returns {{success: boolean, error?: string}}
 */
export function initConfig() {
  const dirResult = ensureArclDir();
  if (!dirResult.success) {
    return { success: false, error: dirResult.error };
  }
  
  const configPath = getConfigPath();
  if (fileExists(configPath)) {
    return { success: true }; // Already exists
  }
  
  const content = JSON.stringify(DEFAULT_CONFIG, null, 2);
  return writeFileUTF8(configPath, content);
}

/**
 * Validates a diff against configuration policies.
 * 
 * @param {string} diff - The diff to validate
 * @param {Config} config - The configuration
 * @returns {{valid: boolean, error?: string}}
 */
export function validateAgainstPolicy(diff, config) {
  if (!diff) {
    return { valid: true };
  }
  
  // Check forbidden patterns
  if (config.forbid_patterns && config.forbid_patterns.length > 0) {
    for (const pattern of config.forbid_patterns) {
      try {
        const regex = new RegExp(pattern, 'i');
        if (regex.test(diff)) {
          return { 
            valid: false, 
            error: `Policy violation: diff contains forbidden pattern '${pattern}'`
          };
        }
      } catch (e) {
        // Invalid regex, skip
        console.error(`Warning: Invalid forbid_pattern: ${pattern}`);
      }
    }
  }
  
  // Check max diff lines
  if (config.max_diff_lines > 0) {
    const lineCount = diff.split('\n').length;
    if (lineCount > config.max_diff_lines) {
      return {
        valid: false,
        error: `Policy violation: diff has ${lineCount} lines, max is ${config.max_diff_lines}`
      };
    }
  }
  
  // Check full rewrite
  if (!config.allow_full_rewrites) {
    const lines = diff.split('\n');
    const deletions = lines.filter(l => l.startsWith('-') && !l.startsWith('---')).length;
    const additions = lines.filter(l => l.startsWith('+') && !l.startsWith('+++')).length;
    
    // Heuristic: if we're deleting >90% and adding >90% of similar size, it's a rewrite
    if (deletions > 20 && additions > 20) {
      const ratio = Math.min(deletions, additions) / Math.max(deletions, additions);
      if (ratio > 0.5) {
        return {
          valid: false,
          error: `Policy violation: suspected full rewrite (${deletions} deletions, ${additions} additions). Set allow_full_rewrites: true to permit.`
        };
      }
    }
  }
  
  return { valid: true };
}

/**
 * Gets the current configuration (for display).
 * 
 * @returns {Config}
 */
export function getConfig() {
  const result = loadConfig();
  return result.success ? result.config : DEFAULT_CONFIG;
}

export default {
  getConfigPath,
  loadConfig,
  initConfig,
  validateAgainstPolicy,
  getConfig,
  DEFAULT_CONFIG
};
