import { NextRequest, NextResponse } from "next/server";
import { Message as VercelChatMessage, StreamingTextResponse } from "ai";
import { MCPClient } from "@/utils/mcpClient";
import { DND_RULES_ENGINE_SYSTEM_PROMPT } from "@/data/SystemPrompts";

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
 * Convert Vercel AI SDK messages to Together AI API format
 */
function convertToTogetherAIMessages(messages: VercelChatMessage[]): Array<{ role: string; content: string }> {
  return messages
    .filter((msg) => msg.role === "user" || msg.role === "assistant")
    .map((msg) => ({
      role: msg.role === "assistant" ? "assistant" : "user",
      content: typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content),
    }));
}

/**
 * Normalize tool arguments by extracting values from structured format
 * Handles cases where AI returns {type: "string", value: "actual"} instead of just "actual"
 */
function normalizeToolArgs(args: any): any {
  if (args === null || args === undefined) {
    return args;
  }
  
  if (Array.isArray(args)) {
    return args.map(normalizeToolArgs);
  }
  
  if (typeof args === 'object') {
    // Check if this is a structured argument object with type and value
    if ('type' in args && 'value' in args && Object.keys(args).length === 2) {
      // Extract the value and normalize it recursively
      return normalizeToolArgs(args.value);
    }
    
    // Otherwise, normalize all properties recursively
    const normalized: any = {};
    for (const [key, value] of Object.entries(args)) {
      normalized[key] = normalizeToolArgs(value);
    }
    return normalized;
  }
  
  // Primitive value, return as-is
  return args;
}

/**
 * Handle intermediate steps mode - returns JSON with all messages including tool calls
 */
const handleIntermediateSteps = async (
  togetherMessages: any[],
  togetherTools: any[],
  togetherApiKey: string,
  mcpClientInstance: MCPClient
): Promise<NextResponse> => {
  const allMessages: any[] = [...togetherMessages];
  let currentMessages = [...togetherMessages];
  let iterationCount = 0;
  const maxIterations = 10; // Prevent infinite loops

  while (iterationCount < maxIterations) {
    iterationCount++;
    
    // Call Together AI (non-streaming)
    const response = await fetch("https://api.together.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${togetherApiKey}`,
      },
      body: JSON.stringify({
        model: "meta-llama/Llama-4-Scout-17B-16E-Instruct",
        messages: currentMessages,
        tools: togetherTools,
        tool_choice: "auto",
        temperature: 0,
        max_tokens: 2048,
        stream: false,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      await mcpClientInstance.disconnect();
      throw new Error(`Together AI API error: ${response.status} ${response.statusText} - ${errorText}`);
    }

    const data = await response.json();
    const assistantMessage = data.choices[0]?.message || {};
    const toolCalls = assistantMessage.tool_calls || [];
    const content = assistantMessage.content || "";

    // Add assistant message to all messages
    allMessages.push({
      role: "assistant",
      content: content,
      tool_calls: toolCalls,
    });

    // If no tool calls, we're done
    if (toolCalls.length === 0) {
      break;
    }

    // Execute tool calls
    const toolResults = [];
    for (const toolCall of toolCalls) {
      try {
        const toolName = toolCall.function.name;
        const rawArgs = JSON.parse(toolCall.function.arguments || '{}');
        const toolArgs = normalizeToolArgs(rawArgs);
        
        console.log(`[Rules Engine API] Executing tool: ${toolName}`, { raw: rawArgs, normalized: toolArgs });
        
        const toolResult = await mcpClientInstance.callTool(toolName, toolArgs);
        
        if (toolResult.isError) {
          throw new Error('Tool execution failed');
        }
        
        const toolOutput = toolResult.content?.map((item: any) => item.text).join('\n') || '';
        
        toolResults.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: toolOutput,
        });
      } catch (error) {
        console.error(`[Rules Engine API] Tool execution error:`, error);
        toolResults.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: `Error executing tool: ${error instanceof Error ? error.message : String(error)}`,
        });
      }
    }

    // Add tool results to messages
    allMessages.push(...toolResults);
    currentMessages.push(
      {
        role: "assistant",
        content: content,
        tool_calls: toolCalls,
      },
      ...toolResults
    );
  }

  // Disconnect MCP client
  await mcpClientInstance.disconnect();

  // Convert to Vercel AI SDK format
  const vercelMessages = allMessages
    .filter((msg) => msg.role === "user" || msg.role === "assistant" || msg.role === "tool")
    .map((msg) => {
      if (msg.role === "tool") {
        return {
          role: "tool",
          content: msg.content,
          tool_call_id: msg.tool_call_id,
        };
      }
      return {
        role: msg.role,
        content: msg.content,
        tool_calls: msg.tool_calls,
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
export async function POST(req: NextRequest) {
  console.log(`[Rules Engine API] POST request received`);
  try {
    const body = await req.json();
    const returnIntermediateSteps = body.show_intermediate_steps;
    console.log(`[Rules Engine API] Request body parsed`, {
      messageCount: body.messages?.length || 0,
      showIntermediateSteps: returnIntermediateSteps,
    });

    const messages = body.messages ?? [];
    
    // Initialize MCP client
    const baseUrl = (process.env.RULES_ENGINE_URL || 'http://localhost:8080').replace(/\/$/, '');
    const mcpServerUrl = `${baseUrl}/sse`;
    console.log(`[Rules Engine API] MCP Server URL: ${mcpServerUrl}`);
    console.log(`[Rules Engine API] Base URL: ${baseUrl}`);
    console.log(`[Rules Engine API] RULES_ENGINE_URL env var: ${process.env.RULES_ENGINE_URL || '(not set, using default)'}`);
    
    const mcpClientInstance = new MCPClient({ url: mcpServerUrl });
    
    // Check backend health
    console.log(`[Rules Engine API] Checking backend health at ${baseUrl}/health`);
    const isHealthy = await mcpClientInstance.healthCheck();
    if (!isHealthy) {
      console.error(`[Rules Engine API] Health check failed - backend not available`);
      return NextResponse.json(
        {
          error: `Rules engine backend is not available at ${baseUrl}. Please ensure the backend is running.`,
          details: `Make sure you've started the backend server with: npm run build && node dist/http-server.js (from the ChatRPG root directory)`,
          healthCheckUrl: `${baseUrl}/health`,
        },
        { status: 503 }
      );
    }
    console.log(`[Rules Engine API] Health check passed`);
    
    // Connect to MCP server
    console.log(`[Rules Engine API] Connecting to MCP server via SSE...`);
    try {
      await mcpClientInstance.connect();
      console.log(`[Rules Engine API] Successfully connected to MCP server`);
    } catch (error) {
      console.error(`[Rules Engine API] MCP connection failed:`, error);
      return NextResponse.json(
        {
          error: `Failed to connect to MCP server: ${error instanceof Error ? error.message : String(error)}`,
          details: `Check that the backend server is running and accessible at ${mcpServerUrl}`,
        },
        { status: 503 }
      );
    }

    // Get Together AI API key
    const togetherApiKey = process.env.TOGETHER_API_KEY;
    if (!togetherApiKey) {
      return NextResponse.json(
        {
          error: "TOGETHER_API_KEY environment variable is not set.",
        },
        { status: 500 }
      );
    }

    // Convert messages to Together AI format
    const togetherMessages = [
      {
        role: "system",
        content: DND_RULES_ENGINE_SYSTEM_PROMPT,
      },
      ...convertToTogetherAIMessages(messages),
    ];

    console.log(`[Rules Engine API] Calling Together AI with MCP server: ${mcpServerUrl}`);
    console.log(`[Rules Engine API] Message count: ${togetherMessages.length}`);

    // Fetch tools from MCP server using MCP SDK client
    let mcpTools;
    try {
      mcpTools = await mcpClientInstance.listTools();
      console.log(`[Rules Engine API] Fetched ${mcpTools.length} tools from MCP server`);
    } catch (error) {
      await mcpClientInstance.disconnect();
      return NextResponse.json(
        {
          error: `Failed to fetch tools: ${error instanceof Error ? error.message : String(error)}`,
        },
        { status: 500 }
      );
    }
    
    // Convert MCP tools to Together AI function calling format
    const togetherTools = mcpTools.map((tool) => ({
      type: "function",
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.inputSchema || {},
      },
    }));

    // Handle intermediate steps vs streaming
    if (returnIntermediateSteps) {
      // For intermediate steps, we need to return JSON (non-streaming)
      // This matches the pattern used in the agents route
      return await handleIntermediateSteps(
        togetherMessages,
        togetherTools,
        togetherApiKey,
        mcpClientInstance
      );
    }

    // Call Together AI API with tools as function definitions (streaming)
    const response = await fetch("https://api.together.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${togetherApiKey}`,
      },
      body: JSON.stringify({
        model: "meta-llama/Llama-4-Scout-17B-16E-Instruct",
        messages: togetherMessages,
        tools: togetherTools,
        tool_choice: "auto",
        temperature: 0,
        max_tokens: 2048,
        stream: true,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[Rules Engine API] Together AI API error:", {
        status: response.status,
        statusText: response.statusText,
        body: errorText,
      });
      return NextResponse.json(
        {
          error: `Together AI API error: ${response.status} ${response.statusText}`,
        },
        { status: response.status }
      );
    }

    // Helper function to execute tool calls via MCP server
    async function executeToolCalls(
      toolCalls: any[],
      mcpClientInstance: MCPClient,
      messages: any[],
      apiKey: string,
      controller: ReadableStreamDefaultController,
      encoder: TextEncoder
    ) {
      console.log(`[Rules Engine API] Executing ${toolCalls.length} tool calls`);
      
      const toolResults = [];
      for (const toolCall of toolCalls) {
        try {
          const toolName = toolCall.function.name;
          const rawArgs = JSON.parse(toolCall.function.arguments || '{}');
          const toolArgs = normalizeToolArgs(rawArgs);
          
          console.log(`[Rules Engine API] Executing tool: ${toolName}`, { raw: rawArgs, normalized: toolArgs });
          
          // Execute tool via MCP SDK client
          const toolResult = await mcpClientInstance.callTool(toolName, toolArgs);
          
          if (toolResult.isError) {
            throw new Error('Tool execution failed');
          }
          
          const toolOutput = toolResult.content?.map((item: any) => item.text).join('\n') || '';
          
          console.log(`[Rules Engine API] Tool ${toolName} result:`, toolOutput.substring(0, 200));
          
          toolResults.push({
            role: "tool",
            tool_call_id: toolCall.id,
            content: toolOutput,
          });
        } catch (error) {
          console.error(`[Rules Engine API] Tool execution error:`, error);
          toolResults.push({
            role: "tool",
            tool_call_id: toolCall.id,
            content: `Error executing tool: ${error instanceof Error ? error.message : String(error)}`,
          });
        }
      }
      
      // Send tool results back to Together AI for final response
      const followUpMessages = [
        ...messages,
        ...toolResults,
      ];
      
      const followUpResponse = await fetch("https://api.together.ai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: "meta-llama/Llama-4-Scout-17B-16E-Instruct",
          messages: followUpMessages,
          temperature: 0,
          max_tokens: 2048,
          stream: true,
        }),
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
                  const parsed = JSON.parse(data);
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
    let accumulatedToolCalls: any[] = [];

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
                await executeToolCalls(accumulatedToolCalls, mcpClientInstance, togetherMessages, togetherApiKey, controller, encoder);
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
                    await executeToolCalls(accumulatedToolCalls, mcpClientInstance, togetherMessages, togetherApiKey, controller, encoder);
                  }
                  // Disconnect MCP client
                  await mcpClientInstance.disconnect();
                  controller.close();
                  return;
                }

                try {
                  const parsed = JSON.parse(data);
                  const delta = parsed.choices?.[0]?.delta || {};
                  const finishReason = parsed.choices?.[0]?.finish_reason;
                  
                  // Handle tool call deltas
                  if (delta.tool_calls) {
                    for (const toolCallDelta of delta.tool_calls) {
                      const index = toolCallDelta.index || 0;
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
                  const content = delta.content;
                  if (content) {
                    controller.enqueue(encoder.encode(content));
                  }

                  // If finish reason is tool_calls, execute them
                  if (finishReason === "tool_calls" && accumulatedToolCalls.length > 0) {
                    await executeToolCalls(accumulatedToolCalls, mcpClientInstance, togetherMessages, togetherApiKey, controller, encoder);
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
          console.error("[Rules Engine API] Stream error:", error);
          controller.error(error);
        } finally {
          // Disconnect MCP client
          await mcpClientInstance.disconnect();
          controller.close();
        }
      },
    });

    return new StreamingTextResponse(stream);
  } catch (e: any) {
    console.error("[Rules Engine API] Error:", e);
    console.error("[Rules Engine API] Error stack:", e.stack);
    console.error("[Rules Engine API] Error details:", {
      message: e.message,
      name: e.name,
      status: e.status,
    });
    return NextResponse.json(
      { error: e.message },
      { status: e.status ?? 500 }
    );
  }
}
