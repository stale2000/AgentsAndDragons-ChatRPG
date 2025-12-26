/**
 * Rules Engine Tools Factory
 * 
 * Converts backend tool definitions into LangChain tool instances.
 * Creates dynamic tools that call the backend rules engine.
 */

import { StructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import {
  RulesEngineClient,
  ToolDefinition,
  JsonSchema,
} from "./rulesEngineClient";

/**
 * Convert JSON Schema to Zod schema for LangChain tools.
 * This is a simplified converter that handles common cases.
 * 
 * @param jsonSchema - The JSON Schema to convert
 * @returns A Zod schema object
 */
function jsonSchemaToZod(jsonSchema: JsonSchema): z.ZodTypeAny {
  // Handle anyOf/oneOf - use union of the first option for simplicity
  if (jsonSchema.anyOf && jsonSchema.anyOf.length > 0) {
    return jsonSchemaToZod(jsonSchema.anyOf[0]);
  }
  if (jsonSchema.oneOf && jsonSchema.oneOf.length > 0) {
    return jsonSchemaToZod(jsonSchema.oneOf[0]);
  }

  // Handle object type
  if (jsonSchema.type === 'object' && jsonSchema.properties) {
    const shape: Record<string, z.ZodTypeAny> = {};
    
    for (const [key, prop] of Object.entries(jsonSchema.properties)) {
      const propSchema = prop as Record<string, unknown>;
      let zodType: z.ZodTypeAny;

      // Determine the type
      if (propSchema.type === 'string') {
        zodType = z.string();
      } else if (propSchema.type === 'number' || propSchema.type === 'integer') {
        zodType = z.number();
      } else if (propSchema.type === 'boolean') {
        zodType = z.boolean();
      } else if (propSchema.type === 'array') {
        const items = propSchema.items as Record<string, unknown> | undefined;
        if (items?.type === 'string') {
          zodType = z.array(z.string());
        } else if (items?.type === 'number' || items?.type === 'integer') {
          zodType = z.array(z.number());
        } else if (items?.type === 'object') {
          zodType = z.array(z.record(z.string(), z.any()));
        } else {
          zodType = z.array(z.any());
        }
      } else if (propSchema.type === 'object') {
        zodType = z.record(z.string(), z.any());
      } else {
        zodType = z.any();
      }

      // Make optional if not in required array
      const isRequired = jsonSchema.required?.includes(key) ?? false;
      shape[key] = isRequired ? zodType : zodType.optional();
    }

    return z.object(shape);
  }

  // Fallback to any
  return z.any();
}

/**
 * Create a LangChain tool from a backend tool definition.
 * 
 * @param toolDef - The tool definition from the backend
 * @param client - The rules engine client to use for execution
 * @returns A LangChain StructuredTool instance
 */
function createToolFromDefinition(
  toolDef: ToolDefinition,
  client: RulesEngineClient
): StructuredTool {
  // Convert JSON Schema to Zod schema
  const zodSchema = jsonSchemaToZod(toolDef.inputSchema);

  // Create the tool class
  class BackendTool extends StructuredTool {
    name = toolDef.name;
    description = toolDef.description;
    schema = zodSchema;

    async _call(input: z.infer<typeof zodSchema>): Promise<string> {
      try {
        console.log(`[Tool Call] ${this.name}`, {
          tool: this.name,
          description: this.description,
          input: input,
          timestamp: new Date().toISOString(),
        });
        
        const result = await client.callTool(this.name, input as Record<string, any>);
        
        // Extract text content from result
        const output = result.content && result.content.length > 0
          ? result.content.map((item) => item.text).join('\n')
          : (result.isError 
              ? `[ERROR] Tool execution failed: ${toolDef.name}`
              : 'Tool executed successfully (no output)');
        
        console.log(`[Tool Result] ${this.name}`, {
          tool: this.name,
          success: !result.isError,
          outputLength: output.length,
          timestamp: new Date().toISOString(),
        });
        
        return output;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(`[Tool Error] ${this.name}`, {
          tool: this.name,
          error: errorMessage,
          timestamp: new Date().toISOString(),
        });
        return `[ERROR] Failed to execute ${toolDef.name}: ${errorMessage}`;
      }
    }
  }

  return new BackendTool();
}

/**
 * Create LangChain tools from backend tool definitions.
 * 
 * Fetches all available tools from the backend and converts them
 * into LangChain StructuredTool instances.
 * 
 * @param client - The rules engine client to use
 * @returns Array of LangChain tools
 * @throws Error if tool fetching fails
 */
export async function createRulesEngineTools(
  client: RulesEngineClient
): Promise<StructuredTool[]> {
  try {
    // Fetch tools from backend
    const toolDefinitions = await client.listTools();
    
    if (!toolDefinitions || toolDefinitions.length === 0) {
      console.warn('[RulesEngineTools] No tools found from backend');
      return [];
    }

    // Convert each tool definition to a LangChain tool
    const tools = toolDefinitions.map((toolDef) =>
      createToolFromDefinition(toolDef, client)
    );

    console.log(`[RulesEngineTools] Created ${tools.length} tools from backend`);
    return tools;
  } catch (error) {
    console.error('[RulesEngineTools] Failed to create tools:', error);
    throw new Error(
      `Failed to create rules engine tools: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}

