/**
 * Configuration constants for the Rules Engine
 */

const DEFAULT_BACKEND_URL = "http://localhost:8080";

// Compute base URL once
const baseUrl = (process.env.RULES_ENGINE_URL || DEFAULT_BACKEND_URL).replace(/\/$/, '');

export const RULES_ENGINE_CONFIG = {
  // API Configuration
  TOGETHER_AI_BASE_URL: "https://api.together.ai/v1/chat/completions",
  MODEL_NAME: "meta-llama/Llama-4-Scout-17B-16E-Instruct",
  
  // Backend URLs (computed from environment)
  BACKEND_URL: baseUrl,
  MCP_SERVER_URL: `${baseUrl}/sse`,
  HEALTH_CHECK_URL: `${baseUrl}/health`,
  TOOL_URL: `${baseUrl}/tool`,
  
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
  
  // Environment Variables
  TOGETHER_API_KEY: process.env.TOGETHER_API_KEY || null,
} as const;

