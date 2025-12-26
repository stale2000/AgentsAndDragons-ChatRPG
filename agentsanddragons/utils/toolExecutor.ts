/**
 * Tool execution utilities for MCP tools
 */

import type {
  TogetherAIToolCall,
  AccumulatedToolCall,
  ToolResultMessage,
} from "@/types/rulesEngine";
import { MCPClient } from "./mcpClient";
import { parseToolCallArguments, extractToolOutput } from "./rulesEngineHelpers";

export interface ExecuteToolCallOptions {
  toolCall: TogetherAIToolCall | AccumulatedToolCall;
  mcpClient: MCPClient;
}

export interface ExecuteToolCallResult {
  success: boolean;
  message: ToolResultMessage;
}

/**
 * Execute a single tool call via MCP client
 */
export async function executeToolCall(
  options: ExecuteToolCallOptions
): Promise<ExecuteToolCallResult> {
  const { toolCall, mcpClient } = options;
  
  try {
    const toolName = toolCall.function.name;
    const toolArgs = parseToolCallArguments(toolCall.function.arguments);
    
    console.log(`[Tool Executor] Executing tool: ${toolName}`, { args: toolArgs });
    
    const toolResult = await mcpClient.callTool(toolName, toolArgs);
    
    if (toolResult.isError) {
      throw new Error(toolResult.error || 'Tool execution failed');
    }
    
    const toolOutput = extractToolOutput(toolResult.content);
    
    console.log(`[Tool Executor] Tool ${toolName} executed successfully`);
    
    return {
      success: true,
      message: {
        role: "tool",
        tool_call_id: toolCall.id,
        content: toolOutput,
      },
    };
  } catch (error) {
    console.error(`[Tool Executor] Tool execution error:`, error);
    return {
      success: false,
      message: {
        role: "tool",
        tool_call_id: toolCall.id,
        content: `Error executing tool: ${error instanceof Error ? error.message : String(error)}`,
      },
    };
  }
}

/**
 * Execute multiple tool calls in parallel
 */
export async function executeToolCalls(
  toolCalls: Array<TogetherAIToolCall | AccumulatedToolCall>,
  mcpClient: MCPClient
): Promise<ToolResultMessage[]> {
  const results = await Promise.all(
    toolCalls.map((toolCall) => executeToolCall({ toolCall, mcpClient }))
  );
  
  return results.map((result) => result.message);
}

