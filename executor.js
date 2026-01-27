/**
 * Executor Module
 * 
 * Handles shell command execution for verification (tests, linters, builds).
 * Captures stdout/stderr for feedback loop.
 */

import { spawn } from 'child_process';
import { log } from './logger.js';

/**
 * @typedef {Object} ExecutionResult
 * @property {boolean} success - Whether command exited with code 0
 * @property {number} exitCode - Process exit code
 * @property {string} stdout - Standard output
 * @property {string} stderr - Standard error
 * @property {number} durationMs - Execution time in milliseconds
 * @property {string|null} error - Error message if spawn failed
 */

/**
 * @typedef {Object} CommandSpec
 * @property {string} command - The command to run
 * @property {string[]} [args] - Command arguments
 * @property {string} [cwd] - Working directory
 * @property {number} [timeout] - Timeout in milliseconds (default: 30000)
 * @property {Object} [env] - Environment variables
 */

/**
 * Default timeout for commands (30 seconds)
 */
const DEFAULT_TIMEOUT = 30000;

/**
 * Maximum output buffer size (1MB)
 */
const MAX_BUFFER_SIZE = 1024 * 1024;

/**
 * Executes a shell command and captures output.
 * 
 * @param {CommandSpec} spec - Command specification
 * @returns {Promise<ExecutionResult>}
 */
export async function executeCommand(spec) {
  const { 
    command, 
    args = [], 
    cwd = process.cwd(), 
    timeout = DEFAULT_TIMEOUT,
    env = process.env 
  } = spec;

  const startTime = Date.now();
  
  log('INFO', `Executing: ${command} ${args.join(' ')}`);
  
  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    let killed = false;
    
    const proc = spawn(command, args, {
      cwd,
      env,
      shell: true,
      windowsHide: true
    });
    
    // Set timeout
    const timeoutId = setTimeout(() => {
      killed = true;
      proc.kill('SIGTERM');
      log('WARN', `Command timed out after ${timeout}ms`);
    }, timeout);
    
    // Capture stdout
    proc.stdout.on('data', (data) => {
      const chunk = data.toString();
      if (stdout.length + chunk.length <= MAX_BUFFER_SIZE) {
        stdout += chunk;
      }
    });
    
    // Capture stderr
    proc.stderr.on('data', (data) => {
      const chunk = data.toString();
      if (stderr.length + chunk.length <= MAX_BUFFER_SIZE) {
        stderr += chunk;
      }
    });
    
    // Handle process exit
    proc.on('close', (code) => {
      clearTimeout(timeoutId);
      const durationMs = Date.now() - startTime;
      
      const result = {
        success: code === 0,
        exitCode: code ?? (killed ? 124 : 1),
        stdout: stdout.trim(),
        stderr: stderr.trim(),
        durationMs,
        error: killed ? 'Command timed out' : null
      };
      
      if (result.success) {
        log('INFO', `Command succeeded in ${durationMs}ms`);
      } else {
        log('WARN', `Command failed with exit code ${result.exitCode}`);
      }
      
      resolve(result);
    });
    
    // Handle spawn errors
    proc.on('error', (err) => {
      clearTimeout(timeoutId);
      const durationMs = Date.now() - startTime;
      
      log('ERROR', `Command spawn failed: ${err.message}`);
      
      resolve({
        success: false,
        exitCode: 1,
        stdout: '',
        stderr: '',
        durationMs,
        error: err.message
      });
    });
  });
}

/**
 * Runs a verification command (test, lint, build) and returns structured result.
 * 
 * @param {string} commandString - Full command string (e.g., "npm test")
 * @param {string} [cwd] - Working directory
 * @returns {Promise<ExecutionResult>}
 */
export async function runVerification(commandString, cwd) {
  // Parse command string into command and args
  const parts = commandString.match(/(?:[^\s"]+|"[^"]*")+/g) || [];
  const command = parts[0];
  const args = parts.slice(1).map(arg => arg.replace(/^"|"$/g, ''));
  
  return executeCommand({ command, args, cwd });
}

/**
 * Runs multiple verification commands in sequence.
 * Stops on first failure unless continueOnError is true.
 * 
 * @param {string[]} commands - Array of command strings
 * @param {Object} [options] - Options
 * @param {string} [options.cwd] - Working directory
 * @param {boolean} [options.continueOnError] - Continue after failures
 * @returns {Promise<{results: ExecutionResult[], allPassed: boolean}>}
 */
export async function runVerificationSuite(commands, options = {}) {
  const { cwd, continueOnError = false } = options;
  const results = [];
  
  for (const cmd of commands) {
    const result = await runVerification(cmd, cwd);
    results.push({ command: cmd, ...result });
    
    if (!result.success && !continueOnError) {
      break;
    }
  }
  
  return {
    results,
    allPassed: results.every(r => r.success)
  };
}

/**
 * Formats execution result for display or LLM feedback.
 * 
 * @param {ExecutionResult} result - The execution result
 * @param {string} [command] - The command that was run
 * @returns {string}
 */
export function formatExecutionResult(result, command = '') {
  const lines = [];
  
  if (command) {
    lines.push(`Command: ${command}`);
  }
  
  lines.push(`Status: ${result.success ? 'SUCCESS' : 'FAILED'}`);
  lines.push(`Exit Code: ${result.exitCode}`);
  lines.push(`Duration: ${result.durationMs}ms`);
  
  if (result.error) {
    lines.push(`Error: ${result.error}`);
  }
  
  if (result.stdout) {
    lines.push('--- STDOUT ---');
    lines.push(result.stdout);
  }
  
  if (result.stderr) {
    lines.push('--- STDERR ---');
    lines.push(result.stderr);
  }
  
  return lines.join('\n');
}

export default { 
  executeCommand, 
  runVerification, 
  runVerificationSuite, 
  formatExecutionResult 
};
