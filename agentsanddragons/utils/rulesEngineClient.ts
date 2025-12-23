/**
 * Rules Engine Client
 * 
 * Centralized client for communicating with the ChatRPG backend rules engine.
 * Provides health checks, tool discovery, and tool execution capabilities.
 */

/**
 * JSON Schema representation for tool input validation.
 * Matches the backend's JsonSchema interface.
 */
export interface JsonSchema {
  type?: 'object';
  properties?: Record<string, unknown>;
  required?: string[];
  anyOf?: Array<{
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  }>;
  oneOf?: Array<{
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  }>;
}

/**
 * Tool definition from the backend.
 * Matches what the backend returns from /tools endpoint.
 */
export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: JsonSchema;
}

/**
 * Tool call result from the backend.
 * Matches the MCP CallToolResult format.
 */
export interface CallToolResult {
  content: Array<{
    type: 'text';
    text: string;
  }>;
  isError?: boolean;
}

/**
 * Response from /tools endpoint
 */
interface ToolsResponse {
  tools: ToolDefinition[];
}

/**
 * Request body for /tool endpoint
 */
interface ToolCallRequest {
  name: string;
  arguments: Record<string, any>;
}

/**
 * Configuration for the Rules Engine Client
 */
export interface RulesEngineClientConfig {
  baseUrl?: string;
  timeout?: number;
}

/**
 * Rules Engine Client
 * 
 * Handles all communication with the backend rules engine.
 */
export class RulesEngineClient {
  private baseUrl: string;
  private timeout: number;

  constructor(config: RulesEngineClientConfig = {}) {
    this.baseUrl = config.baseUrl || process.env.RULES_ENGINE_URL || 'http://localhost:8080';
    this.timeout = config.timeout || parseInt(process.env.RULES_ENGINE_TIMEOUT || '30000', 10);
    
    // Remove trailing slash if present
    this.baseUrl = this.baseUrl.replace(/\/$/, '');
  }

  /**
   * Check if the backend is healthy and accessible.
   * 
   * @returns true if backend is healthy, false otherwise
   */
  async healthCheck(): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeout);

      const response = await fetch(`${this.baseUrl}/health`, {
        method: 'GET',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
        },
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        return false;
      }

      const data = await response.json();
      return data.status === 'ok';
    } catch (error) {
      console.error('[RulesEngineClient] Health check failed:', error);
      return false;
    }
  }

  /**
   * List all available tools from the backend.
   * 
   * @returns Array of tool definitions
   * @throws Error if the request fails
   */
  async listTools(): Promise<ToolDefinition[]> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeout);

      const response = await fetch(`${this.baseUrl}/tools`, {
        method: 'GET',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
        },
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to list tools: ${response.status} ${response.statusText} - ${errorText}`);
      }

      const data: ToolsResponse = await response.json();
      return data.tools || [];
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(`Request timeout after ${this.timeout}ms`);
      }
      console.error('[RulesEngineClient] Failed to list tools:', error);
      throw error;
    }
  }

  /**
   * Execute a tool call on the backend.
   * 
   * @param name - The name of the tool to call
   * @param args - The arguments to pass to the tool
   * @returns The tool execution result
   * @throws Error if the request fails
   */
  async callTool(name: string, args: Record<string, any>): Promise<CallToolResult> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeout);

      const requestBody: ToolCallRequest = {
        name,
        arguments: args,
      };

      const response = await fetch(`${this.baseUrl}/tool`, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        let errorMessage = `Tool call failed: ${response.status} ${response.statusText}`;
        
        try {
          const errorJson = JSON.parse(errorText);
          if (errorJson.error) {
            errorMessage = errorJson.error;
          }
        } catch {
          // If not JSON, use the raw text
          if (errorText) {
            errorMessage += ` - ${errorText}`;
          }
        }
        
        throw new Error(errorMessage);
      }

      const result: CallToolResult = await response.json();
      return result;
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(`Tool call timeout after ${this.timeout}ms`);
      }
      console.error(`[RulesEngineClient] Tool call failed for ${name}:`, error);
      throw error;
    }
  }

  /**
   * Get the base URL being used by this client.
   */
  getBaseUrl(): string {
    return this.baseUrl;
  }
}

