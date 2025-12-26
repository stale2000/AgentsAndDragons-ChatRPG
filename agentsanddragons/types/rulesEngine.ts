/**
 * Type definitions for the Rules Engine API and MCP integration
 */

import { Message as VercelChatMessage } from "ai";

// ============================================================
// Together AI API Types
// ============================================================

export type TogetherAIMessageRole = "system" | "user" | "assistant";

export interface TogetherAIMessage {
  role: TogetherAIMessageRole;
  content: string;
}

export interface TogetherAITool {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export interface TogetherAIToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
}

export interface TogetherAIToolCallDelta {
  index?: number;
  id?: string;
  function?: {
    name?: string;
    arguments?: string;
  };
}

export interface TogetherAIResponseChoice {
  message?: {
    role: string;
    content?: string;
    tool_calls?: TogetherAIToolCall[];
  };
  delta?: {
    content?: string;
    tool_calls?: TogetherAIToolCallDelta[];
  };
  finish_reason?: "stop" | "tool_calls" | "length" | null;
}

export interface TogetherAIResponse {
  choices: TogetherAIResponseChoice[];
}

// ============================================================
// Tool Call Types
// ============================================================

export interface ToolCallMessage {
  role: "assistant";
  content: string;
  tool_calls: TogetherAIToolCall[];
}

export interface ToolResultMessage {
  role: "tool";
  tool_call_id: string;
  content: string;
}

export type ToolMessage = ToolCallMessage | ToolResultMessage;

// ============================================================
// Accumulated Tool Call Types
// ============================================================

export interface AccumulatedToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
}

// ============================================================
// Request/Response Types
// ============================================================

export interface RulesEngineRequest {
  messages: VercelChatMessage[];
  show_intermediate_steps?: boolean;
}

export interface RulesEngineErrorResponse {
  error: string;
  details?: string;
  suggestion?: string;
  healthCheckUrl?: string;
}

export type VercelMessage = 
  | { role: "user"; content: string }
  | { role: "assistant"; content: string; tool_calls?: TogetherAIToolCall[] }
  | ToolResultMessage;

export interface RulesEngineIntermediateStepsResponse {
  messages: VercelMessage[];
}

// ============================================================
// Normalized Tool Arguments Types
// ============================================================

export type NormalizedToolArgs = 
  | string 
  | number 
  | boolean 
  | null 
  | NormalizedToolArgs[] 
  | Record<string, NormalizedToolArgs>;

export interface StructuredToolArg {
  type: string;
  value: unknown;
}

// ============================================================
// Health Check Types
// ============================================================

export interface HealthCheckResponse {
  status: "ok" | string;
  server?: string;
  version?: string;
}

