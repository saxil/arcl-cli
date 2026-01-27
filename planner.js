/**
 * Planner Module
 * 
 * Handles multi-file planning and task decomposition.
 * Converts high-level intent into actionable edit plans.
 */

import fs from 'fs';
import path from 'path';
import { log } from './logger.js';

/**
 * @typedef {Object} FileEdit
 * @property {string} filePath - Path to file to edit
 * @property {string} instruction - Specific instruction for this file
 * @property {number} priority - Edit priority (lower = first)
 * @property {string[]} dependencies - File paths this edit depends on
 */

/**
 * @typedef {Object} EditPlan
 * @property {string} intent - Original user intent
 * @property {FileEdit[]} edits - Ordered list of file edits
 * @property {string[]} verifyCommands - Commands to run after edits
 * @property {string} summary - Human-readable plan summary
 */

/**
 * @typedef {Object} ProjectContext
 * @property {string} rootDir - Project root directory
 * @property {string[]} files - List of relevant file paths
 * @property {Map<string, string>} contents - File path -> content map
 * @property {Object} packageJson - Parsed package.json if exists
 */

/**
 * Reads project context from a directory.
 * 
 * @param {string} rootDir - Project root directory
 * @param {string[]} [targetFiles] - Specific files to include
 * @returns {Promise<ProjectContext>}
 */
export async function gatherProjectContext(rootDir, targetFiles = []) {
  const context = {
    rootDir: path.resolve(rootDir),
    files: [],
    contents: new Map(),
    packageJson: null
  };

  // Try to read package.json
  const pkgPath = path.join(context.rootDir, 'package.json');
  if (fs.existsSync(pkgPath)) {
    try {
      context.packageJson = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    } catch (err) {
      log('WARN', `Failed to parse package.json: ${err.message}`);
    }
  }

  // Read target files
  for (const filePath of targetFiles) {
    const absPath = path.isAbsolute(filePath) 
      ? filePath 
      : path.join(context.rootDir, filePath);
    
    if (fs.existsSync(absPath)) {
      try {
        const content = fs.readFileSync(absPath, 'utf8');
        context.files.push(absPath);
        context.contents.set(absPath, content);
      } catch (err) {
        log('WARN', `Failed to read ${filePath}: ${err.message}`);
      }
    } else {
      log('WARN', `File not found: ${filePath}`);
    }
  }

  return context;
}

/**
 * Discovers related files that might need edits.
 * Looks for imports, requires, and common patterns.
 * 
 * @param {string} filePath - Starting file path
 * @param {string} content - File content
 * @returns {string[]} Related file paths
 */
export function discoverRelatedFiles(filePath, content) {
  const related = [];
  const dir = path.dirname(filePath);
  
  // Find ES module imports
  const importRegex = /import\s+.*?\s+from\s+['"](.+?)['"]/g;
  let match;
  while ((match = importRegex.exec(content)) !== null) {
    const importPath = match[1];
    if (importPath.startsWith('.')) {
      const resolved = resolveLocalImport(dir, importPath);
      if (resolved) related.push(resolved);
    }
  }

  // Find CommonJS requires
  const requireRegex = /require\s*\(\s*['"](.+?)['"]\s*\)/g;
  while ((match = requireRegex.exec(content)) !== null) {
    const requirePath = match[1];
    if (requirePath.startsWith('.')) {
      const resolved = resolveLocalImport(dir, requirePath);
      if (resolved) related.push(resolved);
    }
  }

  return [...new Set(related)];
}

/**
 * Resolves a local import path to an absolute file path.
 * 
 * @param {string} fromDir - Directory of importing file
 * @param {string} importPath - Import path
 * @returns {string|null}
 */
function resolveLocalImport(fromDir, importPath) {
  const extensions = ['.js', '.ts', '.jsx', '.tsx', '.mjs', '.cjs', ''];
  const basePath = path.join(fromDir, importPath);

  for (const ext of extensions) {
    const fullPath = basePath + ext;
    if (fs.existsSync(fullPath) && fs.statSync(fullPath).isFile()) {
      return fullPath;
    }
  }

  // Try index file
  for (const ext of extensions) {
    const indexPath = path.join(basePath, `index${ext}`);
    if (fs.existsSync(indexPath)) {
      return indexPath;
    }
  }

  return null;
}

/**
 * Parses a multi-file plan from LLM response.
 * Expected format:
 * ```
 * PLAN:
 * 1. [file.js] instruction for file
 * 2. [other.js] instruction for other file
 * VERIFY:
 * - npm test
 * - npm run lint
 * ```
 * 
 * @param {string} llmResponse - Raw LLM response
 * @param {string} rootDir - Project root for path resolution
 * @returns {EditPlan|null}
 */
export function parsePlan(llmResponse, rootDir) {
  const lines = llmResponse.split('\n');
  const edits = [];
  const verifyCommands = [];
  let inPlan = false;
  let inVerify = false;
  let priority = 0;

  for (const line of lines) {
    const trimmed = line.trim();
    
    if (trimmed.toUpperCase().startsWith('PLAN:')) {
      inPlan = true;
      inVerify = false;
      continue;
    }
    
    if (trimmed.toUpperCase().startsWith('VERIFY:')) {
      inPlan = false;
      inVerify = true;
      continue;
    }

    if (inPlan) {
      // Match: 1. [file.js] instruction
      const match = trimmed.match(/^\d+\.\s*\[([^\]]+)\]\s*(.+)$/);
      if (match) {
        const [, filePath, instruction] = match;
        edits.push({
          filePath: path.isAbsolute(filePath) ? filePath : path.join(rootDir, filePath),
          instruction: instruction.trim(),
          priority: priority++,
          dependencies: []
        });
      }
    }

    if (inVerify) {
      // Match: - command or * command
      const match = trimmed.match(/^[-*]\s*(.+)$/);
      if (match) {
        verifyCommands.push(match[1].trim());
      }
    }
  }

  if (edits.length === 0) {
    return null;
  }

  return {
    intent: '',
    edits,
    verifyCommands,
    summary: `Plan: ${edits.length} file(s) to edit, ${verifyCommands.length} verification command(s)`
  };
}

/**
 * Generates a plan prompt for the LLM.
 * 
 * @param {string} intent - User's intent
 * @param {ProjectContext} context - Project context
 * @returns {string}
 */
export function generatePlanPrompt(intent, context) {
  const lines = [
    'You are a code planning assistant. Analyze the request and create an edit plan.',
    '',
    '## User Intent',
    intent,
    '',
    '## Project Context',
  ];

  if (context.packageJson) {
    lines.push(`Project: ${context.packageJson.name || 'unknown'}`);
    if (context.packageJson.scripts) {
      lines.push(`Available scripts: ${Object.keys(context.packageJson.scripts).join(', ')}`);
    }
  }

  lines.push('', '## Files');
  
  for (const [filePath, content] of context.contents) {
    const relativePath = path.relative(context.rootDir, filePath);
    const lineCount = content.split('\n').length;
    lines.push(`- ${relativePath} (${lineCount} lines)`);
  }

  lines.push('', '## Instructions');
  lines.push('Create a plan in this exact format:');
  lines.push('');
  lines.push('PLAN:');
  lines.push('1. [filename.js] Specific instruction for this file');
  lines.push('2. [other.js] Specific instruction for this file');
  lines.push('');
  lines.push('VERIFY:');
  lines.push('- command to verify changes work');
  lines.push('');
  lines.push('Rules:');
  lines.push('- List files in dependency order (edit dependencies first)');
  lines.push('- Be specific about what to change in each file');
  lines.push('- Include verification commands if applicable');

  return lines.join('\n');
}

/**
 * Orders edits by dependencies (topological sort).
 * 
 * @param {FileEdit[]} edits - Unordered edits
 * @returns {FileEdit[]} Ordered edits
 */
export function orderEditsByDependency(edits) {
  // Simple sort by priority for now
  // TODO: Implement proper topological sort based on dependencies
  return [...edits].sort((a, b) => a.priority - b.priority);
}

/**
 * Validates that all files in a plan exist.
 * 
 * @param {EditPlan} plan - The plan to validate
 * @returns {{valid: boolean, missing: string[]}}
 */
export function validatePlan(plan) {
  const missing = [];
  
  for (const edit of plan.edits) {
    if (!fs.existsSync(edit.filePath)) {
      missing.push(edit.filePath);
    }
  }

  return {
    valid: missing.length === 0,
    missing
  };
}

export default {
  gatherProjectContext,
  discoverRelatedFiles,
  parsePlan,
  generatePlanPrompt,
  orderEditsByDependency,
  validatePlan
};
