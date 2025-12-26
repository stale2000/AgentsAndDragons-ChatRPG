import { NextRequest, NextResponse } from "next/server";
import type { HealthCheckResponse } from "@/types/rulesEngine";
import { RULES_ENGINE_CONFIG } from "@/utils/rulesEngineConfig";
import {
  createErrorResponse,
  checkBackendHealth,
  extractToolOutput,
} from "@/utils/rulesEngineHelpers";

export const runtime = "nodejs";

interface MCPToolRequest {
  toolName: string;
  args?: Record<string, unknown>;
}

interface MCPToolSuccessResponse {
  success: true;
  content: string;
}

interface MCPToolErrorResponse {
  error: string;
  details?: string;
  suggestion?: string;
}

type MCPToolResponse = MCPToolSuccessResponse | MCPToolErrorResponse;

/**
 * GET endpoint to test backend connection
 */
export async function GET(req: NextRequest): Promise<NextResponse<{ connected: boolean; status?: string; url: string; error?: string; suggestion?: string }>> {
  const healthCheck = await checkBackendHealth();
  
  if (!healthCheck.healthy) {
    return NextResponse.json(
      {
        connected: false,
        error: healthCheck.error,
        url: RULES_ENGINE_CONFIG.BACKEND_URL,
        suggestion: "Make sure the backend is running with: npm run build && node dist/http-server.js (from the ChatRPG root directory)",
      },
      { status: 503 }
    );
  }
  
  // Fetch full health data for status
  const healthResponse = await fetch(RULES_ENGINE_CONFIG.HEALTH_CHECK_URL, {
    method: 'GET',
    signal: AbortSignal.timeout(RULES_ENGINE_CONFIG.HEALTH_CHECK_TIMEOUT),
  });
  const healthData = (await healthResponse.json()) as HealthCheckResponse;
  
  return NextResponse.json({
    connected: true,
    status: healthData.status,
    url: RULES_ENGINE_CONFIG.BACKEND_URL,
  });
}

/**
 * API route for calling MCP tools directly via the backend's /tool endpoint
 * Used by the sidebar to retrieve state
 * 
 * This uses the direct HTTP /tool endpoint instead of MCP SSE for simplicity and reliability
 */
export async function POST(req: NextRequest): Promise<NextResponse<MCPToolResponse>> {
  try {
    const body = (await req.json()) as Partial<MCPToolRequest>;
    const { toolName, args } = body;

    if (!toolName || typeof toolName !== 'string') {
      const errorResponse: MCPToolErrorResponse = {
        error: "toolName is required and must be a string",
      };
      return NextResponse.json(errorResponse, { status: 400 });
    }

    console.log(`${RULES_ENGINE_CONFIG.MCP_LOG_PREFIX} Calling tool: ${toolName} at ${RULES_ENGINE_CONFIG.TOOL_URL}`);
    
    // First, check backend health
    const healthCheck = await checkBackendHealth();
    if (!healthCheck.healthy) {
      console.error(`${RULES_ENGINE_CONFIG.MCP_LOG_PREFIX} Health check failed:`, healthCheck.error);
      const errorResponse = createErrorResponse(
        `Rules engine backend is not available at ${RULES_ENGINE_CONFIG.BACKEND_URL}`,
        healthCheck.error,
        "Make sure the backend is running with: npm run build && node dist/http-server.js (from the ChatRPG root directory)",
        RULES_ENGINE_CONFIG.HEALTH_CHECK_URL
      );
      return NextResponse.json(errorResponse, { status: 503 });
    }
    
    console.log(`${RULES_ENGINE_CONFIG.MCP_LOG_PREFIX} Health check passed`);

    // Call the tool via direct HTTP endpoint
    try {
      const toolResponse = await fetch(RULES_ENGINE_CONFIG.TOOL_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: toolName,
          arguments: args || {},
        }),
        signal: AbortSignal.timeout(RULES_ENGINE_CONFIG.TOOL_EXECUTION_TIMEOUT),
      });

      if (!toolResponse.ok) {
        const errorData = (await toolResponse.json().catch(() => ({ error: 'Unknown error' }))) as { error?: string };
        console.error(`${RULES_ENGINE_CONFIG.MCP_LOG_PREFIX} Tool call failed: ${toolResponse.status}`, errorData);
        const errorResponse: MCPToolErrorResponse = {
          error: errorData.error || `Tool execution failed with status ${toolResponse.status}`,
        };
        return NextResponse.json(errorResponse, { status: toolResponse.status >= 500 ? 500 : 400 });
      }

      const result = (await toolResponse.json()) as { isError?: boolean; content?: Array<{ type: string; text: string }>; error?: string };
      
      // The /tool endpoint returns MCP CallToolResult format
      if (result.isError) {
        const errorText = extractToolOutput(result.content) || result.error || "Tool execution failed";
        const errorResponse: MCPToolErrorResponse = {
          error: errorText,
        };
        return NextResponse.json(errorResponse, { status: 500 });
      }
      
      // Extract text content from result
      const content = extractToolOutput(result.content);
      
      console.log(`${RULES_ENGINE_CONFIG.MCP_LOG_PREFIX} Tool ${toolName} executed successfully`);
      
      const successResponse: MCPToolSuccessResponse = {
        success: true,
        content,
      };
      return NextResponse.json(successResponse);
    } catch (error) {
      console.error(`${RULES_ENGINE_CONFIG.MCP_LOG_PREFIX} Tool call error:`, error);
      
      if (error instanceof Error && error.name === 'AbortError') {
        const errorResponse: MCPToolErrorResponse = {
          error: `Tool execution timed out after ${RULES_ENGINE_CONFIG.TOOL_EXECUTION_TIMEOUT / 1000} seconds`,
        };
        return NextResponse.json(errorResponse, { status: 504 });
      }
      
      const errorResponse: MCPToolErrorResponse = {
        error: error instanceof Error ? error.message : "Unknown error during tool execution",
      };
      return NextResponse.json(errorResponse, { status: 500 });
    }
  } catch (error) {
    console.error(`${RULES_ENGINE_CONFIG.MCP_LOG_PREFIX} Unexpected error:`, error);
    const errorResponse: MCPToolErrorResponse = {
      error: error instanceof Error ? error.message : "Unknown error",
    };
    return NextResponse.json(errorResponse, { status: 500 });
  }
}

