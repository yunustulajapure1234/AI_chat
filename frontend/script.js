import { renderMarkdown } from "./markdown.js";

const form = document.querySelector("#chat-form");
const input = document.querySelector("#message-input");
const sendButton = document.querySelector("#send-button");
const characterCount = document.querySelector("#character-count");
const welcome = document.querySelector("#welcome");
const messageList = document.querySelector("#message-list");
const conversation = document.querySelector("#conversation");
const historyList = document.querySelector("#history-list");
const sidebar = document.querySelector("#sidebar");
const sidebarScrim = document.querySelector("#sidebar-scrim");

const storageKey = "yunus-chat-conversations";
let conversations = loadConversations();
let currentConversationId = null;
let waitingForReply = false;

function loadConversations() {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) || "[]");
    return Array.isArray(saved)
      ? saved.filter(
          (chat) =>
            chat &&
            typeof chat.id === "string" &&
            typeof chat.title === "string" &&
            Array.isArray(chat.messages),
        )
      : [];
  } catch {
    return [];
  }
}

async function copyText(text, button) {
  try {
    await navigator.clipboard.writeText(text);
    button.textContent = "Copied";
    window.setTimeout(() => {
      button.textContent = button.dataset.copyLabel;
    }, 1400);
  } catch {
    showError("Could not copy to clipboard. Check your browser permissions and try again.");
  }
}

async function regenerateResponse(chat, messageIndex, row) {
  if (waitingForReply || !chat || messageIndex !== chat.messages.length - 1) return;

  waitingForReply = true;
  updateInputState();
  const typing = showTyping();

  try {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: chat.messages.slice(0, messageIndex) }),
    });
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "The response could not be regenerated.");
    }
    if (typeof data.reply !== "string" || !data.reply.trim()) {
      throw new Error("The AI returned an empty response. Please try again.");
    }

    chat.messages[messageIndex].content = data.reply;
    row.replaceWith(addMessage("assistant", data.reply, messageIndex));
    saveConversations();
  } catch (error) {
    showError(error instanceof Error ? error.message : "Something went wrong. Please try again.");
  } finally {
    typing.remove();
    waitingForReply = false;
    updateInputState();
  }
}

function saveConversations() {
  try {
    localStorage.setItem(storageKey, JSON.stringify(conversations));
  } catch {
    showError("This browser could not save your chat history.");
  }
}

function currentConversation() {
  return conversations.find((chat) => chat.id === currentConversationId);
}

function startNewChat() {
  currentConversationId = null;
  welcome.hidden = false;
  messageList.replaceChildren();
  renderHistory();
  closeSidebar();
  input.focus();
}

function openConversation(id) {
  const chat = conversations.find((item) => item.id === id);
  if (!chat) return;

  currentConversationId = id;
  welcome.hidden = chat.messages.length > 0;
  messageList.replaceChildren();
  for (const [index, message] of chat.messages.entries()) {
    addMessage(message.role, message.content, index);
  }
  renderHistory();
  closeSidebar();
}

function renderHistory() {
  historyList.replaceChildren();

  if (conversations.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty-history";
    empty.textContent = "Your chats will appear here";
    historyList.append(empty);
    return;
  }

  for (const chat of conversations.slice().reverse()) {
    const button = document.createElement("button");
    button.className = `history-item${chat.id === currentConversationId ? " current" : ""}`;
    button.type = "button";
    button.title = chat.title;

    const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    icon.setAttribute("viewBox", "0 0 24 24");
    icon.setAttribute("aria-hidden", "true");
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", "M5 5h14v11H9l-4 3V5Z");
    icon.append(path);

    const title = document.createElement("span");
    title.textContent = chat.title;
    button.append(icon, title);
    button.addEventListener("click", () => openConversation(chat.id));
    historyList.append(button);
  }
}

function addMessage(role, content, messageIndex = null) {
  const row = document.createElement("article");
  row.className = `message ${role}`;

  const avatar = document.createElement("div");
  avatar.className = "message-avatar";
  avatar.setAttribute("aria-hidden", "true");
  avatar.textContent = role === "assistant" ? "Y" : "U";

  const body = document.createElement("div");
  body.className = "message-body";
  if (role === "assistant") {
    body.innerHTML = renderMarkdown(content);
  } else {
    body.textContent = content;
  }

  if (role === "assistant") {
    const contentColumn = document.createElement("div");
    contentColumn.className = "assistant-content";
    const actions = document.createElement("div");
    actions.className = "message-actions";
    actions.append(
      createMessageAction("copy-response", "Copy response", "Copy"),
      createMessageAction("regenerate-response", "Regenerate response", "Regenerate"),
      createMessageAction("feedback-up", "Helpful response", "Helpful"),
      createMessageAction("feedback-down", "Not helpful", "Not helpful"),
    );
    actions.dataset.messageIndex = messageIndex ?? "";
    actions.querySelector('[data-action="regenerate-response"]').hidden =
      messageIndex !== null && messageIndex !== currentConversation()?.messages.length - 1;
    contentColumn.append(body, actions);
    row.append(avatar, contentColumn);
  } else {
    row.append(avatar, body);
  }

  messageList.append(row);
  scrollToBottom();
  return row;
}

function createMessageAction(action, label, text) {
  const button = document.createElement("button");
  button.className = "message-action";
  button.type = "button";
  button.dataset.action = action;
  button.dataset.copyLabel = text;
  button.setAttribute("aria-label", label);
  button.title = label;
  button.textContent = text;
  return button;
}

function showError(message) {
  const error = document.createElement("div");
  error.className = "error-message";
  error.setAttribute("role", "alert");
  error.textContent = message;
  messageList.append(error);
  scrollToBottom();
}

function showTyping() {
  const row = document.createElement("article");
  row.className = "message assistant";
  row.setAttribute("aria-label", "Yunus ChatGPT is thinking");

  const avatar = document.createElement("div");
  avatar.className = "message-avatar";
  avatar.textContent = "Y";

  const dots = document.createElement("div");
  dots.className = "typing-dots";
  dots.innerHTML = "<span></span><span></span><span></span>";
  row.append(avatar, dots);
  messageList.append(row);
  scrollToBottom();
  return row;
}

function scrollToBottom() {
  requestAnimationFrame(() => {
    conversation.scrollTop = conversation.scrollHeight;
  });
}

function closeSidebar() {
  sidebar.classList.remove("open");
  sidebarScrim.classList.remove("visible");
}

function updateInputState() {
  const length = input.value.length;
  characterCount.textContent = `${length} / 4000`;
  sendButton.disabled = waitingForReply || input.value.trim().length === 0;
  input.style.height = "auto";
  input.style.height = `${Math.min(input.scrollHeight, 150)}px`;
}

async function sendMessage(text = input.value) {
  const content = text.trim();
  if (!content || waitingForReply) return;

  if (!currentConversation()) {
    const chat = {
      id: crypto.randomUUID(),
      title: content.length > 34 ? `${content.slice(0, 34)}…` : content,
      messages: [],
    };
    conversations.push(chat);
    currentConversationId = chat.id;
  }

  const chat = currentConversation();
  chat.messages.push({ role: "user", content });
  if (chat.messages.length === 1) {
    chat.title = content.length > 34 ? `${content.slice(0, 34)}…` : content;
  }

  input.value = "";
  updateInputState();
  welcome.hidden = true;
  addMessage("user", content);
  renderHistory();
  saveConversations();

  waitingForReply = true;
  updateInputState();
  const typing = showTyping();

  try {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: chat.messages }),
    });
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Your message could not be sent.");
    }
    if (typeof data.reply !== "string" || !data.reply.trim()) {
      throw new Error("The AI returned an empty response. Please try again.");
    }

    chat.messages.push({ role: "assistant", content: data.reply });
    addMessage("assistant", data.reply, chat.messages.length - 1);
    saveConversations();
  } catch (error) {
    showError(error instanceof Error ? error.message : "Something went wrong. Please try again.");
  } finally {
    typing.remove();
    waitingForReply = false;
    updateInputState();
    input.focus();
  }
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  void sendMessage();
});

input.addEventListener("input", updateInputState);
input.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    void sendMessage();
  }
});

document.querySelector("#new-chat").addEventListener("click", startNewChat);
document.querySelector("#home-button").addEventListener("click", startNewChat);
document.querySelector("#clear-history").addEventListener("click", () => {
  if (!conversations.length || !window.confirm("Clear all saved chats?")) return;
  conversations = [];
  currentConversationId = null;
  saveConversations();
  startNewChat();
});

document.querySelector("#open-sidebar").addEventListener("click", () => {
  sidebar.classList.add("open");
  sidebarScrim.classList.add("visible");
});
document.querySelector("#close-sidebar").addEventListener("click", closeSidebar);
sidebarScrim.addEventListener("click", closeSidebar);

document.querySelectorAll(".suggestion-card").forEach((card) => {
  card.addEventListener("click", () => sendMessage(card.dataset.prompt || ""));
});

messageList.addEventListener("click", async (event) => {
  const button = event.target.closest("button[data-action]");
  if (!button) return;

  const row = button.closest(".message.assistant");
  const chat = currentConversation();
  if (!row || !chat) return;

  if (button.dataset.action === "copy-code") {
    const code = button.closest(".code-block")?.querySelector("code")?.textContent;
    if (code) await copyText(code, button);
    return;
  }

  if (button.dataset.action === "copy-response") {
    const index = Number(button.closest(".message-actions").dataset.messageIndex);
    const response = chat.messages[index]?.content;
    if (response) await copyText(response, button);
    return;
  }

  if (button.dataset.action === "regenerate-response") {
    const index = Number(button.closest(".message-actions").dataset.messageIndex);
    await regenerateResponse(chat, index, row);
    return;
  }

  if (button.dataset.action === "feedback-up" || button.dataset.action === "feedback-down") {
    const group = button.closest(".message-actions");
    const wasSelected = button.getAttribute("aria-pressed") === "true";
    group.querySelectorAll('[data-action^="feedback-"]').forEach((item) => {
      item.setAttribute("aria-pressed", "false");
    });
    button.setAttribute("aria-pressed", String(!wasSelected));
  }
});

document.addEventListener("keydown", (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
    event.preventDefault();
    startNewChat();
  }
  if (event.key === "Escape") closeSidebar();
});

renderHistory();
updateInputState();
