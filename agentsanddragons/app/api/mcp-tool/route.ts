import { NextRequest, NextResponse } from "next/server";
import type { HealthCheckResponse } from "@/types/rulesEngine";

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
  const baseUrl = (process.env.RULES_ENGINE_URL || 'http://localhost:8080').replace(/\/$/, '');
  
  try {
    const healthResponse = await fetch(`${baseUrl}/health`, {
      method: 'GET',
      signal: AbortSignal.timeout(5000),
    });
    
    if (!healthResponse.ok) {
      return NextResponse.json(
        {
          connected: false,
          error: `Backend returned status ${healthResponse.status}`,
          url: baseUrl,
        },
        { status: 503 }
      );
    }
    
    const healthData = (await healthResponse.json()) as HealthCheckResponse;
    return NextResponse.json({
      connected: true,
      status: healthData.status,
      url: baseUrl,
    });
  } catch (error) {
    return NextResponse.json(
      {
        connected: false,
        error: error instanceof Error ? error.message : "Connection failed",
        url: baseUrl,
        suggestion: "Make sure the backend is running with: npm run build && node dist/http-server.js (from the ChatRPG root directory)",
      },
      { status: 503 }
    );
  }
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

    // Get backend URL from environment or use default
    const baseUrl = (process.env.RULES_ENGINE_URL || 'http://localhost:8080').replace(/\/$/, '');
    const toolUrl = `${baseUrl}/tool`;
    
    console.log(`[MCP Tool API] Calling tool: ${toolName} at ${toolUrl}`);
    
    // First, check backend health
    try {
      const healthResponse = await fetch(`${baseUrl}/health`, {
        method: 'GET',
        signal: AbortSignal.timeout(5000), // 5 second timeout
      });
      
      if (!healthResponse.ok) {
        const healthData = await healthResponse.json().catch(() => ({}));
        console.error(`[MCP Tool API] Health check failed: ${healthResponse.status}`, healthData);
        return NextResponse.json(
          {
            error: `Rules engine backend is not available at ${baseUrl}`,
            details: `Health check returned status ${healthResponse.status}. Make sure the backend is running with: npm run build && node dist/http-server.js (from the ChatRPG root directory)`,
            healthCheckUrl: `${baseUrl}/health`,
          },
          { status: 503 }
        );
      }
      
      const healthData = (await healthResponse.json()) as HealthCheckResponse;
      if (healthData.status !== 'ok') {
        console.error(`[MCP Tool API] Health check returned non-ok status:`, healthData);
        const errorResponse: MCPToolErrorResponse = {
          error: `Rules engine backend health check failed`,
          details: `Backend returned status: ${healthData.status}`,
        };
        return NextResponse.json(errorResponse, { status: 503 });
      }
      
      console.log(`[MCP Tool API] Health check passed`);
    } catch (error) {
      console.error(`[MCP Tool API] Health check error:`, error);
      return NextResponse.json(
        {
          error: `Failed to connect to rules engine backend at ${baseUrl}`,
          details: error instanceof Error ? error.message : "Connection failed",
          suggestion: "Make sure the backend is running with: npm run build && node dist/http-server.js (from the ChatRPG root directory)",
        },
        { status: 503 }
      );
    }

    // Call the tool via direct HTTP endpoint
    try {
      const toolResponse = await fetch(toolUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: toolName,
          arguments: args || {},
        }),
        signal: AbortSignal.timeout(30000), // 30 second timeout for tool execution
      });

      if (!toolResponse.ok) {
        const errorData = await toolResponse.json().catch(() => ({ error: 'Unknown error' }));
        console.error(`[MCP Tool API] Tool call failed: ${toolResponse.status}`, errorData);
        return NextResponse.json(
          {
            error: errorData.error || `Tool execution failed with status ${toolResponse.status}`,
          },
          { status: toolResponse.status >= 500 ? 500 : 400 }
        );
      }

      const result = (await toolResponse.json()) as { isError?: boolean; content?: Array<{ type: string; text: string }>; error?: string };
      
      // The /tool endpoint returns MCP CallToolResult format
      if (result.isError) {
        const errorText = result.content?.map((item) => item.text).join('\n') || result.error || "Tool execution failed";
        const errorResponse: MCPToolErrorResponse = {
          error: errorText,
        };
        return NextResponse.json(errorResponse, { status: 500 });
      }
      
      // Extract text content from result
      const content = result.content?.map((item) => item.text).join('\n') || '';
      
      console.log(`[MCP Tool API] Tool ${toolName} executed successfully`);
      
      const successResponse: MCPToolSuccessResponse = {
        success: true,
        content,
      };
      return NextResponse.json(successResponse);
    } catch (error) {
      console.error(`[MCP Tool API] Tool call error:`, error);
      
      if (error instanceof Error && error.name === 'AbortError') {
        const errorResponse: MCPToolErrorResponse = {
          error: "Tool execution timed out after 30 seconds",
        };
        return NextResponse.json(errorResponse, { status: 504 });
      }
      
      const errorResponse: MCPToolErrorResponse = {
        error: error instanceof Error ? error.message : "Unknown error during tool execution",
      };
      return NextResponse.json(errorResponse, { status: 500 });
    }
  } catch (error) {
    console.error("[MCP Tool API] Unexpected error:", error);
    const errorResponse: MCPToolErrorResponse = {
      error: error instanceof Error ? error.message : "Unknown error",
    };
    return NextResponse.json(errorResponse, { status: 500 });
  }
}

