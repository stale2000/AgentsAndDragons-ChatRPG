/**
 * SSE stream parsing utilities for Together AI responses
 */

import type { TogetherAIResponse } from "@/types/rulesEngine";

export interface StreamParseOptions {
  onContent?: (content: string) => void;
  onToolCallDelta?: (delta: TogetherAIResponse['choices'][0]['delta']) => void;
  onFinishReason?: (reason: string) => void;
  onDone?: () => void;
}

export interface StreamParseResult {
  finishReason?: string;
  hasToolCalls: boolean;
}

/**
 * Parse SSE stream and extract content/tool calls
 */
export async function parseSSEStream(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  options: StreamParseOptions = {}
): Promise<StreamParseResult> {
  const { onContent, onToolCallDelta, onFinishReason } = options;
  const decoder = new TextDecoder();
  let buffer = "";
  let finishReason: string | undefined;
  let hasToolCalls = false;

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;

      const data = line.slice(6).trim();
      if (data === "[DONE]") {
        break;
      }

      try {
        const parsed = JSON.parse(data) as TogetherAIResponse;
        const choice = parsed.choices?.[0];
        const delta = choice?.delta;
        const chunkFinishReason = choice?.finish_reason;

        if (delta?.content) {
          onContent?.(delta.content);
        }

        if (delta?.tool_calls) {
          hasToolCalls = true;
          onToolCallDelta?.(delta);
        }

        if (chunkFinishReason) {
          finishReason = chunkFinishReason;
          onFinishReason?.(chunkFinishReason);
        }
      } catch {
        // Skip invalid JSON
      }
    }
  }

  return { finishReason, hasToolCalls };
}

/**
 * Extract content from SSE stream
 */
export async function extractStreamContent(
  reader: ReadableStreamDefaultReader<Uint8Array>
): Promise<string> {
  let content = "";
  await parseSSEStream(reader, {
    onContent: (chunk) => {
      content += chunk;
    },
  });
  return content;
}

