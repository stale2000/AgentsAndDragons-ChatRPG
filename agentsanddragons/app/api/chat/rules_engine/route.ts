import { NextRequest, NextResponse } from "next/server";
import { Message as VercelChatMessage, StreamingTextResponse } from "ai";
import { MCPClient } from "@/utils/mcpClient";
import { DND_RULES_ENGINE_SYSTEM_PROMPT } from "@/data/SystemPrompts";
import { RULES_ENGINE_CONFIG } from "@/utils/rulesEngineConfig";
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
import { parseSSEStream } from "@/utils/streamParser";
import { convertToVercelMessages } from "@/utils/messageConverter";
import { accumulateToolCallDelta } from "@/utils/toolCallAccumulator";
import { parseToolCallsFromContent, removeToolCallMarkers, filterTogetherAIMarkers } from "@/utils/toolCallParser";
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
  mcpClient: MCPClient
): Promise<NextResponse<RulesEngineIntermediateStepsResponse>> => {
  const history: Array<TogetherAIMessage | ToolCallMessage | ToolResultMessage> = [...togetherMessages];
  let currentMessages: Array<TogetherAIMessage | ToolCallMessage | ToolResultMessage> = [...togetherMessages];

  for (let i = 0; i < RULES_ENGINE_CONFIG.MAX_ITERATIONS; i++) {
    const response = await callTogetherAI({
      messages: currentMessages,
      tools: togetherTools,
      stream: false,
    });

    const data = await parseTogetherAIResponse(response);
    const assistantMsg = data.choices[0]?.message;
    const toolCalls: TogetherAIToolCall[] = assistantMsg?.tool_calls || [];
    const content = assistantMsg?.content || "";

    const assistantMessage: ToolCallMessage = {
      role: "assistant",
      content,
      tool_calls: toolCalls,
    };
    history.push(assistantMessage);

    if (toolCalls.length === 0) break;

    const toolResults = await executeToolCalls(toolCalls, mcpClient);
    history.push(...toolResults);
    currentMessages.push(assistantMessage, ...toolResults);
  }

  await mcpClient.disconnect();
  return NextResponse.json({ messages: convertToVercelMessages(history) });
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
    const mcpClient = new MCPClient({ url: RULES_ENGINE_CONFIG.MCP_SERVER_URL });

    const healthCheck = await checkBackendHealth();
    if (!healthCheck.healthy) {
      console.error(`${RULES_ENGINE_CONFIG.LOG_PREFIX} Health check failed:`, healthCheck.error);
      return NextResponse.json(createBackendUnavailableError(RULES_ENGINE_CONFIG.BACKEND_URL), { status: 503 });
    }

    try {
      await mcpClient.connect();
    } catch (error) {
      console.error(`${RULES_ENGINE_CONFIG.LOG_PREFIX} MCP connection failed:`, error);
      return NextResponse.json(
        createErrorResponse(
          `Failed to connect to MCP server: ${error instanceof Error ? error.message : String(error)}`,
          `Check that the backend server is running and accessible at ${RULES_ENGINE_CONFIG.MCP_SERVER_URL}`
        ),
        { status: 503 }
      );
    }

    if (!RULES_ENGINE_CONFIG.TOGETHER_API_KEY) {
      return NextResponse.json(
        createErrorResponse("TOGETHER_API_KEY environment variable is not set."),
        { status: 500 }
      );
    }

    const togetherMessages: TogetherAIMessage[] = [
      { role: "system", content: DND_RULES_ENGINE_SYSTEM_PROMPT },
      ...convertMessages(messages),
    ];

    let mcpTools;
    try {
      mcpTools = await mcpClient.listTools();
    } catch (error) {
      await mcpClient.disconnect();
      return NextResponse.json(
        createErrorResponse(`Failed to fetch tools: ${error instanceof Error ? error.message : String(error)}`),
        { status: 500 }
      );
    }

    const togetherTools: TogetherAITool[] = mcpTools.map((tool) => ({
      type: "function",
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.inputSchema || {},
      },
    }));

    if (returnIntermediateSteps) {
      return await handleIntermediateSteps(togetherMessages, togetherTools, mcpClient);
    }

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
      await mcpClient.disconnect();
      return NextResponse.json(
        createErrorResponse(`Together AI API error: ${response.status} ${response.statusText}`),
        { status: response.status }
      );
    }

    async function executeToolCallsAndStream(
      toolCalls: AccumulatedToolCall[],
      messages: Array<TogetherAIMessage | ToolCallMessage | ToolResultMessage>,
      controller: ReadableStreamDefaultController,
      encoder: TextEncoder
    ): Promise<void> {
      const toolResults = await executeToolCalls(toolCalls, mcpClient);
      const followUpResponse = await callTogetherAI({
        messages: [...messages, ...toolResults],
        stream: true,
      });

      if (!followUpResponse.ok || !followUpResponse.body) return;

      const reader = followUpResponse.body.getReader();
      await parseSSEStream(reader, {
        onContent: (content) => {
          const cleanedContent = filterTogetherAIMarkers(content);
          if (cleanedContent) {
            controller.enqueue(encoder.encode(cleanedContent));
          }
        },
      });
    }

    const encoder = new TextEncoder();
    const pendingToolCalls: AccumulatedToolCall[] = [];
    let contentBuffer = "";
    let hasToolCallDeltas = false;

    const stream = new ReadableStream({
      async start(controller) {
        const reader = response.body?.getReader();
        if (!reader) {
          controller.close();
          return;
        }

        try {
          const result = await parseSSEStream(reader, {
            onContent: (content) => {
              // Always filter markers from content before processing
              const cleanedContent = filterTogetherAIMarkers(content);
              contentBuffer += content; // Keep original for parsing
              
              // Check for embedded tool calls in content buffer (with markers or plain JSON)
              const parsedToolCalls = parseToolCallsFromContent(contentBuffer);
              if (parsedToolCalls.length > 0) {
                hasToolCallDeltas = true;
                console.log(`${RULES_ENGINE_CONFIG.LOG_PREFIX} Found ${parsedToolCalls.length} tool calls in content`);
                
                // Convert parsed tool calls to AccumulatedToolCall format
                for (let i = 0; i < parsedToolCalls.length; i++) {
                  const parsed = parsedToolCalls[i];
                  pendingToolCalls.push({
                    id: `call_${Date.now()}_${i}`,
                    type: "function",
                    function: {
                      name: parsed.name,
                      arguments: JSON.stringify(parsed.parameters),
                    },
                  });
                }
                
                // Don't stream content that contains tool calls
                return;
              }
              
              // Only stream cleaned content if we haven't detected tool calls
              if (!hasToolCallDeltas && cleanedContent) {
                controller.enqueue(encoder.encode(cleanedContent));
              }
            },
            onToolCallDelta: (delta) => {
              hasToolCallDeltas = true;
              accumulateToolCallDelta(pendingToolCalls, delta);
              console.log(`${RULES_ENGINE_CONFIG.LOG_PREFIX} Tool call delta detected, pending: ${pendingToolCalls.length}`);
            },
          });

          // Check content buffer for tool calls one more time (in case they weren't detected during streaming)
          if (!hasToolCallDeltas) {
            const parsedToolCalls = parseToolCallsFromContent(contentBuffer);
            if (parsedToolCalls.length > 0) {
              hasToolCallDeltas = true;
              console.log(`${RULES_ENGINE_CONFIG.LOG_PREFIX} Found ${parsedToolCalls.length} tool calls in final buffer`);
              
              for (let i = 0; i < parsedToolCalls.length; i++) {
                const parsed = parsedToolCalls[i];
                pendingToolCalls.push({
                  id: `call_${Date.now()}_${i}`,
                  type: "function",
                  function: {
                    name: parsed.name,
                    arguments: JSON.stringify(parsed.parameters),
                  },
                });
              }
              
              contentBuffer = removeToolCallMarkers(contentBuffer);
            }
          }

          console.log(`${RULES_ENGINE_CONFIG.LOG_PREFIX} Stream finished`, {
            finishReason: result.finishReason,
            pendingToolCalls: pendingToolCalls.length,
            hasToolCalls: result.hasToolCalls,
            hasToolCallDeltas,
          });

          if ((result.finishReason === "tool_calls" || hasToolCallDeltas) && pendingToolCalls.length > 0) {
            console.log(`${RULES_ENGINE_CONFIG.LOG_PREFIX} Executing ${pendingToolCalls.length} tool calls`);
            await executeToolCallsAndStream(pendingToolCalls, togetherMessages, controller, encoder);
          } else if (contentBuffer && !hasToolCallDeltas) {
            // Stream buffered content if no tool calls were detected
            const cleanedContent = filterTogetherAIMarkers(contentBuffer);
            if (cleanedContent.trim()) {
              controller.enqueue(encoder.encode(cleanedContent));
            }
          }
        } catch (error) {
          console.error(`${RULES_ENGINE_CONFIG.LOG_PREFIX} Stream error:`, error);
          controller.error(error);
        } finally {
          await mcpClient.disconnect();
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
