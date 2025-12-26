/**
 * Message conversion utilities between different message formats
 */

import type {
  TogetherAIMessage,
  ToolCallMessage,
  ToolResultMessage,
  VercelMessage,
} from "@/types/rulesEngine";

type MessageUnion = TogetherAIMessage | ToolCallMessage | ToolResultMessage;

/**
 * Convert internal message format to Vercel AI SDK format
 */
export function convertToVercelMessages(
  messages: MessageUnion[]
): VercelMessage[] {
  return messages
    .filter((msg): msg is MessageUnion =>
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
      if (msg.role === "assistant" && "tool_calls" in msg && msg.tool_calls) {
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
}

