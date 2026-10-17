import Groq from "groq-sdk";
import { tavily } from "@tavily/core";

const model = "openai/gpt-oss-120b";
const tools = [
  {
    type: "function",
    function: {
      name: "searchWeb",
      description: "Search the web for current information.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "What to search for." },
        },
        required: ["query"],
        additionalProperties: false,
      },
    },
  },
];

async function searchWeb(query) {
  if (!process.env.TAVILY_API_KEY) {
    throw new Error("Web search is not configured. Add TAVILY_API_KEY to your environment.");
  }

  const client = tavily({ apiKey: process.env.TAVILY_API_KEY });
  const response = await client.search(query, { searchDepth: "basic", maxResults: 3 });

  return response.results
    .map(({ title, url, content }) => `${title}\n${url}\n${content.slice(0, 500)}`)
    .join("\n\n");
}

export async function getAssistantReply(chatMessages) {
  if (!process.env.GROQ_API_KEY) {
    throw new Error("AI is not configured. Add GROQ_API_KEY to your environment.");
  }

  const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
  const messages = [
    {
      role: "system",
      content:
        "You are AVORA, an AI assistant created by Yunuscodeai. If asked who you are or who created you, identify yourself as AVORA and say you were created by Yunuscodeai. Do not call yourself Yunus ChatGPT or claim to be a person. Be helpful, answer clearly, and use searchWeb when current information is needed.",
    },
    ...chatMessages.slice(-12),
  ];

  for (let turn = 0; turn < 4; turn += 1) {
    const completion = await groq.chat.completions.create({
      model,
      messages,
      tools,
      tool_choice: "auto",
    });
    const assistantMessage = completion.choices[0]?.message;

    if (!assistantMessage) {
      throw new Error("The AI did not return a response. Please try again.");
    }

    if (!assistantMessage.tool_calls?.length) {
      return assistantMessage.content || "I couldn't create a text response. Please try again.";
    }

    messages.push(assistantMessage);

    for (const toolCall of assistantMessage.tool_calls) {
      if (toolCall.function.name !== "searchWeb") {
        throw new Error(`The AI requested an unsupported tool: ${toolCall.function.name}`);
      }

      const { query } = JSON.parse(toolCall.function.arguments);
      const result = await searchWeb(query);
      messages.push({
        role: "tool",
        tool_call_id: toolCall.id,
        content: result || "No useful search results were found.",
      });
    }
  }

  throw new Error("The AI made too many search requests. Please try asking in a different way.");
}

export function isValidChatMessages(messages) {
  return (
    Array.isArray(messages) &&
    messages.length > 0 &&
    messages.every(
      (message) =>
        message &&
        ["user", "assistant"].includes(message.role) &&
        typeof message.content === "string",
    )
  );
}
