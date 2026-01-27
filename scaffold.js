/**
 * Template-Based Project Scaffolding Module (v2.1)
 * 
 * Runtime defines structure via JSON templates.
 * Model fills content only.
 * 
 * Core Principle:
 * - Templates are immutable per project
 * - Extra files in LLM output → rejected
 * - Missing required files → generation fails
 * - All writes are atomic
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';
import { getDefaultWorkspaceRoot, ensureWorkspaceRoot } from './workspace.js';
import { readFileUTF8, writeFileUTF8, ensureDir, removeDir, fileExists } from './io.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * @typedef {Object} Template
 * @property {string} name - Template identifier
 * @property {string} language - Primary language
 * @property {string} description - Human-readable description
 * @property {string[]} detect - Keywords for auto-detection
 * @property {string[]} structure - Ordered list of file paths
 * @property {Object<string, string>} fileDescriptions - Path → description map
 * @property {boolean} venv - Whether to create Python venv
 */

/**
 * Loads all templates from the templates/ directory.
 * 
 * @returns {{success: boolean, templates?: Map<string, Template>, error?: string}}
 */
export function loadTemplates() {
  try {
    const templatesDir = path.join(__dirname, 'templates');
    
    if (!fs.existsSync(templatesDir)) {
      return { success: false, error: 'Templates directory not found' };
    }
    
    const templates = new Map();
    const files = fs.readdirSync(templatesDir).filter(f => f.endsWith('.json'));
    
    for (const file of files) {
      const filePath = path.join(templatesDir, file);
      const result = readFileUTF8(filePath);
      
      if (!result.success) {
        console.error(`Warning: Failed to load template ${file}: ${result.error}`);
        continue;
      }
      
      try {
        const template = JSON.parse(result.content);
        const templateName = file.replace('.json', '');
        templates.set(templateName, template);
      } catch (parseErr) {
        console.error(`Warning: Invalid JSON in template ${file}: ${parseErr.message}`);
      }
    }
    
    if (templates.size === 0) {
      return { success: false, error: 'No valid templates found' };
    }
    
    return { success: true, templates };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * Auto-detects the best template from a project description.
 * 
 * @param {string} description - User's project description
 * @param {Map<string, Template>} templates - Loaded templates
 * @returns {{name: string, template: Template}}
 */
export function detectTemplate(description, templates) {
  const descLower = description.toLowerCase();
  
  // Score each template by keyword matches
  let bestMatch = null;
  let bestScore = 0;
  
  for (const [name, template] of templates) {
    if (name === 'generic') continue; // Fallback only
    
    let score = 0;
    for (const keyword of template.detect || []) {
      if (descLower.includes(keyword.toLowerCase())) {
        score++;
      }
    }
    
    if (score > bestScore) {
      bestScore = score;
      bestMatch = { name, template };
    }
  }
  
  // Fallback to generic if no match
  if (!bestMatch || bestScore === 0) {
    const generic = templates.get('generic');
    if (generic) {
      return { name: 'generic', template: generic };
    }
    // Last resort: first template
    const [firstName, firstTemplate] = templates.entries().next().value;
    return { name: firstName, template: firstTemplate };
  }
  
  return bestMatch;
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
 * @typedef {Object} ProjectPlan
 * @property {string} projectName
 * @property {string} projectPath
 * @property {string} templateName
 * @property {Template} template
 * @property {Array<{path: string, relativePath: string, description: string}>} files
 * @property {string} description
 */

/**
 * Plans project creation from template.
 * 
 * @param {string} description - Project description
 * @param {string} [templateName] - Optional explicit template name
 * @returns {{success: boolean, plan?: ProjectPlan, error?: string}}
 */
export function planProject(description, templateName = null) {
  // Load templates
  const loadResult = loadTemplates();
  if (!loadResult.success) {
    return { success: false, error: loadResult.error };
  }
  
  const templates = loadResult.templates;
  
  // Select template
  let selectedName, selectedTemplate;
  
  if (templateName && templates.has(templateName)) {
    selectedName = templateName;
    selectedTemplate = templates.get(templateName);
  } else {
    const detected = detectTemplate(description, templates);
    selectedName = detected.name;
    selectedTemplate = detected.template;
  }
  
  // Build plan
  const projectName = extractProjectName(description);
  const workspaceRoot = getDefaultWorkspaceRoot();
  const projectPath = path.join(workspaceRoot, projectName);
  
  // Build file list from template structure
  const files = selectedTemplate.structure.map(relativePath => ({
    path: path.join(projectPath, relativePath),
    relativePath,
    description: selectedTemplate.fileDescriptions?.[relativePath] || 'Project file'
  }));
  
  // Extract unique folders from file paths
  const folders = [...new Set(
    files
      .map(f => path.dirname(f.relativePath))
      .filter(d => d !== '.' && d !== '')
  )].map(f => path.join(projectPath, f));
  
  return {
    success: true,
    plan: {
      projectName,
      projectPath,
      templateName: selectedName,
      template: selectedTemplate,
      folders,
      files,
      description,
      venv: selectedTemplate.venv || false
    }
  };
}

/**
 * Validates project can be created.
 * 
 * @param {ProjectPlan} plan 
 * @returns {{valid: boolean, error?: string}}
 */
export function validatePlan(plan) {
  // Ensure workspace exists
  const rootResult = ensureWorkspaceRoot();
  if (!rootResult.success) {
    return { valid: false, error: `Cannot create workspace: ${rootResult.error}` };
  }
  
  // Check project doesn't exist
  if (fileExists(plan.projectPath)) {
    return { valid: false, error: `Project already exists: ${plan.projectPath}` };
  }
  
  return { valid: true };
}

/**
 * Creates project structure (folders only).
 * 
 * @param {ProjectPlan} plan 
 * @returns {{success: boolean, error?: string}}
 */
export function createStructure(plan) {
  try {
    // Create project root
    const rootResult = ensureDir(plan.projectPath);
    if (!rootResult.success) {
      return rootResult;
    }
    
    // Create subfolders
    for (const folder of plan.folders) {
      const result = ensureDir(folder);
      if (!result.success) {
        return result;
      }
    }
    
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * Writes file content with UTF-8 encoding.
 * 
 * @param {string} filePath 
 * @param {string} content 
 * @returns {{success: boolean, error?: string}}
 */
export function writeProjectFile(filePath, content) {
  return writeFileUTF8(filePath, content);
}

/**
 * Removes project directory on failure (rollback).
 * 
 * @param {string} projectPath 
 */
export function rollbackProject(projectPath) {
  removeDir(projectPath);
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
 * LLM receives fixed structure, generates content only.
 * 
 * @param {ProjectPlan} plan 
 * @returns {string}
 */
export function buildProjectPrompt(plan) {
  const fileList = plan.files
    .map(f => `- ${f.relativePath}: ${f.description}`)
    .join('\n');
  
  return `Generate content for a new ${plan.template.description || plan.templateName} project.

Project Description: ${plan.description}

You MUST generate content for EXACTLY these files (no more, no less):
${fileList}

OUTPUT FORMAT:
For each file, output in this exact format:
===FILE: <relative-path>===
<file content here>
===END===

RULES:
- Generate ALL files listed above
- Do NOT add any extra files
- Do NOT modify file paths
- Output complete, working content
- Use UTF-8 encoding (no special characters that might corrupt)`;
}

/**
 * Parses LLM output into file contents.
 * Validates that output matches expected structure.
 * 
 * @param {string} output - Raw LLM output
 * @param {Array<{path: string, relativePath: string, description: string}>} expectedFiles 
 * @returns {{success: boolean, files?: Array<{path: string, relativePath: string, content: string}>, error?: string}}
 */
export function parseProjectOutput(output, expectedFiles) {
  const files = [];
  const foundPaths = new Set();
  
  // Pattern: ===FILE: path=== ... ===END===
  const pattern = /===FILE:\s*(.+?)\s*===\n([\s\S]*?)===END===/g;
  let match;
  
  while ((match = pattern.exec(output)) !== null) {
    const relativePath = match[1].trim();
    let content = match[2];
    
    // Trim trailing whitespace but preserve internal structure
    content = content.replace(/\n+$/, '\n');
    if (!content.endsWith('\n')) {
      content += '\n';
    }
    
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
      foundPaths.add(expected.relativePath);
    } else {
      // Extra file not in template - reject
      return {
        success: false,
        error: `Unexpected file in output: ${relativePath}. Template structure is immutable.`
      };
    }
  }
  
  // Check all required files were generated
  const missing = expectedFiles
    .filter(e => !foundPaths.has(e.relativePath))
    .map(e => e.relativePath);
  
  if (missing.length > 0) {
    return {
      success: false,
      files, // Return what we have for potential retry
      error: `Missing required files: ${missing.join(', ')}`
    };
  }
  
  return { success: true, files };
}

/**
 * Lists available templates.
 * 
 * @returns {{success: boolean, templates?: Array<{name: string, description: string, language: string}>, error?: string}}
 */
export function listTemplates() {
  const loadResult = loadTemplates();
  if (!loadResult.success) {
    return loadResult;
  }
  
  const templates = [];
  for (const [name, template] of loadResult.templates) {
    templates.push({
      name,
      description: template.description,
      language: template.language
    });
  }
  
  return { success: true, templates };
}

export default {
  loadTemplates,
  detectTemplate,
  extractProjectName,
  planProject,
  validatePlan,
  createStructure,
  writeProjectFile,
  rollbackProject,
  createVenv,
  buildProjectPrompt,
  parseProjectOutput,
  listTemplates
};
