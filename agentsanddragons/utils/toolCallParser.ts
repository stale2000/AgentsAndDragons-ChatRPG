/**
 * Parse tool calls from content that may contain embedded tool call markers
 */

import { normalizeToolArgs } from "./rulesEngineHelpers";
import type { NormalizedToolArgs } from "@/types/rulesEngine";

export interface ParsedToolCall {
  name: string;
  parameters: Record<string, unknown>;
}

/**
 * Extract tool calls from content that may contain <|python_start|>...<|python_end|> markers
 * or plain JSON tool call objects
 * Also normalizes parameters to unwrap {type, value} structures
 */
export function parseToolCallsFromContent(content: string): ParsedToolCall[] {
  const toolCalls: ParsedToolCall[] = [];
  const pythonStartMarker = "<|python_start|>";
  const pythonEndMarker = "<|python_end|>";

  // First, try to find tool calls with markers
  let startIndex = 0;
  while (true) {
    const startPos = content.indexOf(pythonStartMarker, startIndex);
    if (startPos === -1) break;

    const endPos = content.indexOf(pythonEndMarker, startPos + pythonStartMarker.length);
    if (endPos === -1) break;

    const toolCallJson = content.slice(
      startPos + pythonStartMarker.length,
      endPos
    ).trim();

    try {
      const parsed = JSON.parse(toolCallJson) as { name: string; parameters?: Record<string, unknown> };
      if (parsed.name && parsed.parameters) {
        // Normalize parameters to unwrap {type, value} structures
        const normalizedParams = normalizeToolArgs(parsed.parameters) as Record<string, NormalizedToolArgs>;
        
        toolCalls.push({
          name: parsed.name,
          parameters: normalizedParams,
        });
      }
    } catch (e) {
      console.warn(`[Tool Call Parser] Failed to parse tool call JSON:`, toolCallJson, e);
    }

    startIndex = endPos + pythonEndMarker.length;
  }

  // If no tool calls found with markers, try to find plain JSON tool calls
  // Look for JSON objects that look like tool calls: {"name": "...", "parameters": {...}}
  if (toolCalls.length === 0) {
    try {
      // Try parsing the entire content as JSON
      const parsed = JSON.parse(content.trim()) as { name?: string; parameters?: Record<string, unknown> };
      if (parsed.name && parsed.parameters && typeof parsed.name === 'string') {
        // Check if this looks like a schema description (has "type" keys) vs actual values
        const hasSchemaKeys = Object.values(parsed.parameters).some(
          (val) => typeof val === 'object' && val !== null && 'type' in val && !('value' in val)
        );
        
        // Only treat as tool call if it has actual values, not schema definitions
        if (!hasSchemaKeys) {
          const normalizedParams = normalizeToolArgs(parsed.parameters) as Record<string, NormalizedToolArgs>;
          toolCalls.push({
            name: parsed.name,
            parameters: normalizedParams,
          });
        }
      }
    } catch {
      // Not valid JSON, try to find JSON objects within the content
      // Look for patterns like {"name": "create_encounter", "parameters": {...}}
      const jsonPattern = /\{"name"\s*:\s*"([^"]+)",\s*"parameters"\s*:\s*(\{.*?\})\}/s;
      const match = content.match(jsonPattern);
      if (match) {
        try {
          const name = match[1];
          const paramsJson = match[2];
          const parameters = JSON.parse(paramsJson) as Record<string, unknown>;
          
          // Check if this looks like a schema description vs actual values
          const hasSchemaKeys = Object.values(parameters).some(
            (val) => typeof val === 'object' && val !== null && 'type' in val && !('value' in val)
          );
          
          if (!hasSchemaKeys) {
            const normalizedParams = normalizeToolArgs(parameters) as Record<string, NormalizedToolArgs>;
            toolCalls.push({
              name,
              parameters: normalizedParams,
            });
          }
        } catch (e) {
          console.warn(`[Tool Call Parser] Failed to parse plain JSON tool call:`, e);
        }
      }
    }
  }

  return toolCalls;
}

/**
 * Remove tool call markers and header markers from content
 */
export function removeToolCallMarkers(content: string): string {
  return content
    .replace(/<\|python_start\|>.*?<\|python_end\|>/gs, "")
    .replace(/<\|header_start\|>.*?<\|header_end\|>/gs, "")
    .trim();
}

/**
 * Filter out all Together AI special markers from content
 */
export function filterTogetherAIMarkers(content: string): string {
  return content
    .replace(/<\|python_start\|>.*?<\|python_end\|>/gs, "")
    .replace(/<\|header_start\|>.*?<\|header_end\|>/gs, "")
    .replace(/<\|python_start\|>/g, "")
    .replace(/<\|python_end\|>/g, "")
    .replace(/<\|header_start\|>/g, "")
    .replace(/<\|header_end\|>/g, "");
}

