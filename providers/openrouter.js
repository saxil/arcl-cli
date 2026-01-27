/**
 * OpenRouter Provider
 * 
 * Multi-model gateway. Single API key, multiple models.
 */

import { SYSTEM_PROMPT } from '../llm.js';

/** OpenRouter API endpoint */
const API_URL = 'https://openrouter.ai/api/v1/chat/completions';

/** Default model - Claude 3.5 Sonnet via OpenRouter */
const DEFAULT_MODEL = 'anthropic/claude-3.5-sonnet';

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
 * Gets API key from environment.
 * @returns {string|null}
 */
function getApiKey() {
  return process.env.OPENROUTER_API_KEY || null;
}

/**
 * Gets model from environment or uses default.
 * @returns {string}
 */
function getModel() {
  return process.env.GLM_MODEL || DEFAULT_MODEL;
}

/**
 * Builds user message.
 * @param {ProviderRequest} request
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
 * Calls OpenRouter API.
 * 
 * @param {ProviderRequest} request
 * @returns {Promise<ProviderResponse>}
 */
export async function callOpenRouter(request) {
  const apiKey = getApiKey();
  
  if (!apiKey) {
    return {
      type: 'error',
      error: 'OPENROUTER_API_KEY not set. Export it to your environment.'
    };
  }

  const userMessage = buildUserMessage(request);
  const model = getModel();

  const body = {
    model,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userMessage }
    ],
    max_tokens: 4096,
    temperature: 0
  };

  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'HTTP-Referer': 'https://github.com/glm-cli',
        'X-Title': 'glm'
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const errorText = await response.text();
      return {
        type: 'error',
        error: `OpenRouter API error ${response.status}: ${errorText.slice(0, 200)}`
      };
    }

    const data = await response.json();

    // Extract text from response
    const text = data.choices?.[0]?.message?.content?.trim();
    
    if (!text) {
      return {
        type: 'error',
        error: 'Empty response from OpenRouter'
      };
    }

    // Classify output
    if (text === 'NO_CHANGES') {
      return { type: 'no_changes' };
    }

    if (text === 'REFUSE') {
      return { type: 'refuse' };
    }

    // Assume diff (validation happens centrally)
    return {
      type: 'diff',
      content: text
    };

  } catch (err) {
    return {
      type: 'error',
      error: `Network error: ${err.message}`
    };
  }
}

export default { callOpenRouter };
