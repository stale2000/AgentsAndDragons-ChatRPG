import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { BaseMessage, AIMessage, SystemMessage, HumanMessage, AIMessageChunk } from "@langchain/core/messages";
import { ChatResult, ChatGeneration, ChatGenerationChunk } from "@langchain/core/outputs";
import { CallbackManagerForLLMRun } from "@langchain/core/callbacks/manager";
import type { StructuredToolInterface } from "@langchain/core/tools";
import { zodToJsonSchema } from "zod-to-json-schema";

interface TogetherAIStreamChunk {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    delta: {
      role?: string;
      content?: string;
    };
    index: number;
    finish_reason?: string;
  }>;
}

interface TogetherAIChatModelConfig {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  apiKey?: string;
}

export class ChatTogether extends BaseChatModel {
  model: string;
  temperature: number;
  maxTokens: number;
  apiKey: string;

  constructor(config: TogetherAIChatModelConfig = {}) {
    super({});
    this.model = config.model || "meta-llama/Llama-4-Scout-17B-16E-Instruct";
    this.temperature = config.temperature ?? 0.7;
    this.maxTokens = config.maxTokens || 512;
    this.apiKey = config.apiKey || process.env.TOGETHER_API_KEY || "";
    
    if (!this.apiKey) {
      throw new Error("TogetherAI API key is required. Set TOGETHER_API_KEY environment variable or pass apiKey in config.");
    }
  }

  _llmType(): string {
    return "together";
  }

  async _generate(
    messages: BaseMessage[],
    options?: this["ParsedCallOptions"],
    runManager?: CallbackManagerForLLMRun
  ): Promise<ChatResult> {
    const formattedMessages = this.formatMessages(messages);
    
    // Log the messages to see what's being sent (for debugging)
    if (formattedMessages.length > 0) {
      console.log(`[ChatTogether] Sending request to Together AI`, {
        model: this.model,
        messageCount: formattedMessages.length,
        messages: formattedMessages.map((m, i) => ({
          index: i,
          role: m.role,
          contentPreview: typeof m.content === 'string' 
            ? m.content.substring(0, 300) + (m.content.length > 300 ? '...' : '')
            : 'non-string content',
          contentLength: typeof m.content === 'string' ? m.content.length : 0,
        })),
        hasBoundTools: !!(this as any)._boundTools,
        boundToolsCount: (this as any)._boundTools?.length || 0,
      });
      
      // Log full content of system messages (they contain tool descriptions)
      formattedMessages.forEach((m, i) => {
        if (m.role === 'system' && typeof m.content === 'string') {
          console.log(`[ChatTogether] System message ${i} (full):`, m.content);
        }
      });
    }
    
    // Include tools in request if they're bound (for Together AI function calling)
    const requestBody: any = {
      model: this.model,
      messages: formattedMessages,
      temperature: this.temperature,
      max_tokens: this.maxTokens,
      stream: false,
    };
    
    // Add tools if bound (for native function calling support)
    const togetherTools = (this as any)._togetherTools;
    if (togetherTools && togetherTools.length > 0) {
      requestBody.tools = togetherTools;
      requestBody.tool_choice = "auto"; // Let model decide when to call tools
      console.log(`[ChatTogether] Including ${togetherTools.length} tools in API request for function calling`);
    }
    
    const response = await fetch("https://api.together.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error('TogetherAI API Error:', {
        status: response.status,
        statusText: response.statusText,
        body: errorBody,
        model: this.model,
        messages: formattedMessages
      });
      throw new Error(`TogetherAI API error: ${response.status} ${response.statusText} - ${errorBody}`);
    }

    const data = await response.json();
    const message = data.choices[0]?.message || {};
    const content = message.content || "";
    const toolCalls = message.tool_calls || [];
    
    // Log the response to see what the model returned
    console.log(`[ChatTogether] Received response from Together AI`, {
      model: this.model,
      contentLength: content.length,
      contentPreview: content.substring(0, 300) + (content.length > 300 ? '...' : ''),
      hasToolCalls: toolCalls.length > 0,
      toolCallsCount: toolCalls.length,
      toolCalls: toolCalls.length > 0 ? toolCalls.map((tc: any) => ({
        id: tc.id,
        function: tc.function?.name,
        arguments: tc.function?.arguments,
      })) : undefined,
    });
    
    // Create AIMessage - use empty string if content is null/undefined and we have tool_calls
    // LangChain's ToolCallingAgentOutputParser expects content to be a string, not null/undefined
    const messageContent = (content === null || content === undefined) && toolCalls.length > 0 
      ? "" 
      : (content || "");
    
    const aiMessage = new AIMessage(messageContent);
    
    // Store tool_calls in the message if present
    // LangChain AIMessage expects tool_calls in format: [{name: string, args: object, id: string}]
    if (toolCalls.length > 0) {
      // Convert Together AI tool_calls format to LangChain format
      const langchainToolCalls = toolCalls.map((tc: any) => ({
        name: tc.function?.name || '',
        args: JSON.parse(tc.function?.arguments || '{}'),
        id: tc.id || `call_${Date.now()}_${Math.random()}`,
      }));
      
      // Set tool_calls on the message (using type assertion since it's part of AIMessage)
      (aiMessage as any).tool_calls = langchainToolCalls;
      
      console.log(`[ChatTogether] Converted ${toolCalls.length} tool_calls to LangChain format:`, 
        langchainToolCalls.map((tc: {name: string, args: any, id: string}) => `${tc.name}(${JSON.stringify(tc.args)})`));
    }
    
    const generation: ChatGeneration = {
      text: messageContent,
      message: aiMessage,
    };

    return {
      generations: [generation],
    };
  }

  async *_streamResponseChunks(
    messages: BaseMessage[],
    options?: this["ParsedCallOptions"],
    runManager?: CallbackManagerForLLMRun
  ): AsyncGenerator<ChatGenerationChunk> {
    const formattedMessages = this.formatMessages(messages);
    
    // Include tools in request if they're bound (for Together AI function calling)
    const requestBody: any = {
      model: this.model,
      messages: formattedMessages,
      temperature: this.temperature,
      max_tokens: this.maxTokens,
      stream: true,
    };
    
    // Add tools if bound (for native function calling support)
    const togetherTools = (this as any)._togetherTools;
    if (togetherTools && togetherTools.length > 0) {
      requestBody.tools = togetherTools;
      requestBody.tool_choice = "auto"; // Let model decide when to call tools
    }
    
    const response = await fetch("https://api.together.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error('TogetherAI Streaming API Error:', {
        status: response.status,
        statusText: response.statusText,
        body: errorBody,
        model: this.model
      });
      throw new Error(`TogetherAI API error: ${response.status} ${response.statusText} - ${errorBody}`);
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error("No reader available");
    }

    const decoder = new TextDecoder();
    let buffer = "";

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const data = line.slice(6).trim();
            if (data === "[DONE]") continue;
            
            try {
              const parsed: TogetherAIStreamChunk = JSON.parse(data);
              const content = parsed.choices[0]?.delta?.content;
              
              if (content) {
                yield new ChatGenerationChunk({
                  text: content,
                  message: new AIMessageChunk({ content }),
                });
              }
            } catch (e) {
              // Skip invalid JSON
              continue;
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  private formatMessages(messages: BaseMessage[]): Array<{ role: string; content: string }> {
    return messages.map((message) => {
      const content = typeof message.content === 'string' ? message.content : JSON.stringify(message.content);
      
      if (message instanceof HumanMessage) {
        return { role: "user", content };
      } else if (message instanceof AIMessage) {
        return { role: "assistant", content };
      } else if (message instanceof SystemMessage) {
        return { role: "system", content };
      } else {
        return { role: "user", content };
      }
    });
  }

  /**
   * Bind tools to the model for tool calling support.
   * Required by LangGraph's createReactAgent.
   * 
   * For Together AI models that support function calling, we convert LangChain tools
   * to Together AI's format and include them in API requests.
   */
  bindTools(tools: StructuredToolInterface[]): this {
    // Create a new instance with tools bound
    const bound = new ChatTogether({
      model: this.model,
      temperature: this.temperature,
      maxTokens: this.maxTokens,
      apiKey: this.apiKey,
    });
    
    // Store tools for use in API calls
    (bound as any)._boundTools = tools;
    
    // Convert LangChain tools to Together AI format
    (bound as any)._togetherTools = tools.map(tool => {
      // Convert Zod schema to JSON Schema if it exists
      let parameters: any = {};
      if (tool.schema) {
        try {
          // If it's a Zod schema, convert it
          parameters = zodToJsonSchema(tool.schema as any);
        } catch (e) {
          // If conversion fails, try to use it as-is
          console.warn(`[ChatTogether] Failed to convert schema for tool ${tool.name}:`, e);
          parameters = typeof tool.schema === 'object' ? tool.schema : {};
        }
      }
      
      return {
        type: "function",
        function: {
          name: tool.name,
          description: tool.description,
          parameters: parameters,
        },
      };
    });
    
    return bound as this;
  }
}
