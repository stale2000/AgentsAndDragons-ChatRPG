/**
 * Tool call accumulation utilities for streaming responses
 */

import type { AccumulatedToolCall, TogetherAIResponse } from "@/types/rulesEngine";

/**
 * Accumulate tool call deltas from streaming responses
 */
export function accumulateToolCallDelta(
  pendingCalls: AccumulatedToolCall[],
  delta: TogetherAIResponse["choices"][0]["delta"]
): void {
  if (!delta?.tool_calls) return;

  for (const toolCallDelta of delta.tool_calls) {
    const index = toolCallDelta.index ?? 0;

    if (!pendingCalls[index]) {
      pendingCalls[index] = {
        id: toolCallDelta.id || `call_${Date.now()}_${index}`,
        type: "function",
        function: {
          name: "",
          arguments: "",
        },
      };
    }

    if (toolCallDelta.function?.name) {
      pendingCalls[index].function.name += toolCallDelta.function.name;
    }
    if (toolCallDelta.function?.arguments) {
      pendingCalls[index].function.arguments += toolCallDelta.function.arguments;
    }
  }
}

