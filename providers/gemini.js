/**
 * Gemini Provider
 * 
 * Primary provider. Text-only Gemini API.
 * No tools, no function calling.
 */

import { SYSTEM_PROMPT, SCAFFOLD_PROMPT, ASK_PROMPT } from '../llm.js';

/** Gemini API endpoint */
const API_URL = 'https://generativelanguage.googleapis.com/v1beta/models';

/** Default model */
const DEFAULT_MODEL = 'gemini-2.5-flash';

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
  return process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || null;
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
 * Calls Gemini API.
 * 
 * @param {ProviderRequest} request
 * @returns {Promise<ProviderResponse>}
 */
export async function callGemini(request) {
  const apiKey = getApiKey();
  
  if (!apiKey) {
    return {
      type: 'error',
      error: 'GEMINI_API_KEY not set. Export it to your environment.'
    };
  }

  // Select prompt based on mode
  let systemPrompt = SYSTEM_PROMPT;
  let userMessage;
  
  if (request.isScaffold) {
    systemPrompt = SCAFFOLD_PROMPT;
    userMessage = request.fileContent; // Contains the scaffold prompt
  } else if (request.isAsk) {
    systemPrompt = ASK_PROMPT;
    userMessage = request.askPrompt || `Question about ${request.filePath}: ${request.instruction}`;
  } else {
    userMessage = buildUserMessage(request);
  }
  
  const url = `${API_URL}/${DEFAULT_MODEL}:generateContent?key=${apiKey}`;

  const body = {
    contents: [
      {
        parts: [
          { text: systemPrompt + '\n\n' + userMessage }
        ]
      }
    ],
    generationConfig: {
      temperature: 0,
      maxOutputTokens: 4096
    }
  };

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const errorText = await response.text();
      return {
        type: 'error',
        error: `Gemini API error ${response.status}: ${errorText.slice(0, 200)}`
      };
    }

    const data = await response.json();

    // Extract text from response
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    
    if (!text) {
      return {
        type: 'error',
        error: 'Empty response from Gemini'
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
        type: 'diff', // Reusing type for simplicity
        content: text
      };
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

export default { callGemini };
