/**
 * Anthropic Claude Provider
 * 
 * Clean adapter for Claude API.
 * Cross-platform, no dependencies beyond Node 18+ fetch.
 */

import { SYSTEM_PROMPT } from './llm.js';

/** Default model - Claude 3.5 Sonnet */
const DEFAULT_MODEL = 'claude-sonnet-4-20250514';

/** API endpoint */
const API_URL = 'https://api.anthropic.com/v1/messages';

/** Max tokens for response */
const MAX_TOKENS = 4096;

/**
 * @typedef {Object} ClaudeRequest
 * @property {string} fileContent - File content to modify
 * @property {string} filePath - Filename (basename)
 * @property {string} instruction - User's edit instruction
 * @property {string} [feedbackContext] - Previous failure context for retry
 */

/**
 * @typedef {Object} ClaudeResponse
 * @property {boolean} success - Whether the call succeeded
 * @property {string|null} diff - Unified diff output (null on failure)
 * @property {string|null} error - Error message (null on success)
 * @property {string|null} rawOutput - Raw model output for debugging
 */

/**
 * Gets API key from environment.
 * 
 * @returns {string|null}
 */
function getApiKey() {
  return process.env.ANTHROPIC_API_KEY || null;
}

/**
 * Builds the user message for Claude.
 * 
 * @param {ClaudeRequest} request 
 * @returns {string}
 */
function buildUserMessage(request) {
  const { fileContent, filePath, instruction, feedbackContext } = request;
  
  let message = `File: ${filePath}
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
 * Calls Claude API.
 * 
 * @param {ClaudeRequest} request 
 * @returns {Promise<ClaudeResponse>}
 */
export async function callClaude(request) {
  const apiKey = getApiKey();
  
  if (!apiKey) {
    return {
      success: false,
      diff: null,
      error: 'ANTHROPIC_API_KEY not set. Export it to your environment.',
      rawOutput: null
    };
  }

  const userMessage = buildUserMessage(request);

  const body = {
    model: DEFAULT_MODEL,
    max_tokens: MAX_TOKENS,
    system: SYSTEM_PROMPT,
    messages: [
      { role: 'user', content: userMessage }
    ]
  };

  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const errorText = await response.text();
      return {
        success: false,
        diff: null,
        error: `API error ${response.status}: ${errorText.slice(0, 200)}`,
        rawOutput: errorText
      };
    }

    const data = await response.json();

    // Extract text from response
    const content = data.content?.[0];
    if (!content || content.type !== 'text') {
      return {
        success: false,
        diff: null,
        error: 'Unexpected response format from Claude',
        rawOutput: JSON.stringify(data)
      };
    }

    const rawOutput = content.text.trim();

    // Check for special responses
    if (rawOutput === 'NO_CHANGES') {
      return {
        success: true,
        diff: 'NO_CHANGES',
        error: null,
        rawOutput
      };
    }

    if (rawOutput === 'REFUSE') {
      return {
        success: false,
        diff: null,
        error: 'REFUSE: Claude refused to make changes',
        rawOutput
      };
    }

    // Return the diff (validation happens in caller)
    return {
      success: true,
      diff: rawOutput,
      error: null,
      rawOutput
    };

  } catch (err) {
    // Network errors, JSON parse errors, etc.
    return {
      success: false,
      diff: null,
      error: `Network error: ${err.message}`,
      rawOutput: null
    };
  }
}

export default { callClaude };
