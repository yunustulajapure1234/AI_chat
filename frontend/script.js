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
  for (const message of chat.messages) {
    addMessage(message.role, message.content);
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

function addMessage(role, content) {
  const row = document.createElement("article");
  row.className = `message ${role}`;

  const avatar = document.createElement("div");
  avatar.className = "message-avatar";
  avatar.setAttribute("aria-hidden", "true");
  avatar.textContent = role === "assistant" ? "Y" : "U";

  const body = document.createElement("div");
  body.className = "message-body";
  body.textContent = content;
  row.append(avatar, body);
  messageList.append(row);
  scrollToBottom();
  return row;
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
    addMessage("assistant", data.reply);
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

document.addEventListener("keydown", (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
    event.preventDefault();
    startNewChat();
  }
  if (event.key === "Escape") closeSidebar();
});

renderHistory();
updateInputState();
