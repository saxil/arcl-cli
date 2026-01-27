/**
 * Provider Router (v2.3)
 * 
 * Routes LLM requests to the selected provider.
 * Provider selection via ARCL_PROVIDER environment variable.
 * 
 * Features:
 * - Health checks
 * - Automatic fallback on failure
 * - Clear status messaging
 * 
 * Supported providers:
 * - gemini (default)
 * - openrouter
 * - local
 */

import { callGemini } from './gemini.js';
import { callOpenRouter } from './openrouter.js';
import { callLocal } from './local.js';

/** Default provider */
const DEFAULT_PROVIDER = 'gemini';

/** Fallback order */
const FALLBACK_ORDER = ['gemini', 'openrouter', 'local'];

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
 * Checks if a provider is available (has credentials).
 * 
 * @param {string} providerName
 * @returns {boolean}
 */
export function isProviderAvailable(providerName) {
  switch (providerName) {
    case 'gemini':
      return !!(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY);
    case 'openrouter':
      return !!process.env.OPENROUTER_API_KEY;
    case 'local':
      return true; // Always available (may fail at runtime)
    default:
      return false;
  }
}

/**
 * Gets the selected provider name.
 * @returns {string}
 */
export function getProviderName() {
  return process.env.ARCL_PROVIDER || DEFAULT_PROVIDER;
}

/**
 * Gets the next available fallback provider.
 * 
 * @param {string} currentProvider - The provider that failed
 * @returns {string|null}
 */
function getNextFallback(currentProvider) {
  const currentIdx = FALLBACK_ORDER.indexOf(currentProvider);
  
  for (let i = currentIdx + 1; i < FALLBACK_ORDER.length; i++) {
    const candidate = FALLBACK_ORDER[i];
    if (isProviderAvailable(candidate)) {
      return candidate;
    }
  }
  
  return null;
}

/**
 * Routes request to the selected provider with fallback.
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

  // Try primary provider
  const response = await provider(request);
  
  // Check for transient errors that warrant fallback
  if (response.type === 'error' && shouldFallback(response.error)) {
    const fallback = getNextFallback(providerName);
    
    if (fallback) {
      console.error(`Warning: ${providerName} unavailable, falling back to ${fallback}`);
      const fallbackProvider = PROVIDERS[fallback];
      return fallbackProvider(request);
    }
  }
  
  return response;
}

/**
 * Determines if an error should trigger fallback.
 * 
 * @param {string} error
 * @returns {boolean}
 */
function shouldFallback(error) {
  if (!error) return false;
  
  const transientPatterns = [
    /overloaded/i,
    /rate limit/i,
    /503/,
    /502/,
    /timeout/i,
    /ECONNREFUSED/,
    /unavailable/i,
    /capacity/i
  ];
  
  return transientPatterns.some(p => p.test(error));
}

/**
 * Gets health status of all providers.
 * 
 * @returns {Object<string, {available: boolean, configured: boolean}>}
 */
export function getProviderHealth() {
  const health = {};
  
  for (const name of Object.keys(PROVIDERS)) {
    health[name] = {
      available: isProviderAvailable(name),
      configured: name === 'local' || isProviderAvailable(name)
    };
  }
  
  return health;
}

/**
 * Lists available providers.
 * @returns {string[]}
 */
export function listProviders() {
  return Object.keys(PROVIDERS);
}

export default { 
  callProvider, 
  getProviderName, 
  listProviders, 
  isProviderAvailable,
  getProviderHealth 
};
