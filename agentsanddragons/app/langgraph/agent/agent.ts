import {
  StateGraph,
  MessagesAnnotation,
  START,
  Annotation,
} from "@langchain/langgraph";
import { ChatTogether } from "../../../utils/ChatTogether";
import { DND_PLAYER_SYSTEM_PROMPT } from "@/data/SystemPrompts";

const llm = new ChatTogether({ model: "meta-llama/Llama-4-Scout-17B-16E-Instruct", temperature: 0 });

const builder = new StateGraph(
  Annotation.Root({
    messages: MessagesAnnotation.spec["messages"],
    timestamp: Annotation<number>,
  }),
)
  .addNode("agent", async (state, config) => {
    const message = await llm.invoke([
      {
        type: "system",
        content: DND_PLAYER_SYSTEM_PROMPT,
      },
      ...state.messages,
    ]);

    return { messages: message, timestamp: Date.now() };
  })
  .addEdge(START, "agent");

export const graph = builder.compile();
