/**
 * LLM Abstraction Layer
 * 
 * Provider-agnostic interface for LLM interactions.
 * Phase 1: Mock implementation for testing.
 * Phase 2: Multi-file support and feedback context.
 * Future: Plug in OpenAI, Anthropic, local models, etc.
 */

/**
 * @typedef {Object} LLMRequest
 * @property {string} fileContent - The content of the file to modify
 * @property {string} filePath - Path to the file being modified
 * @property {string} instruction - User's intent/instruction
 * @property {string} [feedbackContext] - Previous failure feedback (Phase 2)
 * @property {Object[]} [additionalFiles] - Additional file contexts (Phase 2)
 */

/**
 * @typedef {Object} LLMResponse
 * @property {boolean} success - Whether the LLM call succeeded
 * @property {string|null} diff - Unified diff output (null on failure)
 * @property {string|null} error - Error message (null on success)
 */

/**
 * @typedef {Object} MultiFileRequest
 * @property {string} intent - User's high-level intent
 * @property {Object[]} files - Array of {path, content} objects
 * @property {string} [feedbackContext] - Previous iteration feedback
 * @property {string} [planContext] - Planning context
 */

/**
 * @typedef {Object} MultiFileResponse
 * @property {boolean} success - Whether the LLM call succeeded
 * @property {Object[]} diffs - Array of {filePath, diff} objects
 * @property {string|null} error - Error message (null on success)
 */

/**
 * System prompt that enforces diff-only output from the LLM.
 * The LLM must return ONLY a unified diff, no explanations.
 */
export const SYSTEM_PROMPT = `You are a CLI-based coding agent that assists with software engineering tasks.

You operate OUTSIDE the editor. The filesystem is your only interface.
You do not control an IDE, UI, or editor internals.

Your primary function is to propose SAFE, REVIEWABLE code changes.

CORE RULES (NON-NEGOTIABLE):

1. You MUST ONLY propose changes as UNIFIED DIFFS.
2. You MUST ONLY modify files that already exist.
3. You MUST NEVER invent filenames, directories, APIs, or dependencies.
4. You MUST NEVER rewrite entire files unless explicitly instructed.
5. You MUST prefer small, localized, reversible edits.
6. If context is insufficient, you MUST refuse and ask for clarification.
7. If a request is ambiguous, unsafe, or underspecified, you MUST refuse.
8. You MUST fail loudly rather than guess.

OUTPUT CONTRACT:

- When proposing code changes, output ONLY a valid unified diff.
- No explanations, no prose, no markdown outside the diff.
- If no changes are required, output exactly: NO_CHANGES.
- If the request cannot be fulfilled safely, output exactly: REFUSE.

BEHAVIORAL CONSTRAINTS:

- Do not speculate.
- Do not optimize prematurely.
- Do not introduce new libraries unless explicitly instructed AND they already exist in the project.
- Do not execute commands.
- Do not assume tests exist.
- Do not mention policies, safety rules, or internal reasoning.

SECURITY & SAFETY:

- Do not expose, log, or fabricate secrets or credentials.
- Do not add telemetry, tracking, or network calls.
- Do not generate URLs unless explicitly provided by the user.

TONE & STYLE:

- Be concise.
- Be mechanical.
- Be deterministic.
- Treat the user as a technical peer.
- Silence is preferred over verbosity.

ROLE BOUNDARY:

You propose changes.
The runtime applies changes.
You do not confirm success.
You do not narrate actions.

Obey the contract or refuse.

`;

/**
 * System prompt for multi-file edits with feedback loop.
 */
export const MULTI_FILE_SYSTEM_PROMPT = `You are a CLI-based coding agent that assists with software engineering tasks.

You operate OUTSIDE the editor. The filesystem is your only interface.
You do not control an IDE, UI, or editor internals.

Your primary function is to propose SAFE, REVIEWABLE code changes.

CORE RULES (NON-NEGOTIABLE):

1. You MUST ONLY propose changes as UNIFIED DIFFS.
2. You MUST ONLY modify files that already exist.
3. You MUST NEVER invent filenames, directories, APIs, or dependencies.
4. You MUST NEVER rewrite entire files unless explicitly instructed.
5. You MUST prefer small, localized, reversible edits.
6. If context is insufficient, you MUST refuse and ask for clarification.
7. If a request is ambiguous, unsafe, or underspecified, you MUST refuse.
8. You MUST fail loudly rather than guess.

OUTPUT CONTRACT:

- When proposing code changes, output ONLY a valid unified diff.
- No explanations, no prose, no markdown outside the diff.
- If no changes are required, output exactly: NO_CHANGES.
- If the request cannot be fulfilled safely, output exactly: REFUSE.

BEHAVIORAL CONSTRAINTS:

- Do not speculate.
- Do not optimize prematurely.
- Do not introduce new libraries unless explicitly instructed AND they already exist in the project.
- Do not execute commands.
- Do not assume tests exist.
- Do not mention policies, safety rules, or internal reasoning.

SECURITY & SAFETY:

- Do not expose, log, or fabricate secrets or credentials.
- Do not add telemetry, tracking, or network calls.
- Do not generate URLs unless explicitly provided by the user.

TONE & STYLE:

- Be concise.
- Be mechanical.
- Be deterministic.
- Treat the user as a technical peer.
- Silence is preferred over verbosity.

ROLE BOUNDARY:

You propose changes.
The runtime applies changes.
You do not confirm success.
You do not narrate actions.

Obey the contract or refuse.
`;

/**
 * System prompt for project scaffolding.
 * Generates content for multiple files in a new project.
 */
export const SCAFFOLD_PROMPT = `You are a project scaffolding assistant.

Your task is to generate complete, working file contents for a new project.

OUTPUT FORMAT:
For each file requested, output:
===FILE: <relative-path>===
<complete file content>
===END===

RULES:
1. Generate ALL requested files
2. Each file must be complete and functional
3. Use the exact file paths provided
4. No explanations outside the file blocks
5. Code should be simple, readable, and working
6. Follow best practices for the language/framework

EXAMPLE OUTPUT:
===FILE: README.md===
# My Project
Description here.
===END===
===FILE: src/main.py===
#!/usr/bin/env python3
def main():
    print("Hello")
if __name__ == "__main__":
    main()
===END===

Generate content for all requested files now.
`;

/**
 * Mock LLM implementation for testing without API.
 * Returns a simulated diff based on simple heuristics.
 * 
 * @param {LLMRequest} request 
 * @returns {Promise<LLMResponse>}
 */
export async function mockLLM(request) {
  const { fileContent, filePath, instruction, feedbackContext } = request;
  
  // Simulate network delay
  await new Promise(resolve => setTimeout(resolve, 100));
  
  // If there's feedback, simulate "fixing" the issue
  if (feedbackContext) {
    const lines = fileContent.split('\n');
    const diff = `--- a/${filePath}
+++ b/${filePath}
@@ -1,${Math.min(lines.length, 3)} +1,${Math.min(lines.length, 3) + 1} @@
 ${lines.slice(0, 3).join('\n ')}
+// Fixed based on feedback: ${feedbackContext.slice(0, 50)}
`;
    return { success: true, diff, error: null };
  }
  
  // Simple mock: if instruction contains "add", append a comment
  if (instruction.toLowerCase().includes('add')) {
    const lines = fileContent.split('\n');
    const diff = `--- a/${filePath}
+++ b/${filePath}
@@ -1,${lines.length} +1,${lines.length + 1} @@
 ${lines.join('\n ')}
+// Added by vibe-agent
`;
    return { success: true, diff, error: null };
  }
  
  // Default mock response
  return {
    success: true,
    diff: `--- a/${filePath}
+++ b/${filePath}
@@ -1,1 +1,1 @@
-${fileContent.split('\n')[0]}
+${fileContent.split('\n')[0]} // modified by vibe-agent
`,
    error: null
  };
}

// Import provider router
import { callProvider, getProviderName } from './providers/index.js';

/**
 * Check if any real provider is configured.
 * 
 * @returns {boolean}
 */
function hasProvider() {
  return !!(
    process.env.GEMINI_API_KEY ||
    process.env.GOOGLE_API_KEY ||
    process.env.OPENROUTER_API_KEY ||
    process.env.ANTHROPIC_API_KEY ||
    process.env.GLM_PROVIDER === 'local'
  );
}

/**
 * Converts provider response to LLM response format.
 * 
 * @param {Object} providerResponse - Response from provider
 * @returns {LLMResponse}
 */
function toResponse(providerResponse) {
  switch (providerResponse.type) {
    case 'diff':
      return { success: true, diff: providerResponse.content, error: null };
    case 'no_changes':
      return { success: true, diff: 'NO_CHANGES', error: null };
    case 'refuse':
      return { success: false, diff: null, error: 'REFUSE: Model refused to make changes' };
    case 'error':
      return { success: false, diff: null, error: providerResponse.error };
    default:
      return { success: false, diff: null, error: 'Unknown provider response' };
  }
}

/**
 * LLM provider interface with retry logic.
 * 
 * Retry policy:
 * - One automatic retry on validation failure
 * - Retry includes feedback about the failure
 * - Second failure = hard abort
 * 
 * @param {LLMRequest} request 
 * @returns {Promise<LLMResponse>}
 */
export async function callLLM(request) {
  if (!hasProvider()) {
    console.error('Warning: No LLM provider configured, using mock');
    return mockLLM(request);
  }

  const providerName = getProviderName();
  
  // First attempt
  const response = await callProvider(request);
  
  if (response.type === 'error') {
    return toResponse(response);
  }
  
  if (response.type === 'no_changes' || response.type === 'refuse') {
    return toResponse(response);
  }
  
  // Validate the diff
  const validation = validateDiffFormat(response.content, request.filePath);
  
  if (validation.valid) {
    return toResponse(response);
  }
  
  // First attempt invalid - retry with feedback
  console.error(`[${providerName}] Invalid output, retrying...`);
  
  const retryRequest = {
    ...request,
    feedbackContext: `Your previous output was invalid: ${validation.error}. Output ONLY a valid unified diff.`
  };
  
  const retryResponse = await callProvider(retryRequest);
  
  if (retryResponse.type === 'error') {
    return toResponse(retryResponse);
  }
  
  if (retryResponse.type === 'no_changes' || retryResponse.type === 'refuse') {
    return toResponse(retryResponse);
  }
  
  // Validate retry
  const retryValidation = validateDiffFormat(retryResponse.content, request.filePath);
  
  if (retryValidation.valid) {
    return toResponse(retryResponse);
  }
  
  // Second failure - hard abort
  return {
    success: false,
    diff: null,
    error: `Provider ${providerName} failed validation twice: ${retryValidation.error}`
  };
}

/**
 * LLM call for project scaffolding.
 * Uses SCAFFOLD_PROMPT and bypasses diff validation.
 * 
 * @param {string} prompt - The scaffolding prompt
 * @returns {Promise<{success: boolean, content?: string, error?: string}>}
 */
export async function callScaffoldLLM(prompt) {
  if (!hasProvider()) {
    // Return mock scaffold content
    return {
      success: true,
      content: `===FILE: README.md===
# Project
Generated by glm
===END===
===FILE: src/main.py===
#!/usr/bin/env python3
def main():
    print("Hello, world!")

if __name__ == "__main__":
    main()
===END===
===FILE: requirements.txt===
# Add dependencies here
===END===
===FILE: .gitignore===
__pycache__/
*.pyc
venv/
.env
===END===`
    };
  }

  // Call provider with scaffold prompt (bypass normal validation)
  const response = await callProvider({
    fileContent: prompt,
    filePath: 'scaffold',
    instruction: 'Generate all file contents as specified.',
    isScaffold: true
  });

  if (response.type === 'error') {
    return { success: false, error: response.error };
  }

  if (response.type === 'refuse') {
    return { success: false, error: 'Model refused to generate content' };
  }

  return { success: true, content: response.content };
}

/**
 * Multi-file LLM call (not supported in v1).
 * 
 * @param {MultiFileRequest} request
 * @returns {Promise<MultiFileResponse>}
 */
export async function callMultiFileLLM(request) {
  if (hasProvider()) {
    return {
      success: false,
      diffs: [],
      error: 'Multi-file edits not supported in v1. Use single-file mode.'
    };
  }
  return mockMultiFileLLM(request);
}

/**
 * Mock multi-file LLM for testing.
 * 
 * @param {MultiFileRequest} request
 * @returns {Promise<MultiFileResponse>}
 */
export async function mockMultiFileLLM(request) {
  const { files, intent, feedbackContext } = request;
  
  // Simulate network delay
  await new Promise(resolve => setTimeout(resolve, 150));
  
  const diffs = [];
  
  for (const file of files) {
    const lines = file.content.split('\n');
    const baseName = file.path.split(/[/\\]/).pop();
    
    let comment = `// Modified by vibe-agent: ${intent.slice(0, 30)}`;
    if (feedbackContext) {
      comment = `// Fixed: ${feedbackContext.slice(0, 30)}`;
    }
    
    diffs.push({
      filePath: file.path,
      diff: `--- a/${baseName}
+++ b/${baseName}
@@ -1,${Math.min(lines.length, 2)} +1,${Math.min(lines.length, 2) + 1} @@
 ${lines.slice(0, 2).join('\n ')}
+${comment}
`
    });
  }
  
  return { success: true, diffs, error: null };
}

/**
 * Validates that a string is a proper unified diff.
 * 
 * Strict validation rules (v1):
 * - Exactly one file per diff
 * - Headers must match target file
 * - Reject full-file rewrites unless explicitly allowed
 * 
 * @param {string} diff - The diff to validate
 * @param {string} [targetFile] - Expected target filename (for header matching)
 * @param {Object} [options] - Validation options
 * @param {boolean} [options.allowFullRewrite=false] - Allow diffs that replace all content
 * @returns {{valid: boolean, error: string|null}}
 */
export function validateDiffFormat(diff, targetFile = null, options = {}) {
  const { allowFullRewrite = false } = options;
  
  if (!diff || typeof diff !== 'string') {
    return { valid: false, error: 'Diff is empty or not a string' };
  }
  
  const trimmed = diff.trim();
  
  // Handle special LLM responses
  if (trimmed === 'NO_CHANGES') {
    return { valid: false, error: 'NO_CHANGES' };
  }
  
  if (trimmed === 'REFUSE') {
    return { valid: false, error: 'REFUSE: LLM refused to make changes' };
  }
  
  // Check for error response from LLM
  if (trimmed.startsWith('ERROR:')) {
    return { valid: false, error: trimmed };
  }
  
  // Must contain unified diff markers
  if (!diff.includes('---') || !diff.includes('+++')) {
    return { valid: false, error: 'Missing unified diff headers (--- and +++)' };
  }
  
  // Must contain at least one valid hunk header
  // Format: @@ -start,count +start,count @@ or @@ -start +start @@
  const hunkHeaderPattern = /@@ -\d+(?:,\d+)? \+\d+(?:,\d+)? @@/;
  if (!hunkHeaderPattern.test(diff)) {
    return { valid: false, error: 'Invalid or missing hunk header (expected @@ -N,N +N,N @@)' };
  }
  
  // Extract file headers
  const lines = diff.split('\n');
  const minusHeaders = lines.filter(l => l.startsWith('--- '));
  const plusHeaders = lines.filter(l => l.startsWith('+++ '));
  
  // v1: Exactly one file per diff
  if (minusHeaders.length !== 1 || plusHeaders.length !== 1) {
    return { 
      valid: false, 
      error: `Invalid diff: expected exactly 1 file, found ${minusHeaders.length} --- headers and ${plusHeaders.length} +++ headers` 
    };
  }
  
  // Extract filenames from headers (handle "--- a/file.js" or "--- file.js")
  const extractFilename = (header) => {
    const parts = header.split(/\s+/);
    if (parts.length < 2) return null;
    let filename = parts[1];
    // Strip a/ or b/ prefix
    if (filename.startsWith('a/') || filename.startsWith('b/')) {
      filename = filename.slice(2);
    }
    return filename;
  };
  
  const minusFile = extractFilename(minusHeaders[0]);
  const plusFile = extractFilename(plusHeaders[0]);
  
  if (!minusFile || !plusFile) {
    return { valid: false, error: 'Could not parse filenames from diff headers' };
  }
  
  // Headers must refer to the same file (no renames in v1)
  if (minusFile !== plusFile) {
    return { valid: false, error: `Diff headers mismatch: --- ${minusFile} vs +++ ${plusFile}` };
  }
  
  // If target file specified, headers must match
  if (targetFile) {
    const targetBasename = targetFile.split(/[/\\]/).pop();
    if (minusFile !== targetBasename && plusFile !== targetBasename) {
      return { 
        valid: false, 
        error: `Diff target mismatch: expected ${targetBasename}, got ${minusFile}` 
      };
    }
  }
  
  // Detect full-file rewrite: all lines removed, or more deletions than reasonable
  if (!allowFullRewrite) {
    const hunkHeaders = lines.filter(l => l.startsWith('@@'));
    for (const hunk of hunkHeaders) {
      // Parse @@ -start,count +start,count @@
      const match = hunk.match(/@@ -(\d+),(\d+) \+(\d+),(\d+) @@/);
      if (match) {
        const oldCount = parseInt(match[2], 10);
        const newCount = parseInt(match[4], 10);
        // If removing all lines (old > 0 and new === 0), reject
        if (oldCount > 0 && newCount === 0) {
          return { 
            valid: false, 
            error: 'Full-file deletion detected. Use --allow-rewrite to permit.' 
          };
        }
        // If replacing >90% of file in a single hunk, likely a full rewrite
        if (oldCount > 10 && newCount > 10) {
          const deletions = lines.filter(l => l.startsWith('-') && !l.startsWith('---')).length;
          const additions = lines.filter(l => l.startsWith('+') && !l.startsWith('+++')).length;
          // If we're replacing nearly everything, flag it
          if (deletions > 0 && additions > 0 && Math.min(deletions, additions) > 20) {
            return {
              valid: false,
              error: `Suspicious full rewrite: ${deletions} deletions, ${additions} additions. Use --allow-rewrite to permit.`
            };
          }
        }
      }
    }
  }
  
  return { valid: true, error: null };
}

export default { callLLM, mockLLM, validateDiffFormat, SYSTEM_PROMPT };
