import "dotenv/config";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getAssistantReply, isValidChatMessages } from "./lib/chat.js";

const folder = path.dirname(fileURLToPath(import.meta.url));
const frontendFolder = path.join(folder, "frontend");
const port = Number(process.env.PORT) || 3000;

const contentTypes = {
  "/": "text/html; charset=utf-8",
  "/index.html": "text/html; charset=utf-8",
  "/style.css": "text/css; charset=utf-8",
  "/app.bundle.js": "text/javascript; charset=utf-8",
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

      if (!isValidChatMessages(body.messages)) {
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
