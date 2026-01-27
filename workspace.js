/**
 * Workspace Resolver
 * 
 * Cross-platform workspace management for arcl CLI.
 * Handles default locations, project initialization, and boundary enforcement.
 */

import fs from 'fs';
import path from 'path';
import os from 'os';

/**
 * Gets the default workspace root based on OS.
 * 
 * Windows: C:\arcl-projects
 * macOS:   ~/Desktop/arcl-projects
 * Linux:   ~/arcl-projects
 * 
 * @returns {string} Absolute path to workspace root
 */
export function getDefaultWorkspaceRoot() {
  const platform = os.platform();
  const home = os.homedir();
  
  switch (platform) {
    case 'win32':
      return 'C:\\arcl-projects';
    case 'darwin':
      return path.join(home, 'Desktop', 'arcl-projects');
    default:
      // Linux and others
      return path.join(home, 'arcl-projects');
  }
}

/**
 * Ensures the workspace root directory exists.
 * Creates it if it doesn't exist.
 * 
 * @returns {{success: boolean, path: string, error?: string}}
 */
export function ensureWorkspaceRoot() {
  const root = getDefaultWorkspaceRoot();
  
  try {
    if (!fs.existsSync(root)) {
      fs.mkdirSync(root, { recursive: true });
    }
    return { success: true, path: root };
  } catch (err) {
    return { success: false, path: root, error: err.message };
  }
}

/**
 * Gets the current working project.
 * A project is valid if cwd is inside the workspace root.
 * 
 * @returns {{inWorkspace: boolean, projectPath: string|null, projectName: string|null, workspaceRoot: string}}
 */
export function getCurrentProject() {
  const workspaceRoot = getDefaultWorkspaceRoot();
  const cwd = process.cwd();
  
  // Normalize paths for comparison
  const normalizedCwd = path.resolve(cwd).toLowerCase();
  const normalizedRoot = path.resolve(workspaceRoot).toLowerCase();
  
  // Check if cwd is inside workspace root
  if (normalizedCwd.startsWith(normalizedRoot)) {
    // Extract project name (first directory after workspace root)
    const relativePath = path.relative(workspaceRoot, cwd);
    const parts = relativePath.split(path.sep).filter(Boolean);
    
    if (parts.length > 0) {
      const projectName = parts[0];
      const projectPath = path.join(workspaceRoot, projectName);
      return {
        inWorkspace: true,
        projectPath,
        projectName,
        workspaceRoot
      };
    }
    
    // In workspace root but not in a project
    return {
      inWorkspace: true,
      projectPath: null,
      projectName: null,
      workspaceRoot
    };
  }
  
  return {
    inWorkspace: false,
    projectPath: null,
    projectName: null,
    workspaceRoot
  };
}

/**
 * Initializes a new project in the workspace.
 * 
 * @param {string} projectName - Name of the project to create
 * @returns {{success: boolean, path?: string, error?: string}}
 */
export function initProject(projectName) {
  // Validate project name
  if (!projectName || typeof projectName !== 'string') {
    return { success: false, error: 'Project name is required' };
  }
  
  // Sanitize: only allow alphanumeric, dash, underscore
  const sanitized = projectName.replace(/[^a-zA-Z0-9_-]/g, '');
  if (sanitized !== projectName) {
    return { 
      success: false, 
      error: `Invalid project name. Use only letters, numbers, dashes, underscores.` 
    };
  }
  
  // Ensure workspace root exists
  const rootResult = ensureWorkspaceRoot();
  if (!rootResult.success) {
    return { success: false, error: `Failed to create workspace: ${rootResult.error}` };
  }
  
  const projectPath = path.join(rootResult.path, projectName);
  
  // Check if project already exists
  if (fs.existsSync(projectPath)) {
    return { success: false, error: `Project already exists: ${projectPath}` };
  }
  
  // Create project directory
  try {
    fs.mkdirSync(projectPath, { recursive: true });
    return { success: true, path: projectPath };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * Lists projects in the workspace.
 * 
 * @returns {{success: boolean, projects?: string[], error?: string}}
 */
export function listProjects() {
  const root = getDefaultWorkspaceRoot();
  
  if (!fs.existsSync(root)) {
    return { success: true, projects: [] };
  }
  
  try {
    const entries = fs.readdirSync(root, { withFileTypes: true });
    const projects = entries
      .filter(e => e.isDirectory())
      .map(e => e.name);
    return { success: true, projects };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * Validates that a path is within the current workspace/project.
 * 
 * @param {string} targetPath - Path to validate
 * @param {Object} [options] - Options
 * @param {boolean} [options.requireProject=true] - Require being in a project
 * @returns {{valid: boolean, absolutePath?: string, error?: string}}
 */
export function validatePath(targetPath, options = {}) {
  const { requireProject = true } = options;
  const project = getCurrentProject();
  
  if (!project.inWorkspace) {
    return { 
      valid: false, 
      error: `Not in arcl workspace. Run commands from inside: ${project.workspaceRoot}` 
    };
  }
  
  if (requireProject && !project.projectPath) {
    return { 
      valid: false, 
      error: `Not in a project. Create one with: arcl init <project-name>` 
    };
  }
  
  // Resolve the target path relative to cwd
  const absolutePath = path.resolve(targetPath);
  const normalizedTarget = absolutePath.toLowerCase();
  
  // Check bounds
  const boundaryPath = project.projectPath || project.workspaceRoot;
  const normalizedBoundary = path.resolve(boundaryPath).toLowerCase();
  
  if (!normalizedTarget.startsWith(normalizedBoundary)) {
    return { 
      valid: false, 
      error: `Path outside workspace boundary: ${absolutePath}` 
    };
  }
  
  return { valid: true, absolutePath };
}

/**
 * Lists contents of current directory (for arcl ls).
 * 
 * @param {string} [dir] - Directory to list (defaults to cwd)
 * @returns {{success: boolean, entries?: Array<{name: string, type: 'file'|'directory'}>, error?: string}}
 */
export function listDirectory(dir = process.cwd()) {
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    const result = entries.map(e => ({
      name: e.name,
      type: e.isDirectory() ? 'directory' : 'file'
    }));
    return { success: true, entries: result };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * Builds a tree structure of directory (for arcl tree).
 * 
 * @param {string} [dir] - Root directory (defaults to cwd)
 * @param {number} [maxDepth=3] - Maximum depth to traverse
 * @param {string} [prefix=''] - Internal: prefix for formatting
 * @param {number} [currentDepth=0] - Internal: current depth
 * @returns {string} Formatted tree string
 */
export function buildTree(dir = process.cwd(), maxDepth = 3, prefix = '', currentDepth = 0) {
  if (currentDepth >= maxDepth) {
    return '';
  }
  
  let result = '';
  
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    
    // Sort: directories first, then files
    entries.sort((a, b) => {
      if (a.isDirectory() && !b.isDirectory()) return -1;
      if (!a.isDirectory() && b.isDirectory()) return 1;
      return a.name.localeCompare(b.name);
    });
    
    // Filter out hidden files and common noise
    const filtered = entries.filter(e => 
      !e.name.startsWith('.') && 
      e.name !== 'node_modules' &&
      !e.name.endsWith('.bak')
    );
    
    filtered.forEach((entry, index) => {
      const isLast = index === filtered.length - 1;
      const connector = isLast ? '└── ' : '├── ';
      const childPrefix = isLast ? '    ' : '│   ';
      
      result += prefix + connector + entry.name + '\n';
      
      if (entry.isDirectory()) {
        const childPath = path.join(dir, entry.name);
        result += buildTree(childPath, maxDepth, prefix + childPrefix, currentDepth + 1);
      }
    });
  } catch (err) {
    result += prefix + `[Error: ${err.message}]\n`;
  }
  
  return result;
}

export default {
  getDefaultWorkspaceRoot,
  ensureWorkspaceRoot,
  getCurrentProject,
  initProject,
  listProjects,
  validatePath,
  listDirectory,
  buildTree
};
