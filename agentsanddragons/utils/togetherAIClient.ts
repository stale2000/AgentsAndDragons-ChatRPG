/**
 * Together AI API client utilities
 */

import type {
  TogetherAIMessage,
  TogetherAITool,
  TogetherAIResponse,
  ToolCallMessage,
  ToolResultMessage,
} from "@/types/rulesEngine";
import { RULES_ENGINE_CONFIG, getTogetherApiKey } from "./rulesEngineConfig";

export type TogetherAIMessageUnion = TogetherAIMessage | ToolCallMessage | ToolResultMessage;

export interface TogetherAIRequestOptions {
  messages: TogetherAIMessageUnion[];
  tools?: TogetherAITool[];
  stream?: boolean;
  temperature?: number;
  maxTokens?: number;
}

/**
 * Create a Together AI API request configuration
 */
export function createTogetherAIRequest(options: TogetherAIRequestOptions): {
  url: string;
  headers: HeadersInit;
  body: string;
} {
  const apiKey = getTogetherApiKey();
  if (!apiKey) {
    throw new Error("TOGETHER_API_KEY environment variable is not set");
  }

  return {
    url: RULES_ENGINE_CONFIG.TOGETHER_AI_BASE_URL,
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: RULES_ENGINE_CONFIG.MODEL_NAME,
      messages: options.messages,
      tools: options.tools,
      tool_choice: RULES_ENGINE_CONFIG.TOOL_CHOICE,
      temperature: options.temperature ?? RULES_ENGINE_CONFIG.DEFAULT_TEMPERATURE,
      max_tokens: options.maxTokens ?? RULES_ENGINE_CONFIG.DEFAULT_MAX_TOKENS,
      stream: options.stream ?? false,
    }),
  };
}

/**
 * Call Together AI API
 */
export async function callTogetherAI(
  options: TogetherAIRequestOptions
): Promise<Response> {
  const request = createTogetherAIRequest(options);
  return fetch(request.url, {
    method: "POST",
    headers: request.headers,
    body: request.body,
  });
}

/**
 * Parse Together AI response
 */
export async function parseTogetherAIResponse(
  response: Response
): Promise<TogetherAIResponse> {
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Together AI API error: ${response.status} ${response.statusText} - ${errorText}`
    );
  }
  return (await response.json()) as TogetherAIResponse;
}

