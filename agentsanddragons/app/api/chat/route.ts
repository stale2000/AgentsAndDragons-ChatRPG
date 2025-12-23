import { NextRequest, NextResponse } from "next/server";
import { Message as VercelChatMessage, StreamingTextResponse } from "ai";

import { ChatTogether } from "../../../utils/ChatTogether";
import { PromptTemplate } from "@langchain/core/prompts";
import { DND_CHAT_TEMPLATE } from "@/data/SystemPrompts";
import { HttpResponseOutputParser } from "langchain/output_parsers";

export const runtime = "edge";

const formatMessage = (message: VercelChatMessage) => {
  return `${message.role}: ${message.content}`;
};

const TEMPLATE = DND_CHAT_TEMPLATE;

/**
 * This handler initializes and calls a simple chain with a prompt,
 * chat model, and output parser. See the docs for more information:
 *
 * https://js.langchain.com/docs/guides/expression_language/cookbook#prompttemplate--llm--outputparser
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const messages = body.messages ?? [];
    const formattedPreviousMessages = messages.slice(0, -1).map(formatMessage);
    const currentMessageContent = messages[messages.length - 1].content;
    const prompt = PromptTemplate.fromTemplate(TEMPLATE);

    /**
     * Using TogetherAI instead of OpenAI. You can also try other models:
     *
     * Available TogetherAI models include:
     * - meta-llama/Llama-4-Scout-17B-16E-Instruct
     */
    const model = new ChatTogether({
      temperature: 0.8,
      model: "meta-llama/Llama-4-Scout-17B-16E-Instruct",
    });

    /**
     * Chat models stream message chunks rather than bytes, so this
     * output parser handles serialization and byte-encoding.
     */
    const outputParser = new HttpResponseOutputParser();

    /**
     * Can also initialize as:
     *
     * import { RunnableSequence } from "@langchain/core/runnables";
     * const chain = RunnableSequence.from([prompt, model, outputParser]);
     */
    const chain = prompt.pipe(model).pipe(outputParser);

    const stream = await chain.stream({
      chat_history: formattedPreviousMessages.join("\n"),
      input: currentMessageContent,
    });

    return new StreamingTextResponse(stream);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: e.status ?? 500 });
  }
}
