import "dotenv/config";
import { getAssistantReply, isValidChatMessages } from "../lib/chat.js";

export default async function handler(request, response) {
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    response.status(405).json({ error: "Method not allowed. Use POST." });
    return;
  }

  const messages = request.body?.messages;
  if (!isValidChatMessages(messages)) {
    response.status(400).json({ error: "Please send a valid chat message." });
    return;
  }

  try {
    const reply = await getAssistantReply(messages);
    response.status(200).json({ reply });
  } catch (error) {
    console.error("Chat request failed:", error);
    response.status(500).json({
      error: error instanceof Error ? error.message : "Something went wrong. Please try again.",
    });
  }
}
