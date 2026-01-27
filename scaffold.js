/**
 * Project Scaffolding Module
 * 
 * Handles multi-file project creation with fixed schemas.
 * Runtime owns structure, LLM fills content.
 */

import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { getDefaultWorkspaceRoot, ensureWorkspaceRoot } from './workspace.js';

/**
 * Project schema definitions.
 * Runtime defines allowed structure, model fills content.
 */
const PROJECT_SCHEMAS = {
  python: {
    name: 'Python Project',
    detect: (desc) => /python|tkinter|flask|django|fastapi|pygame|script/i.test(desc),
    folders: ['src'],
    files: [
      { path: 'README.md', description: 'Project documentation' },
      { path: 'requirements.txt', description: 'Python dependencies' },
      { path: 'src/main.py', description: 'Main application entry point' },
      { path: '.gitignore', description: 'Git ignore file for Python' }
    ],
    venvSupported: true
  },
  node: {
    name: 'Node.js Project',
    detect: (desc) => /node|javascript|express|react|vue|next|typescript/i.test(desc),
    folders: ['src'],
    files: [
      { path: 'README.md', description: 'Project documentation' },
      { path: 'package.json', description: 'Node.js package manifest' },
      { path: 'src/index.js', description: 'Main application entry point' },
      { path: '.gitignore', description: 'Git ignore file for Node.js' }
    ],
    venvSupported: false
  },
  web: {
    name: 'Web Project',
    detect: (desc) => /html|css|website|webpage|landing/i.test(desc),
    folders: ['css', 'js'],
    files: [
      { path: 'README.md', description: 'Project documentation' },
      { path: 'index.html', description: 'Main HTML page' },
      { path: 'css/style.css', description: 'Stylesheet' },
      { path: 'js/main.js', description: 'JavaScript code' },
      { path: '.gitignore', description: 'Git ignore file' }
    ],
    venvSupported: false
  },
  generic: {
    name: 'Generic Project',
    detect: () => true, // Fallback
    folders: ['src'],
    files: [
      { path: 'README.md', description: 'Project documentation' },
      { path: 'src/main.txt', description: 'Main file' },
      { path: '.gitignore', description: 'Git ignore file' }
    ],
    venvSupported: false
  }
};

/**
 * Detects project type from description.
 * 
 * @param {string} description 
 * @returns {Object} Schema object
 */
export function detectProjectType(description) {
  for (const [key, schema] of Object.entries(PROJECT_SCHEMAS)) {
    if (key !== 'generic' && schema.detect(description)) {
      return { type: key, schema };
    }
  }
  return { type: 'generic', schema: PROJECT_SCHEMAS.generic };
}

/**
 * Extracts project name from description.
 * 
 * @param {string} description 
 * @returns {string}
 */
export function extractProjectName(description) {
  // Try to find explicit name patterns
  const patterns = [
    /(?:called|named)\s+["']?([a-zA-Z0-9_-]+)["']?/i,
    /["']([a-zA-Z0-9_-]+)["']\s+(?:app|project|application)/i,
    /^([a-zA-Z0-9_-]+)\s+(?:app|project|application)/i
  ];
  
  for (const pattern of patterns) {
    const match = description.match(pattern);
    if (match) {
      return match[1].toLowerCase().replace(/\s+/g, '-');
    }
  }
  
  // Generate from keywords
  const words = description
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .split(/\s+/)
    .filter(w => w.length > 2 && !['the', 'and', 'for', 'with', 'using', 'app', 'project', 'application'].includes(w))
    .slice(0, 2);
  
  if (words.length > 0) {
    return words.join('-') + '-app';
  }
  
  return 'my-project';
}

/**
 * Plans project creation.
 * 
 * @param {string} description 
 * @returns {Object} Plan object
 */
export function planProject(description) {
  const { type, schema } = detectProjectType(description);
  const projectName = extractProjectName(description);
  const workspaceRoot = getDefaultWorkspaceRoot();
  const projectPath = path.join(workspaceRoot, projectName);
  
  return {
    projectName,
    projectPath,
    projectType: type,
    schemaName: schema.name,
    folders: schema.folders.map(f => path.join(projectPath, f)),
    files: schema.files.map(f => ({
      path: path.join(projectPath, f.path),
      relativePath: f.path,
      description: f.description
    })),
    venvSupported: schema.venvSupported,
    description
  };
}

/**
 * Validates project can be created.
 * 
 * @param {Object} plan 
 * @returns {{valid: boolean, error?: string}}
 */
export function validatePlan(plan) {
  // Ensure workspace exists
  const rootResult = ensureWorkspaceRoot();
  if (!rootResult.success) {
    return { valid: false, error: `Cannot create workspace: ${rootResult.error}` };
  }
  
  // Check project doesn't exist
  if (fs.existsSync(plan.projectPath)) {
    return { valid: false, error: `Project already exists: ${plan.projectPath}` };
  }
  
  return { valid: true };
}

/**
 * Creates project structure (folders only).
 * 
 * @param {Object} plan 
 * @returns {{success: boolean, error?: string}}
 */
export function createStructure(plan) {
  try {
    // Create project root
    fs.mkdirSync(plan.projectPath, { recursive: true });
    
    // Create subfolders
    for (const folder of plan.folders) {
      fs.mkdirSync(folder, { recursive: true });
    }
    
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * Writes file content.
 * 
 * @param {string} filePath 
 * @param {string} content 
 * @returns {{success: boolean, error?: string}}
 */
export function writeFile(filePath, content) {
  try {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(filePath, content, 'utf8');
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * Removes project directory on failure (rollback).
 * 
 * @param {string} projectPath 
 */
export function rollbackProject(projectPath) {
  try {
    fs.rmSync(projectPath, { recursive: true, force: true });
  } catch (err) {
    // Best effort
  }
}

/**
 * Creates Python virtual environment.
 * 
 * @param {string} projectPath 
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export function createVenv(projectPath) {
  return new Promise((resolve) => {
    const venvPath = path.join(projectPath, 'venv');
    
    const proc = spawn('python', ['-m', 'venv', venvPath], {
      cwd: projectPath,
      stdio: 'pipe'
    });
    
    let stderr = '';
    proc.stderr?.on('data', (data) => { stderr += data; });
    
    proc.on('close', (code) => {
      if (code === 0) {
        resolve({ success: true });
      } else {
        resolve({ success: false, error: stderr || `Exit code ${code}` });
      }
    });
    
    proc.on('error', (err) => {
      resolve({ success: false, error: err.message });
    });
  });
}

/**
 * Builds prompt for project content generation.
 * 
 * @param {Object} plan 
 * @returns {string}
 */
export function buildProjectPrompt(plan) {
  const fileList = plan.files
    .map(f => `- ${f.relativePath}: ${f.description}`)
    .join('\n');
  
  return `Generate content for a new ${plan.schemaName}.

Project Description: ${plan.description}

Files to generate (output content for EACH file in order):
${fileList}

OUTPUT FORMAT:
For each file, output:
===FILE: <relative-path>===
<file content>
===END===

Generate complete, working content for all files. Be concise but functional.`;
}

/**
 * Parses LLM output into file contents.
 * 
 * @param {string} output 
 * @param {Object[]} expectedFiles 
 * @returns {{success: boolean, files?: Object[], error?: string}}
 */
export function parseProjectOutput(output, expectedFiles) {
  const files = [];
  
  // Pattern: ===FILE: path=== ... ===END===
  const pattern = /===FILE:\s*(.+?)\s*===\n([\s\S]*?)===END===/g;
  let match;
  
  while ((match = pattern.exec(output)) !== null) {
    const relativePath = match[1].trim();
    const content = match[2].trim();
    
    // Find matching expected file
    const expected = expectedFiles.find(f => 
      f.relativePath === relativePath || 
      f.relativePath.endsWith(relativePath) ||
      relativePath.endsWith(f.relativePath)
    );
    
    if (expected) {
      files.push({
        path: expected.path,
        relativePath: expected.relativePath,
        content
      });
    }
  }
  
  // Check all files were generated
  if (files.length < expectedFiles.length) {
    const missing = expectedFiles
      .filter(e => !files.find(f => f.relativePath === e.relativePath))
      .map(e => e.relativePath);
    
    return {
      success: false,
      files,
      error: `Missing files in output: ${missing.join(', ')}`
    };
  }
  
  return { success: true, files };
}

export default {
  detectProjectType,
  extractProjectName,
  planProject,
  validatePlan,
  createStructure,
  writeFile,
  rollbackProject,
  createVenv,
  buildProjectPrompt,
  parseProjectOutput
};
