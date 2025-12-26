import { NextRequest, NextResponse } from "next/server";
import { Message as VercelChatMessage, StreamingTextResponse } from "ai";
import { MCPClient } from "@/utils/mcpClient";
import { DND_RULES_ENGINE_SYSTEM_PROMPT } from "@/data/SystemPrompts";
import {
  getBackendUrl,
  getMcpServerUrl,
  getTogetherApiKey,
  RULES_ENGINE_CONFIG,
} from "@/utils/rulesEngineConfig";
import {
  createBackendUnavailableError,
  createErrorResponse,
  checkBackendHealth,
  convertToTogetherAIMessages as convertMessages,
} from "@/utils/rulesEngineHelpers";
import {
  callTogetherAI,
  parseTogetherAIResponse,
} from "@/utils/togetherAIClient";
import { executeToolCalls } from "@/utils/toolExecutor";
import type {
  TogetherAIMessage,
  TogetherAITool,
  TogetherAIToolCall,
  TogetherAIResponse,
  TogetherAIResponseChoice,
  ToolCallMessage,
  ToolResultMessage,
  AccumulatedToolCall,
  RulesEngineRequest,
  RulesEngineErrorResponse,
  RulesEngineIntermediateStepsResponse,
  VercelMessage,
} from "@/types/rulesEngine";

export const runtime = "nodejs";

// Test endpoint to verify route is accessible
export async function GET() {
  console.log(`[Rules Engine API] GET request received - route is accessible`);
  return NextResponse.json({ 
    status: 'ok', 
    message: 'Rules Engine API is working',
    timestamp: new Date().toISOString()
  });
}


/**
 * Handle intermediate steps mode - returns JSON with all messages including tool calls
 */
const handleIntermediateSteps = async (
  togetherMessages: TogetherAIMessage[],
  togetherTools: TogetherAITool[],
  mcpClientInstance: MCPClient
): Promise<NextResponse<RulesEngineIntermediateStepsResponse>> => {
  const allMessages: Array<TogetherAIMessage | ToolCallMessage | ToolResultMessage> = [...togetherMessages];
  let currentMessages: Array<TogetherAIMessage | ToolCallMessage | ToolResultMessage> = [...togetherMessages];
  let iterationCount = 0;

  while (iterationCount < RULES_ENGINE_CONFIG.MAX_ITERATIONS) {
    iterationCount++;
    
    // Call Together AI (non-streaming)
    const response = await callTogetherAI({
      messages: currentMessages,
      tools: togetherTools,
      stream: false,
    });

    const data = await parseTogetherAIResponse(response);
    const assistantMessage = data.choices[0]?.message;
    const toolCalls: TogetherAIToolCall[] = assistantMessage?.tool_calls || [];
    const content = assistantMessage?.content || "";

    // Add assistant message to all messages
    const assistantMsg: ToolCallMessage = {
      role: "assistant",
      content: content,
      tool_calls: toolCalls,
    };
    allMessages.push(assistantMsg);

    // If no tool calls, we're done
    if (toolCalls.length === 0) {
      break;
    }

    // Execute tool calls
    const toolResults = await executeToolCalls(toolCalls, mcpClientInstance);

    // Add tool results to messages
    allMessages.push(...toolResults);
    currentMessages.push(
      assistantMsg,
      ...toolResults
    );
  }

  // Disconnect MCP client
  await mcpClientInstance.disconnect();

  // Convert to Vercel AI SDK format
  const vercelMessages: VercelMessage[] = allMessages
    .filter((msg): msg is TogetherAIMessage | ToolCallMessage | ToolResultMessage => 
      msg.role === "user" || msg.role === "assistant" || msg.role === "tool"
    )
    .map((msg): VercelMessage => {
      if (msg.role === "tool") {
        return {
          role: "tool",
          content: msg.content,
          tool_call_id: msg.tool_call_id,
        };
      }
      if (msg.role === "assistant" && 'tool_calls' in msg && msg.tool_calls) {
        return {
          role: "assistant",
          content: msg.content,
          tool_calls: msg.tool_calls,
        };
      }
      return {
        role: msg.role as "user" | "assistant",
        content: msg.content,
      };
    });

  return NextResponse.json(
    {
      messages: vercelMessages,
    },
    { status: 200 }
  );
};

/**
 * This handler uses Together AI API directly with MCP server as a remote tool.
 * This is similar to how the web-client works - Together AI handles tool calling
 * natively via MCP protocol.
 */
export async function POST(req: NextRequest): Promise<NextResponse<RulesEngineIntermediateStepsResponse | RulesEngineErrorResponse> | StreamingTextResponse> {
  console.log(`[Rules Engine API] POST request received`);
  try {
    const body = (await req.json()) as RulesEngineRequest;
    const returnIntermediateSteps = body.show_intermediate_steps ?? false;
    console.log(`[Rules Engine API] Request body parsed`, {
      messageCount: body.messages?.length || 0,
      showIntermediateSteps: returnIntermediateSteps,
    });

    const messages = body.messages ?? [];
    
    // Initialize MCP client
    const baseUrl = getBackendUrl();
    const mcpServerUrl = getMcpServerUrl();
    console.log(`${RULES_ENGINE_CONFIG.LOG_PREFIX} MCP Server URL: ${mcpServerUrl}`);
    console.log(`${RULES_ENGINE_CONFIG.LOG_PREFIX} Base URL: ${baseUrl}`);
    
    const mcpClientInstance = new MCPClient({ url: mcpServerUrl });
    
    // Check backend health
    console.log(`${RULES_ENGINE_CONFIG.LOG_PREFIX} Checking backend health`);
    const healthCheck = await checkBackendHealth();
    if (!healthCheck.healthy) {
      console.error(`${RULES_ENGINE_CONFIG.LOG_PREFIX} Health check failed:`, healthCheck.error);
      return NextResponse.json(createBackendUnavailableError(baseUrl), { status: 503 });
    }
    console.log(`${RULES_ENGINE_CONFIG.LOG_PREFIX} Health check passed`);
    
    // Connect to MCP server
    console.log(`${RULES_ENGINE_CONFIG.LOG_PREFIX} Connecting to MCP server via SSE...`);
    try {
      await mcpClientInstance.connect();
      console.log(`${RULES_ENGINE_CONFIG.LOG_PREFIX} Successfully connected to MCP server`);
    } catch (error) {
      console.error(`${RULES_ENGINE_CONFIG.LOG_PREFIX} MCP connection failed:`, error);
      const errorResponse = createErrorResponse(
        `Failed to connect to MCP server: ${error instanceof Error ? error.message : String(error)}`,
        `Check that the backend server is running and accessible at ${mcpServerUrl}`
      );
      return NextResponse.json(errorResponse, { status: 503 });
    }

    // Get Together AI API key
    const togetherApiKey = getTogetherApiKey();
    if (!togetherApiKey) {
      const errorResponse = createErrorResponse(
        "TOGETHER_API_KEY environment variable is not set."
      );
      return NextResponse.json(errorResponse, { status: 500 });
    }

    // Convert messages to Together AI format
    const togetherMessages: TogetherAIMessage[] = [
      {
        role: "system",
        content: DND_RULES_ENGINE_SYSTEM_PROMPT,
      },
      ...convertMessages(messages),
    ];

    console.log(`${RULES_ENGINE_CONFIG.LOG_PREFIX} Calling Together AI with MCP server: ${mcpServerUrl}`);
    console.log(`${RULES_ENGINE_CONFIG.LOG_PREFIX} Message count: ${togetherMessages.length}`);

    // Fetch tools from MCP server using MCP SDK client
    let mcpTools;
    try {
      mcpTools = await mcpClientInstance.listTools();
      console.log(`${RULES_ENGINE_CONFIG.LOG_PREFIX} Fetched ${mcpTools.length} tools from MCP server`);
    } catch (error) {
      await mcpClientInstance.disconnect();
      const errorResponse = createErrorResponse(
        `Failed to fetch tools: ${error instanceof Error ? error.message : String(error)}`
      );
      return NextResponse.json(errorResponse, { status: 500 });
    }
    
    // Convert MCP tools to Together AI function calling format
    const togetherTools: TogetherAITool[] = mcpTools.map((tool) => ({
      type: "function",
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.inputSchema || {},
      },
    }));

    // Handle intermediate steps vs streaming
    if (returnIntermediateSteps) {
      return await handleIntermediateSteps(
        togetherMessages,
        togetherTools,
        mcpClientInstance
      );
    }

    // Call Together AI API with tools as function definitions (streaming)
    const response = await callTogetherAI({
      messages: togetherMessages,
      tools: togetherTools,
      stream: true,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`${RULES_ENGINE_CONFIG.LOG_PREFIX} Together AI API error:`, {
        status: response.status,
        statusText: response.statusText,
        body: errorText,
      });
      const errorResponse = createErrorResponse(
        `Together AI API error: ${response.status} ${response.statusText}`
      );
      return NextResponse.json(errorResponse, { status: response.status });
    }

    // Helper function to execute tool calls via MCP server and stream follow-up response
    async function executeToolCallsAndStream(
      toolCalls: AccumulatedToolCall[],
      mcpClientInstance: MCPClient,
      messages: Array<TogetherAIMessage | ToolCallMessage | ToolResultMessage>,
      controller: ReadableStreamDefaultController,
      encoder: TextEncoder
    ): Promise<void> {
      console.log(`${RULES_ENGINE_CONFIG.LOG_PREFIX} Executing ${toolCalls.length} tool calls`);
      
      const toolResults = await executeToolCalls(toolCalls, mcpClientInstance);
      
      // Send tool results back to Together AI for final response
      const followUpMessages: Array<TogetherAIMessage | ToolCallMessage | ToolResultMessage> = [
        ...messages,
        ...toolResults,
      ];
      
      const followUpResponse = await callTogetherAI({
        messages: followUpMessages,
        stream: true,
      });
      
      if (followUpResponse.ok) {
        const followUpReader = followUpResponse.body?.getReader();
        if (followUpReader) {
          const decoder = new TextDecoder();
          let buffer = "";
          
          while (true) {
            const { done, value } = await followUpReader.read();
            if (done) break;
            
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() || "";
            
            for (const line of lines) {
              if (line.startsWith("data: ")) {
                const data = line.slice(6).trim();
                if (data === "[DONE]") return;
                
                try {
                  const parsed = JSON.parse(data) as TogetherAIResponse;
                  const content = parsed.choices?.[0]?.delta?.content;
                  if (content) {
                    controller.enqueue(encoder.encode(content));
                  }
                } catch (e) {
                  continue;
                }
              }
            }
          }
        }
      }
    }

    // Stream the response and handle tool calls
    const encoder = new TextEncoder();
    let accumulatedToolCalls: AccumulatedToolCall[] = [];

    const stream = new ReadableStream({
      async start(controller) {
        const reader = response.body?.getReader();
        if (!reader) {
          controller.close();
          return;
        }

        const decoder = new TextDecoder();
        let buffer = "";

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) {
              // If we have pending tool calls, execute them
              if (accumulatedToolCalls.length > 0) {
                await executeToolCallsAndStream(accumulatedToolCalls, mcpClientInstance, togetherMessages, controller, encoder);
              }
              // Disconnect MCP client
              await mcpClientInstance.disconnect();
              break;
            }

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() || "";

            for (const line of lines) {
              if (line.startsWith("data: ")) {
                const data = line.slice(6).trim();
                if (data === "[DONE]") {
                  // If we have pending tool calls, execute them
                  if (accumulatedToolCalls.length > 0) {
                    await executeToolCallsAndStream(accumulatedToolCalls, mcpClientInstance, togetherMessages, controller, encoder);
                  }
                  // Disconnect MCP client
                  await mcpClientInstance.disconnect();
                  controller.close();
                  return;
                }

                try {
                  const parsed = JSON.parse(data) as TogetherAIResponse;
                  const choice: TogetherAIResponseChoice | undefined = parsed.choices?.[0];
                  const delta = choice?.delta;
                  const finishReason = choice?.finish_reason;
                  
                  // Handle tool call deltas
                  if (delta?.tool_calls) {
                    for (const toolCallDelta of delta.tool_calls) {
                      const index = toolCallDelta.index ?? 0;
                      if (!accumulatedToolCalls[index]) {
                        accumulatedToolCalls[index] = {
                          id: toolCallDelta.id || `call_${Date.now()}_${index}`,
                          type: "function",
                          function: {
                            name: "",
                            arguments: "",
                          },
                        };
                      }
                      
                      if (toolCallDelta.function?.name) {
                        accumulatedToolCalls[index].function.name += toolCallDelta.function.name;
                      }
                      if (toolCallDelta.function?.arguments) {
                        accumulatedToolCalls[index].function.arguments += toolCallDelta.function.arguments;
                      }
                    }
                  }
                  
                  // Handle content
                  const content = delta?.content;
                  if (content) {
                    controller.enqueue(encoder.encode(content));
                  }

                  // If finish reason is tool_calls, execute them
                  if (finishReason === "tool_calls" && accumulatedToolCalls.length > 0) {
                    await executeToolCallsAndStream(accumulatedToolCalls, mcpClientInstance, togetherMessages, controller, encoder);
                    accumulatedToolCalls = [];
                  }
                } catch (e) {
                  // Skip invalid JSON
                  continue;
                }
              }
            }
          }
        } catch (error) {
          console.error(`${RULES_ENGINE_CONFIG.LOG_PREFIX} Stream error:`, error);
          controller.error(error);
        } finally {
          // Disconnect MCP client
          await mcpClientInstance.disconnect();
          controller.close();
        }
      },
    });

    return new StreamingTextResponse(stream);
  } catch (e: unknown) {
    const error = e instanceof Error ? e : new Error(String(e));
    console.error(`${RULES_ENGINE_CONFIG.LOG_PREFIX} Error:`, error);
    console.error(`${RULES_ENGINE_CONFIG.LOG_PREFIX} Error stack:`, error.stack);
    const errorResponse = createErrorResponse(error.message);
    return NextResponse.json(errorResponse, { status: 500 });
  }
}
