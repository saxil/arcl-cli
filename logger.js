/**
 * Logger Module
 * 
 * Plain text, deterministic logging for CLI output.
 * No emojis. No color codes (v1). Structured sections.
 * 
 * Log sections as defined in CLI spec:
 * [INPUT], [FILES], [INSTRUCTION], [DIFF], [VALIDATION], [CONFIRMATION], [RESULT]
 */

/**
 * Log section headers as defined in CLI spec.
 */
export const SECTIONS = {
  INPUT: '[INPUT]',
  FILES: '[FILES]',
  INSTRUCTION: '[INSTRUCTION]',
  DIFF: '[DIFF]',
  VALIDATION: '[VALIDATION]',
  CONFIRMATION: '[CONFIRMATION]',
  RESULT: '[RESULT]',
  ERROR: '[ERROR]',
  WARNING: '[WARNING]',
  INFO: '[INFO]'
};

/**
 * Formats a timestamp for logging.
 * 
 * @returns {string} Formatted timestamp
 */
function getTimestamp() {
  return new Date().toISOString();
}

/**
 * Prints a section header.
 * 
 * @param {string} sectionName - Section name from SECTIONS
 */
export function section(sectionName) {
  console.log(`\n${sectionName}`);
}

/**
 * Prints a line of output.
 * 
 * @param {string} message - Message to print
 */
export function line(message) {
  console.log(message);
}

/**
 * Prints an indented line.
 * 
 * @param {string} message - Message to print
 * @param {number} [spaces=2] - Number of spaces to indent
 */
export function indent(message, spaces = 2) {
  console.log(' '.repeat(spaces) + message);
}

/**
 * Logs a message with level and timestamp.
 * 
 * @param {string} level - Log level
 * @param {string} message - Message to log
 */
export function log(level, message) {
  const timestamp = getTimestamp();
  console.log(`[${timestamp}] ${level}: ${message}`);
}

/**
 * Logs an info message.
 * 
 * @param {string} message - Message to log
 */
export function info(message) {
  log('INFO', message);
}

/**
 * Logs a warning message.
 * 
 * @param {string} message - Message to log
 */
export function warn(message) {
  log('WARN', message);
}

/**
 * Logs an error message.
 * 
 * @param {string} message - Message to log
 */
export function error(message) {
  const timestamp = getTimestamp();
  console.error(`[${timestamp}] ERROR: ${message}`);
}

/**
 * Prints a separator line.
 */
export function separator() {
  console.log('---');
}

/**
 * Prints a header (plain text, no styling).
 * 
 * @param {string} text - Header text
 */
export function header(text) {
  console.log(`\n${text}`);
}

/**
 * Prints a diff in plain text format.
 * No syntax highlighting in v1.
 * 
 * @param {string} diff - Unified diff string
 */
export function printDiff(diff) {
  console.log(diff);
}

/**
 * Prints key-value pair.
 * 
 * @param {string} key - Key name
 * @param {string} value - Value
 */
export function keyValue(key, value) {
  console.log(`  ${key}: ${value}`);
}

/**
 * Prints a success result.
 * 
 * @param {string} message - Success message
 */
export function success(message) {
  console.log(`SUCCESS: ${message}`);
}

/**
 * Prints a failure result.
 * 
 * @param {string} message - Failure message
 */
export function failure(message) {
  console.log(`FAILED: ${message}`);
}

/**
 * Prints an abort result.
 * 
 * @param {string} message - Abort message
 */
export function abort(message) {
  console.log(`ABORTED: ${message}`);
}

export default {
  SECTIONS,
  section,
  line,
  indent,
  log,
  info,
  warn,
  error,
  separator,
  header,
  printDiff,
  keyValue,
  success,
  failure,
  abort
};
