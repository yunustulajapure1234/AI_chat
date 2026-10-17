import "dotenv/config";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Groq from "groq-sdk";
import { tavily } from "@tavily/core";

const folder = path.dirname(fileURLToPath(import.meta.url));
const frontendFolder = path.join(folder, "frontend");
const port = Number(process.env.PORT) || 3000;
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

const contentTypes = {
  "/": "text/html; charset=utf-8",
  "/index.html": "text/html; charset=utf-8",
  "/style.css": "text/css; charset=utf-8",
  "/script.js": "text/javascript; charset=utf-8",
};

async function sendJson(response, status, data) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(data));
}

async function getRequestBody(request) {
  let body = "";
  for await (const chunk of request) {
    body += chunk;
    if (body.length > 100_000) {
      throw new Error("Your message is too long. Please shorten it and try again.");
    }
  }
  return JSON.parse(body);
}

async function searchWeb(query) {
  if (!process.env.TAVILY_API_KEY) {
    throw new Error("Web search is not configured. Add TAVILY_API_KEY to your .env file.");
  }

  const client = tavily({ apiKey: process.env.TAVILY_API_KEY });
  const response = await client.search(query, { searchDepth: "basic", maxResults: 3 });

  return response.results
    .map(({ title, url, content }) => `${title}\n${url}\n${content.slice(0, 500)}`)
    .join("\n\n");
}

async function getAssistantReply(chatMessages) {
  if (!process.env.GROQ_API_KEY) {
    throw new Error("AI is not configured. Add GROQ_API_KEY to your .env file.");
  }

  const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
  const messages = [
    {
      role: "system",
      content:
        "You are Yunus ChatGPT, a helpful personal assistant. Use searchWeb when current information is needed and answer clearly.",
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

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url, `http://${request.headers.host || "localhost"}`);

    if (request.method === "POST" && url.pathname === "/api/chat") {
      let body;
      try {
        body = await getRequestBody(request);
      } catch (error) {
        await sendJson(response, 400, { error: error.message });
        return;
      }

      if (
        !Array.isArray(body.messages) ||
        body.messages.length === 0 ||
        body.messages.some(
          (message) =>
            !message ||
            !["user", "assistant"].includes(message.role) ||
            typeof message.content !== "string",
        )
      ) {
        await sendJson(response, 400, { error: "Please send a valid chat message." });
        return;
      }

      try {
        const reply = await getAssistantReply(body.messages);
        await sendJson(response, 200, { reply });
      } catch (error) {
        console.error("Chat request failed:", error);
        await sendJson(response, 500, {
          error: error instanceof Error ? error.message : "Something went wrong. Please try again.",
        });
      }
      return;
    }

    if (request.method === "GET" && contentTypes[url.pathname]) {
      const fileName = url.pathname === "/" ? "index.html" : url.pathname.slice(1);
      const file = await readFile(path.join(frontendFolder, fileName));
      response.writeHead(200, { "Content-Type": contentTypes[url.pathname] });
      response.end(file);
      return;
    }

    await sendJson(response, 404, { error: "Not found." });
  } catch (error) {
    console.error("Server error:", error);
    if (!response.headersSent) {
      await sendJson(response, 500, { error: "The server hit an unexpected error." });
    } else {
      response.end();
    }
  }
});

server.listen(port, () => {
  console.log(`Yunus ChatGPT is ready at http://localhost:${port}`);
});
