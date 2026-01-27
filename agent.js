#!/usr/bin/env node
/**
 * glm - CLI-Based Coding Agent (v2.2)
 * 
 * Transactional Commands:
 *   glm add <file> "<instruction>"
 *   glm edit <file> "<instruction>"
 *   glm remove <file>
 * 
 * Project Creation:
 *   glm create project "<description>"
 * 
 * Read-Only:
 *   glm ask <path> "<question>"
 * 
 * Utilities:
 *   glm ls
 *   glm tree
 *   glm templates
 *   glm --help
 * 
 * Flags:
 *   --dry-run  Preview without applying changes
 * 
 * No chat. No magic. Boring but trustworthy.
 */

import fs from 'fs';
import path from 'path';
import readline from 'readline';
import { callLLM, callScaffoldLLM, callAskLLM, validateDiffFormat } from './llm.js';
import { applyDiffToFile } from './applyDiff.js';
import {
  getDefaultWorkspaceRoot,
  validatePath,
  listDirectory,
  buildTree
} from './workspace.js';
import {
  planProject,
  validatePlan,
  createStructure,
  writeProjectFile,
  rollbackProject,
  createVenv,
  buildProjectPrompt,
  parseProjectOutput,
  listTemplates
} from './scaffold.js';
import { readFileUTF8, writeFileUTF8, fileExists, copyFileUTF8, deleteFile } from './io.js';
import { recordCommand, getCurrentProvider } from './history.js';

// ─────────────────────────────────────────────────────────────
// Utilities
// ─────────────────────────────────────────────────────────────

/**
 * Prompts user for confirmation.
 * @param {string} prompt 
 * @returns {Promise<boolean>}
 */
async function confirm(prompt) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise((resolve) => {
    rl.question(prompt, (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === 'y');
    });
  });
}

// ─────────────────────────────────────────────────────────────
// Help
// ─────────────────────────────────────────────────────────────

function printHelp() {
  const workspaceRoot = getDefaultWorkspaceRoot();
  console.log(`glm - CLI-Based Coding Agent (v2.2)

TRANSACTIONAL COMMANDS (single-file, safe):
  glm add <file> "<instruction>"     Create a new file
  glm edit <file> "<instruction>"    Modify an existing file
  glm remove <file>                  Delete a file

PROJECT CREATION (template-based):
  glm create project "<description>"
  glm templates                      List available templates

READ-ONLY (understand code):
  glm ask <path> "<question>"        Explain code without modifying

FLAGS:
  --dry-run                          Preview changes without applying

UTILITIES:
  glm ls                             List directory contents
  glm tree                           Show directory tree
  glm --help                         Show this help

EXAMPLES:
  glm add main.py "hello world script"
  glm edit main.py "add error handling"
  glm edit --dry-run main.py "add logging"
  glm ask src/main.py "explain the main function"
  glm ask . "summarize this project"
  glm create project "a calculator app using tkinter"

WORKSPACE: ${workspaceRoot}
`);
}

// ─────────────────────────────────────────────────────────────
// glm add <file> "<instruction>" [--dry-run]
// ─────────────────────────────────────────────────────────────

async function addCommand(filePath, instruction, options = {}) {
  const { dryRun = false } = options;
  
  const pathCheck = validatePath(filePath);
  if (!pathCheck.valid) {
    console.error(`Error: ${pathCheck.error}`);
    return 1;
  }

  const absolutePath = pathCheck.absolutePath;

  if (fileExists(absolutePath)) {
    console.error(`Error: File already exists: ${absolutePath}`);
    console.error('Use "glm edit" to modify existing files.');
    return 1;
  }

  console.log(`File: ${absolutePath}`);
  console.log(`(File does not exist)`);
  if (dryRun) console.log('[DRY RUN]');
  
  if (!dryRun) {
    const shouldCreate = await confirm('Create it? [y/N] ');
    if (!shouldCreate) {
      console.log('Aborted.');
      return 0;
    }
  }

  console.log(`Instruction: ${instruction}`);
  console.log('');

  const response = await callLLM({
    fileContent: '# New file - generate content below',
    filePath: path.basename(absolutePath),
    instruction: `Generate the complete content for a new file. Requirements: ${instruction}

Output the content as a unified diff that ADDS all lines to an empty file. Example format:
--- a/filename
+++ b/filename
@@ -0,0 +1,N @@
+line1
+line2
...`
  });

  if (!response.success) {
    console.error(`Error: LLM call failed: ${response.error}`);
    recordCommand({ command: 'add', files: absolutePath, instruction, provider: getCurrentProvider(), result: 'failed', error: response.error });
    return 1;
  }

  let content = '';
  
  if (response.diff.includes('---') && response.diff.includes('+++') && response.diff.includes('@@')) {
    const lines = response.diff.split('\n');
    const addedLines = lines
      .filter(l => l.startsWith('+') && !l.startsWith('+++'))
      .map(l => l.slice(1));
    content = addedLines.join('\n');
  } else if (response.diff === 'NO_CHANGES') {
    console.log('No content generated.');
    return 0;
  } else {
    content = response.diff;
  }

  console.log('--- Preview ---');
  console.log(content);
  console.log('--- End Preview ---');
  console.log('');

  // Dry run stops here
  if (dryRun) {
    console.log('[DRY RUN] No files written.');
    recordCommand({ command: 'add', files: absolutePath, instruction, provider: getCurrentProvider(), result: 'dry-run' });
    return 0;
  }

  const shouldApply = await confirm('Write file? [y/N] ');
  if (!shouldApply) {
    console.log('Aborted.');
    recordCommand({ command: 'add', files: absolutePath, instruction, provider: getCurrentProvider(), result: 'rejected' });
    return 0;
  }

  // Write file using UTF-8 encoding (io.js handles directory creation)
  const writeResult = writeFileUTF8(absolutePath, content);
  if (writeResult.success) {
    console.log(`Created: ${absolutePath}`);
    recordCommand({ command: 'add', files: absolutePath, instruction, provider: getCurrentProvider(), result: 'success' });
    return 0;
  } else {
    console.error(`Error: Failed to write file: ${writeResult.error}`);
    recordCommand({ command: 'add', files: absolutePath, instruction, provider: getCurrentProvider(), result: 'failed', error: writeResult.error });
    return 1;
  }
}

// ─────────────────────────────────────────────────────────────
// glm edit <file> "<instruction>" [--dry-run]
// ─────────────────────────────────────────────────────────────

async function editCommand(filePath, instruction, options = {}) {
  const { dryRun = false } = options;
  
  const pathCheck = validatePath(filePath);
  if (!pathCheck.valid) {
    console.error(`Error: ${pathCheck.error}`);
    return 1;
  }

  const absolutePath = pathCheck.absolutePath;

  if (!fileExists(absolutePath)) {
    console.error(`Error: File not found: ${absolutePath}`);
    console.error('Use "glm add" to create new files.');
    return 1;
  }

  const readResult = readFileUTF8(absolutePath);
  if (!readResult.success) {
    console.error(`Error: Failed to read file: ${readResult.error}`);
    return 1;
  }
  const fileContent = readResult.content;

  console.log(`File: ${absolutePath}`);
  console.log(`Instruction: ${instruction}`);
  if (dryRun) console.log('[DRY RUN]');
  console.log('');

  const response = await callLLM({
    fileContent,
    filePath: path.basename(absolutePath),
    instruction
  });

  if (!response.success) {
    console.error(`Error: LLM call failed: ${response.error}`);
    recordCommand({ command: 'edit', files: absolutePath, instruction, provider: getCurrentProvider(), result: 'failed', error: response.error });
    return 1;
  }

  const validation = validateDiffFormat(response.diff, path.basename(absolutePath));
  if (!validation.valid) {
    if (validation.error === 'NO_CHANGES') {
      console.log('No changes needed.');
      return 0;
    }
    console.error(`Error: ${validation.error}`);
    recordCommand({ command: 'edit', files: absolutePath, instruction, provider: getCurrentProvider(), result: 'failed', error: validation.error });
    return 1;
  }

  console.log(response.diff);
  console.log('');

  // Dry run stops here
  if (dryRun) {
    console.log('[DRY RUN] No changes applied.');
    recordCommand({ command: 'edit', files: absolutePath, instruction, provider: getCurrentProvider(), result: 'dry-run' });
    return 0;
  }

  const approved = await confirm('Apply? [y/N] ');
  if (!approved) {
    console.log('Aborted.');
    recordCommand({ command: 'edit', files: absolutePath, instruction, provider: getCurrentProvider(), result: 'rejected' });
    return 0;
  }

  const result = applyDiffToFile(absolutePath, response.diff);
  if (result.success) {
    console.log('Applied.');
    recordCommand({ command: 'edit', files: absolutePath, instruction, provider: getCurrentProvider(), result: 'success' });
    return 0;
  } else {
    console.error(`Error: Failed to apply diff: ${result.error}`);
    recordCommand({ command: 'edit', files: absolutePath, instruction, provider: getCurrentProvider(), result: 'failed', error: result.error });
    return 1;
  }
}

// ─────────────────────────────────────────────────────────────
// glm remove <file>
// ─────────────────────────────────────────────────────────────

async function removeCommand(filePath) {
  const pathCheck = validatePath(filePath);
  if (!pathCheck.valid) {
    console.error(`Error: ${pathCheck.error}`);
    return 1;
  }

  const absolutePath = pathCheck.absolutePath;

  if (!fileExists(absolutePath)) {
    console.error(`Error: File not found: ${absolutePath}`);
    return 1;
  }

  // Check if it's a file (not directory) by trying to read it
  const readCheck = readFileUTF8(absolutePath);
  if (!readCheck.success && readCheck.error.includes('EISDIR')) {
    console.error('Error: Cannot remove directories. Use file paths only.');
    return 1;
  }

  console.log(`File: ${absolutePath}`);
  const shouldDelete = await confirm('Delete this file? This cannot be undone. [y/N] ');

  if (!shouldDelete) {
    console.log('Aborted.');
    return 0;
  }

  const backupPath = absolutePath + '.deleted.bak';
  const backupResult = copyFileUTF8(absolutePath, backupPath);
  if (!backupResult.success) {
    console.error(`Warning: Could not create backup: ${backupResult.error}`);
  }

  const deleteResult = deleteFile(absolutePath);
  if (deleteResult.success) {
    console.log(`Deleted: ${absolutePath}`);
    if (fileExists(backupPath)) {
      console.log(`Backup: ${backupPath}`);
    }
    return 0;
  } else {
    console.error(`Error: Failed to delete: ${deleteResult.error}`);
    return 1;
  }
}

// ─────────────────────────────────────────────────────────────
// glm create project "<description>" [--dry-run]
// ─────────────────────────────────────────────────────────────

async function createProjectCommand(description, options = {}) {
  const { dryRun = false } = options;
  
  if (!description) {
    console.error('Error: Project description required');
    console.error('Usage: glm create project "<description>"');
    return 1;
  }

  // Plan the project (now returns {success, plan, error})
  const planResult = planProject(description);
  if (!planResult.success) {
    console.error(`Error: ${planResult.error}`);
    return 1;
  }
  const plan = planResult.plan;
  
  // Validate
  const validation = validatePlan(plan);
  if (!validation.valid) {
    console.error(`Error: ${validation.error}`);
    return 1;
  }

  // Show plan
  console.log(`\nProject: ${plan.projectName}`);
  console.log(`Template: ${plan.templateName}`);
  console.log(`Location: ${plan.projectPath}`);
  if (dryRun) console.log('[DRY RUN]');
  console.log(`\nPlanned structure:`);
  
  for (const folder of plan.folders) {
    console.log(`  [DIR]  ${path.relative(plan.projectPath, folder)}/`);
  }
  for (const file of plan.files) {
    console.log(`  [FILE] ${file.relativePath}`);
  }
  
  console.log('');

  // Dry run stops here - no confirmation, no creation
  if (dryRun) {
    console.log('[DRY RUN] No files or directories created.');
    recordCommand({ command: 'create', files: plan.files.map(f => f.relativePath), instruction: description, provider: getCurrentProvider(), result: 'dry-run' });
    return 0;
  }
  
  // Confirm creation
  const shouldCreate = await confirm('Create this project? [y/N] ');
  if (!shouldCreate) {
    console.log('Aborted.');
    recordCommand({ command: 'create', files: plan.files.map(f => f.relativePath), instruction: description, provider: getCurrentProvider(), result: 'rejected' });
    return 0;
  }

  // Ask about venv if supported
  let createVenvFlag = false;
  if (plan.venv) {
    createVenvFlag = await confirm('Create Python virtual environment (venv)? [y/N] ');
  }

  // Create structure
  console.log('\nCreating project structure...');
  const structResult = createStructure(plan);
  if (!structResult.success) {
    console.error(`Error: ${structResult.error}`);
    recordCommand({ command: 'create', files: plan.files.map(f => f.relativePath), instruction: description, provider: getCurrentProvider(), result: 'failed', error: structResult.error });
    return 1;
  }

  // Generate content via LLM (using scaffold-specific call)
  console.log('Generating file contents...');
  const prompt = buildProjectPrompt(plan);
  
  const response = await callScaffoldLLM(prompt);

  if (!response.success) {
    console.error(`Error: LLM call failed: ${response.error}`);
    rollbackProject(plan.projectPath);
    console.log('Rolled back project creation.');
    return 1;
  }

  // Parse output
  const parseResult = parseProjectOutput(response.content, plan.files);
  
  if (!parseResult.success) {
    console.error(`Warning: ${parseResult.error}`);
    // Try to continue with what we have
  }

  // If no files parsed, try to extract content directly (fallback)
  let filesToWrite = parseResult.files || [];
  if (filesToWrite.length === 0) {
    // Model didn't follow format - try to use raw output for first file
    console.log('Using fallback content extraction...');
    const mainFile = plan.files.find(f => f.relativePath.includes('main'));
    if (mainFile) {
      filesToWrite = [{
        path: mainFile.path,
        relativePath: mainFile.relativePath,
        content: response.content
      }];
    }
  }

  // Write files
  console.log('Writing files...');
  let writtenCount = 0;
  
  for (const file of filesToWrite) {
    const result = writeProjectFile(file.path, file.content);
    if (result.success) {
      console.log(`  Created: ${file.relativePath}`);
      writtenCount++;
    } else {
      console.error(`  Failed: ${file.relativePath} - ${result.error}`);
    }
  }

  // Write default content for missing files
  for (const expected of plan.files) {
    if (!filesToWrite.find(f => f.relativePath === expected.relativePath)) {
      const defaultContent = getDefaultContent(expected.relativePath, plan);
      const result = writeProjectFile(expected.path, defaultContent);
      if (result.success) {
        console.log(`  Created: ${expected.relativePath} (default)`);
        writtenCount++;
      }
    }
  }

  // Create venv if requested
  if (createVenvFlag) {
    console.log('Creating virtual environment...');
    const venvResult = await createVenv(plan.projectPath);
    if (venvResult.success) {
      console.log('  Created: venv/');
    } else {
      console.error(`  Warning: Failed to create venv: ${venvResult.error}`);
    }
  }

  console.log(`\nProject created: ${plan.projectPath}`);
  console.log(`\nNext steps:`);
  console.log(`  cd "${plan.projectPath}"`);
  console.log(`  glm edit src/main.py "your changes"`);
  
  recordCommand({ command: 'create', files: plan.files.map(f => f.relativePath), instruction: description, provider: getCurrentProvider(), result: 'success' });
  return 0;
}

/**
 * Get default content for a file type.
 */
function getDefaultContent(relativePath, plan) {
  const ext = path.extname(relativePath);
  const name = plan.projectName;
  const lang = plan.template?.language || '';
  
  if (relativePath === 'README.md') {
    return `# ${name}\n\n${plan.description}\n`;
  }
  if (relativePath === '.gitignore') {
    if (lang === 'python') {
      return `__pycache__/\n*.pyc\nvenv/\n.env\n`;
    }
    if (lang === 'javascript') {
      return `node_modules/\n.env\ndist/\n`;
    }
    return `.env\n`;
  }
  if (relativePath === 'requirements.txt') {
    return `# Add dependencies here\n`;
  }
  if (relativePath === 'package.json') {
    return JSON.stringify({ name, version: '1.0.0', main: 'src/index.js' }, null, 2);
  }
  if (ext === '.py') {
    return `#!/usr/bin/env python3\n\ndef main():\n    pass\n\nif __name__ == "__main__":\n    main()\n`;
  }
  if (ext === '.js') {
    return `// ${name}\n\nconsole.log('Hello, world!');\n`;
  }
  if (ext === '.html') {
    return `<!DOCTYPE html>\n<html>\n<head>\n  <title>${name}</title>\n</head>\n<body>\n  <h1>${name}</h1>\n</body>\n</html>\n`;
  }
  if (ext === '.css') {
    return `/* Styles for ${name} */\n`;
  }
  return `# ${name}\n`;
}

// ─────────────────────────────────────────────────────────────
// glm ask <path> "<question>"
// ─────────────────────────────────────────────────────────────

async function askCommand(targetPath, question) {
  if (!targetPath || !question) {
    console.error('Error: Path and question required');
    console.error('Usage: glm ask <path> "<question>"');
    return 1;
  }

  const absolutePath = path.resolve(targetPath);
  
  // Check if path exists
  if (!fileExists(absolutePath) && !fs.existsSync(absolutePath)) {
    console.error(`Error: Path not found: ${absolutePath}`);
    return 1;
  }

  const stats = fs.statSync(absolutePath);
  let content = '';
  let pathLabel = absolutePath;
  
  if (stats.isDirectory()) {
    // Read multiple files from directory (limited)
    console.log(`Reading directory: ${absolutePath}`);
    const entries = fs.readdirSync(absolutePath);
    const codeFiles = entries
      .filter(e => !e.startsWith('.') && !e.includes('node_modules') && !e.includes('venv'))
      .filter(e => {
        const ext = path.extname(e).toLowerCase();
        return ['.py', '.js', '.ts', '.jsx', '.tsx', '.json', '.md', '.txt', '.html', '.css'].includes(ext) || !ext;
      })
      .slice(0, 10); // Limit to 10 files
    
    for (const file of codeFiles) {
      const filePath = path.join(absolutePath, file);
      const stat = fs.statSync(filePath);
      if (stat.isFile() && stat.size < 50000) { // Max 50KB per file
        const readResult = readFileUTF8(filePath);
        if (readResult.success) {
          content += `\n=== ${file} ===\n${readResult.content}\n`;
        }
      }
    }
    pathLabel = `${absolutePath} (${codeFiles.length} files)`;
  } else {
    // Single file
    const readResult = readFileUTF8(absolutePath);
    if (!readResult.success) {
      console.error(`Error: Failed to read file: ${readResult.error}`);
      return 1;
    }
    content = readResult.content;
  }

  if (!content.trim()) {
    console.error('Error: No readable content found');
    return 1;
  }

  console.log(`Path: ${pathLabel}`);
  console.log(`Question: ${question}`);
  console.log('');

  const response = await callAskLLM({
    content,
    question,
    path: targetPath
  });

  if (!response.success) {
    console.error(`Error: ${response.error}`);
    recordCommand({ command: 'ask', files: absolutePath, instruction: question, provider: getCurrentProvider(), result: 'failed', error: response.error });
    return 1;
  }

  console.log(response.answer);
  console.log('');
  
  recordCommand({ command: 'ask', files: absolutePath, instruction: question, provider: getCurrentProvider(), result: 'success' });
  return 0;
}

// ─────────────────────────────────────────────────────────────
// glm ls
// ─────────────────────────────────────────────────────────────

function lsCommand() {
  const result = listDirectory();
  
  if (!result.success) {
    console.error(`Error: ${result.error}`);
    return 1;
  }

  if (result.entries.length === 0) {
    console.log('(empty)');
    return 0;
  }

  for (const entry of result.entries) {
    const suffix = entry.type === 'directory' ? '/' : '';
    console.log(`${entry.name}${suffix}`);
  }
  return 0;
}

// ─────────────────────────────────────────────────────────────
// glm tree
// ─────────────────────────────────────────────────────────────

function treeCommand() {
  const cwd = process.cwd();
  const dirName = path.basename(cwd);
  
  console.log(dirName);
  const tree = buildTree(cwd, 4);
  if (tree) {
    process.stdout.write(tree);
  } else {
    console.log('(empty)');
  }
  return 0;
}

// ─────────────────────────────────────────────────────────────
// glm templates
// ─────────────────────────────────────────────────────────────

function templatesCommand() {
  const result = listTemplates();
  
  if (!result.success) {
    console.error(`Error: ${result.error}`);
    return 1;
  }

  console.log('Available templates:\n');
  for (const t of result.templates) {
    console.log(`  ${t.name}`);
    console.log(`    ${t.description} (${t.language})`);
  }
  console.log('');
  return 0;
}

// ─────────────────────────────────────────────────────────────
// Command Router
// ─────────────────────────────────────────────────────────────

/**
 * Parses --dry-run flag from args and returns cleaned args.
 * @param {string[]} args 
 * @returns {{args: string[], dryRun: boolean}}
 */
function parseFlags(args) {
  const dryRun = args.includes('--dry-run');
  const cleanedArgs = args.filter(a => a !== '--dry-run');
  return { args: cleanedArgs, dryRun };
}

async function main() {
  const rawArgs = process.argv.slice(2);
  const { args, dryRun } = parseFlags(rawArgs);

  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
    printHelp();
    return 0;
  }

  const command = args[0];

  switch (command) {
    case 'add':
      if (args.length < 3) {
        console.error('Error: glm add requires <file> and "<instruction>"');
        return 1;
      }
      return await addCommand(args[1], args[2], { dryRun });

    case 'edit':
      if (args.length < 3) {
        console.error('Error: glm edit requires <file> and "<instruction>"');
        return 1;
      }
      return await editCommand(args[1], args[2], { dryRun });

    case 'remove':
      if (args.length < 2) {
        console.error('Error: glm remove requires <file>');
        return 1;
      }
      return await removeCommand(args[1]);

    case 'create':
      if (args[1] === 'project') {
        return await createProjectCommand(args[2], { dryRun });
      }
      console.error('Error: Unknown create target. Use: glm create project "<description>"');
      return 1;

    case 'ask':
      if (args.length < 3) {
        console.error('Error: glm ask requires <path> and "<question>"');
        return 1;
      }
      return await askCommand(args[1], args[2]);

    case 'ls':
      return lsCommand();

    case 'tree':
      return treeCommand();

    case 'templates':
      return templatesCommand();

    // Legacy compatibility
    case 'run':
      console.error('Warning: "glm run" is deprecated in v2. Use "glm add/edit/remove" directly.');
      const action = args[1];
      if (action === 'add') return await addCommand(args[2], args[3], { dryRun });
      if (action === 'edit') return await editCommand(args[2], args[3], { dryRun });
      if (action === 'remove') return await removeCommand(args[2]);
      return 1;

    case 'init':
      console.error('Warning: "glm init" is deprecated. Use "glm create project" instead.');
      return 1;

    default:
      console.error(`Error: Unknown command: ${command}`);
      console.error('Run "glm --help" for usage.');
      return 1;
  }
}

// Run
main()
  .then((exitCode) => {
    setImmediate(() => process.exit(exitCode));
  })
  .catch((err) => {
    console.error(`Error: ${err.message}`);
    setImmediate(() => process.exit(1));
  });
