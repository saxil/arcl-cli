/**
 * Provider Router
 * 
 * Routes LLM requests to the selected provider.
 * Provider selection via GLM_PROVIDER environment variable.
 * 
 * Supported providers:
 * - gemini (default)
 * - openrouter
 * - local
 * - anthropic
 */

import { callGemini } from './gemini.js';
import { callOpenRouter } from './openrouter.js';
import { callLocal } from './local.js';

/** Default provider */
const DEFAULT_PROVIDER = 'gemini';

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
 * Provider registry.
 */
const PROVIDERS = {
  gemini: callGemini,
  openrouter: callOpenRouter,
  local: callLocal
};

/**
 * Gets the selected provider name.
 * @returns {string}
 */
export function getProviderName() {
  return process.env.GLM_PROVIDER || DEFAULT_PROVIDER;
}

/**
 * Routes request to the selected provider.
 * 
 * @param {ProviderRequest} request
 * @returns {Promise<ProviderResponse>}
 */
export async function callProvider(request) {
  const providerName = getProviderName();
  const provider = PROVIDERS[providerName];

  if (!provider) {
    return {
      type: 'error',
      error: `Unknown provider: ${providerName}. Valid providers: ${Object.keys(PROVIDERS).join(', ')}`
    };
  }

  return provider(request);
}

/**
 * Lists available providers.
 * @returns {string[]}
 */
export function listProviders() {
  return Object.keys(PROVIDERS);
}

export default { callProvider, getProviderName, listProviders };
