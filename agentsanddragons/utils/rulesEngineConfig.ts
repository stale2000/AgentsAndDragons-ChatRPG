/**
 * Configuration constants for the Rules Engine
 */

export const RULES_ENGINE_CONFIG = {
  // API Configuration
  TOGETHER_AI_BASE_URL: "https://api.together.ai/v1/chat/completions",
  MODEL_NAME: "meta-llama/Llama-4-Scout-17B-16E-Instruct",
  
  // Default URLs
  DEFAULT_BACKEND_URL: "http://localhost:8080",
  SSE_ENDPOINT: "/sse",
  HEALTH_ENDPOINT: "/health",
  TOOL_ENDPOINT: "/tool",
  
  // Timeouts (in milliseconds)
  HEALTH_CHECK_TIMEOUT: 5000,
  TOOL_EXECUTION_TIMEOUT: 30000,
  
  // Model Configuration
  DEFAULT_TEMPERATURE: 0,
  DEFAULT_MAX_TOKENS: 2048,
  TOOL_CHOICE: "auto" as const,
  
  // Iteration Limits
  MAX_ITERATIONS: 10,
  
  // Logging
  LOG_PREFIX: "[Rules Engine API]",
  MCP_LOG_PREFIX: "[MCP Tool API]",
} as const;

/**
 * Get the backend base URL from environment or use default
 */
export function getBackendUrl(): string {
  const url = process.env.RULES_ENGINE_URL || RULES_ENGINE_CONFIG.DEFAULT_BACKEND_URL;
  return url.replace(/\/$/, '');
}

/**
 * Get the Together AI API key from environment
 */
export function getTogetherApiKey(): string | null {
  return process.env.TOGETHER_API_KEY || null;
}

/**
 * Get the MCP server URL
 */
export function getMcpServerUrl(): string {
  const baseUrl = getBackendUrl();
  return `${baseUrl}${RULES_ENGINE_CONFIG.SSE_ENDPOINT}`;
}

/**
 * Get the health check URL
 */
export function getHealthCheckUrl(): string {
  const baseUrl = getBackendUrl();
  return `${baseUrl}${RULES_ENGINE_CONFIG.HEALTH_ENDPOINT}`;
}

/**
 * Get the tool endpoint URL
 */
export function getToolUrl(): string {
  const baseUrl = getBackendUrl();
  return `${baseUrl}${RULES_ENGINE_CONFIG.TOOL_ENDPOINT}`;
}

