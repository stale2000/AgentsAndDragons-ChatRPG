/**
 * MCP Client for ChatRPG Backend
 * 
 * Uses @modelcontextprotocol/sdk to connect to the ChatRPG backend MCP server
 * via SSE transport and provides a client interface for tool discovery and execution.
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';

export interface MCPServerConfig {
  url: string; // MCP server SSE endpoint (e.g., http://localhost:8080/sse)
}

export interface MCPTool {
  name: string;
  description: string;
  inputSchema: any;
}

export interface MCPToolCallResult {
  content: Array<{ type: string; text: string }>;
  isError: boolean;
}

/**
 * MCP Client for connecting to ChatRPG backend using @modelcontextprotocol/sdk
 */
export class MCPClient {
  private serverUrl: string;
  private client: Client | null = null;
  private transport: SSEClientTransport | null = null;

  constructor(config: MCPServerConfig) {
    this.serverUrl = config.url;
  }

  getServerUrl(): string {
    return this.serverUrl;
  }

  /**
   * Initialize the MCP client connection
   */
  async connect(): Promise<void> {
    if (this.client) {
      return; // Already connected
    }

    try {
      // Create SSE transport
      this.transport = new SSEClientTransport(new URL(this.serverUrl));
      
      // Create MCP client
      this.client = new Client(
        {
          name: 'agentsanddragons-rules-engine',
          version: '1.0.0',
        },
        {
          capabilities: {},
        }
      );

      // Connect client to transport
      await this.client.connect(this.transport);
      
      console.log('[MCPClient] Connected to MCP server:', this.serverUrl);
    } catch (error) {
      console.error('[MCPClient] Connection failed:', error);
      throw error;
    }
  }

  /**
   * Disconnect from the MCP server
   */
  async disconnect(): Promise<void> {
    if (this.client) {
      await this.client.close();
      this.client = null;
      this.transport = null;
      console.log('[MCPClient] Disconnected from MCP server');
    }
  }

  /**
   * Health check - verify MCP server is accessible
   */
  async healthCheck(): Promise<boolean> {
    try {
      // Check the health endpoint (not MCP-specific, but useful)
      const healthUrl = this.serverUrl.replace('/sse', '/health');
      const response = await fetch(healthUrl, {
        method: 'GET',
      });

      if (!response.ok) {
        return false;
      }

      const data = await response.json();
      return data.status === 'ok';
    } catch (error) {
      console.error('[MCPClient] Health check failed:', error);
      return false;
    }
  }

  /**
   * List available tools from the MCP server
   */
  async listTools(): Promise<MCPTool[]> {
    if (!this.client) {
      await this.connect();
    }

    if (!this.client) {
      throw new Error('Failed to connect to MCP server');
    }

    try {
      const response = await this.client.listTools();
      return response.tools.map((tool) => ({
        name: tool.name,
        description: tool.description || '',
        inputSchema: tool.inputSchema || {},
      }));
    } catch (error) {
      console.error('[MCPClient] List tools failed:', error);
      throw error;
    }
  }

  /**
   * Call a tool on the MCP server
   */
  async callTool(name: string, args: Record<string, any>): Promise<MCPToolCallResult> {
    if (!this.client) {
      await this.connect();
    }

    if (!this.client) {
      return {
        isError: true,
        error: 'Failed to connect to MCP server',
        content: [],
      };
    }

    try {
      const response = await this.client.callTool({
        name,
        arguments: args,
      });

      return {
        content: response.content || [],
        isError: false,
      };
    } catch (error: any) {
      console.error('[MCPClient] Call tool failed:', error);
      return {
        isError: true,
        error: error.message || 'Unknown error during tool call',
        content: [],
      };
    }
  }
}
