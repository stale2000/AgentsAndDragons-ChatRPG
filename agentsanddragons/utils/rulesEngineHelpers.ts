/**
 * Helper functions for the Rules Engine API
 */

import type {
  RulesEngineErrorResponse,
  HealthCheckResponse,
  NormalizedToolArgs,
  StructuredToolArg,
  TogetherAIMessage,
} from "@/types/rulesEngine";
import type { Message as VercelChatMessage } from "ai";
import { RULES_ENGINE_CONFIG, getHealthCheckUrl } from "./rulesEngineConfig";

/**
 * Convert Vercel AI SDK messages to Together AI API format
 */
export function convertToTogetherAIMessages(messages: VercelChatMessage[]): TogetherAIMessage[] {
  return messages
    .filter((msg): msg is VercelChatMessage & { role: "user" | "assistant" } => 
      msg.role === "user" || msg.role === "assistant"
    )
    .map((msg): TogetherAIMessage => ({
      role: msg.role === "assistant" ? "assistant" : "user",
      content: typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content),
    }));
}

/**
 * Create a standardized error response
 */
export function createErrorResponse(
  error: string,
  details?: string,
  suggestion?: string,
  healthCheckUrl?: string
): RulesEngineErrorResponse {
  const response: RulesEngineErrorResponse = { error };
  if (details) response.details = details;
  if (suggestion) response.suggestion = suggestion;
  if (healthCheckUrl) response.healthCheckUrl = healthCheckUrl;
  return response;
}

/**
 * Create a backend unavailable error response
 */
export function createBackendUnavailableError(baseUrl: string): RulesEngineErrorResponse {
  return createErrorResponse(
    `Rules engine backend is not available at ${baseUrl}. Please ensure the backend is running.`,
    `Make sure you've started the backend server with: npm run build && node dist/http-server.js (from the ChatRPG root directory)`,
    undefined,
    getHealthCheckUrl()
  );
}

/**
 * Check backend health
 */
export async function checkBackendHealth(): Promise<{ healthy: boolean; error?: string }> {
  try {
    const healthUrl = getHealthCheckUrl();
    const response = await fetch(healthUrl, {
      method: 'GET',
      signal: AbortSignal.timeout(RULES_ENGINE_CONFIG.HEALTH_CHECK_TIMEOUT),
    });

    if (!response.ok) {
      return {
        healthy: false,
        error: `Backend returned status ${response.status}`,
      };
    }

    const healthData = (await response.json()) as HealthCheckResponse;
    if (healthData.status !== 'ok') {
      return {
        healthy: false,
        error: `Backend returned status: ${healthData.status}`,
      };
    }

    return { healthy: true };
  } catch (error) {
    return {
      healthy: false,
      error: error instanceof Error ? error.message : "Connection failed",
    };
  }
}

/**
 * Extract tool output text from MCP tool result
 */
export function extractToolOutput(
  content: Array<{ type: string; text: string }> | undefined
): string {
  return content?.map((item) => item.text).join('\n') || '';
}

/**
 * Normalize tool arguments by extracting values from structured format
 * Handles cases where AI returns {type: "string", value: "actual"} instead of just "actual"
 */
export function normalizeToolArgs(args: unknown): NormalizedToolArgs {
  if (args === null || args === undefined) {
    return args;
  }

  if (Array.isArray(args)) {
    return args.map(normalizeToolArgs);
  }

  if (typeof args === 'object' && args !== null) {
    // Check if this is a structured argument object with type and value
    const structuredArg = args as Partial<StructuredToolArg>;
    if (
      'type' in structuredArg &&
      'value' in structuredArg &&
      Object.keys(structuredArg).length === 2
    ) {
      // Extract the value and normalize it recursively
      return normalizeToolArgs(structuredArg.value);
    }

    // Otherwise, normalize all properties recursively
    const normalized: Record<string, NormalizedToolArgs> = {};
    for (const [key, value] of Object.entries(args)) {
      normalized[key] = normalizeToolArgs(value);
    }
    return normalized;
  }

  // Primitive value, return as-is
  return args as NormalizedToolArgs;
}

/**
 * Parse and normalize tool call arguments
 */
export function parseToolCallArguments(
  argumentsString: string
): Record<string, NormalizedToolArgs> {
  const rawArgs = JSON.parse(argumentsString || '{}') as unknown;
  return normalizeToolArgs(rawArgs) as Record<string, NormalizedToolArgs>;
}

