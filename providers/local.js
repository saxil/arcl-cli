/**
 * Local Provider
 * 
 * Supports Ollama or llama.cpp HTTP API.
 * Requires explicit user setup.
 */

import { SYSTEM_PROMPT } from '../llm.js';

/** Default Ollama endpoint */
const DEFAULT_URL = 'http://localhost:11434/api/generate';

/** Default model */
const DEFAULT_MODEL = 'codellama';

/**
 * @typedef {Object} ProviderRequest
 * @property {string} filePath - Filename (basename)
 * @property {string} fileContent - File content
 * @property {string} instruction - Edit instruction
 * @property {string} [feedbackContext] - Retry context
 */

/**
 * @typedef {Object} ProviderResponse
 * @property {'diff'|'no_changes'|'refuse'|'error'} type
 * @property {string} [content] - Diff content (if type === 'diff')
 * @property {string} [error] - Error message (if type === 'error')
 */

/**
 * Gets endpoint URL from environment.
 * @returns {string}
 */
function getEndpoint() {
  return process.env.GLM_LOCAL_URL || DEFAULT_URL;
}

/**
 * Gets model from environment.
 * @returns {string}
 */
function getModel() {
  return process.env.GLM_LOCAL_MODEL || DEFAULT_MODEL;
}

/**
 * Builds prompt for local model.
 * @param {ProviderRequest} request
 * @returns {string}
 */
function buildPrompt(request) {
  const { fileContent, filePath, instruction, feedbackContext, isScaffold, isAsk, askPrompt } = request;
  
  // Use ask prompt for read-only mode
  if (isAsk) {
    return askPrompt || `Explain this code:\n\n${fileContent}\n\nQuestion: ${instruction}`;
  }
  
  // Use scaffold prompt for project creation
  if (isScaffold) {
    return `You are a project scaffolding assistant.

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

${fileContent}

Generate content for all requested files now.`;
  }
  
  let message = `${SYSTEM_PROMPT}

File: ${filePath}
\`\`\`
${fileContent}
\`\`\`

Instruction: ${instruction}

Respond with ONLY a unified diff. No explanations.`;

  if (feedbackContext) {
    message += `\n\nPrevious attempt failed: ${feedbackContext}\nTry again, fixing the issue.`;
  }

  return message;
}

/**
 * Calls local Ollama API.
 * 
 * @param {ProviderRequest} request
 * @returns {Promise<ProviderResponse>}
 */
export async function callLocal(request) {
  const endpoint = getEndpoint();
  const model = getModel();
  const prompt = buildPrompt(request);

  const body = {
    model,
    prompt,
    stream: false,
    options: {
      temperature: 0,
      num_predict: 4096
    }
  };

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const errorText = await response.text();
      return {
        type: 'error',
        error: `Local API error ${response.status}: ${errorText.slice(0, 200)}`
      };
    }

    const data = await response.json();

    // Extract text from Ollama response
    const text = data.response?.trim();
    
    if (!text) {
      return {
        type: 'error',
        error: 'Empty response from local model'
      };
    }

    // Classify output
    if (text === 'NO_CHANGES') {
      return { type: 'no_changes' };
    }

    if (text === 'REFUSE') {
      return { type: 'refuse' };
    }

    // For scaffold and ask modes, return content directly
    if (request.isScaffold || request.isAsk) {
      return {
        type: 'diff',
        content: text
      };
    }

    // Assume diff (validation happens centrally)
    return {
      type: 'diff',
      content: text
    };

  } catch (err) {
    // Connection refused typically means Ollama isn't running
    if (err.code === 'ECONNREFUSED') {
      return {
        type: 'error',
        error: `Local model not available at ${endpoint}. Is Ollama running?`
      };
    }
    return {
      type: 'error',
      error: `Network error: ${err.message}`
    };
  }
}

export default { callLocal };
