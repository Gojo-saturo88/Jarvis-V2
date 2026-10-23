
"use strict";

const $ = (s) => document.querySelector(s);

const ui = {
  sidebar: $("#sidebar"),
  openSidebar: $("#openSidebar"),
  closeSidebar: $("#collapseSidebar"),
  backdrop: $("#mobileBackdrop"),
  history: $("#historyList"),
  newChat: $("#newChatBtn"),
  menuBtn: $("#menuBtn"),
  menu: $("#mainMenu"),
  toolsBtn: $("#toolsBtn"),
  toolsMenu: $("#toolsMenu"),
  form: $("#chatForm"),
  input: $("#chatInput"),
  send: $("#sendBtn"),
  voice: $("#voiceBtn"),
  messages: $("#chatMessages"),
  welcome: $("#welcome"),
  status: $("#systemStatus"),
  statusDot: $("#statusDot"),
  modal: $("#modalBackdrop"),
  modalTitle: $("#modalTitle"),
  modalContent: $("#modalContent")
};

const STORE = "jarvis_claude_style_v1";
const MAX_MESSAGES = 60;

let conversations = [];
let currentId = null;
let busy = false;
let forcedTool = null;
let recognition = null;
let speechEnabled = false;
let deferredInstallPrompt = null;

const makeId = () =>
  Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

function makeConversation() {
  return {
    id: makeId(),
    title: "New chat",
    updated: Date.now(),
    messages: []
  };
}

function currentChat() {
  return conversations.find(c => c.id === currentId);
}

function saveAll() {
  try {
    localStorage.setItem(STORE, JSON.stringify({
      conversations,
      currentId
    }));
  } catch (error) {
    console.warn("Chat save failed", error);
  }
}

function loadAll() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORE) || "null");
    if (saved && Array.isArray(saved.conversations)) {
      conversations = saved.conversations
        .filter(c => c && typeof c.id === "string" && Array.isArray(c.messages))
        .slice(0, 80);
      currentId = saved.currentId;
    }
  } catch {
    conversations = [];
  }

  if (!currentChat()) {
    const first = conversations[0];
    currentId = first ? first.id : null;
  }

  if (!currentChat()) {
    const c = makeConversation();
    conversations.unshift(c);
    currentId = c.id;
  }

  renderHistory();
  renderCurrentChat();
}

function setStatus(text, processing = false) {
  ui.status.textContent = text;
  ui.statusDot.classList.toggle("busy", processing);
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[char]);
}

/* Small, safe Markdown renderer for basic chat formatting. */
function renderMarkdown(raw) {
  let text = escapeHtml(raw);

  const codeBlocks = [];
  text = text.replace(/```([a-zA-Z0-9_-]*)\n?([\s\S]*?)```/g, (_, lang, code) => {
    const index = codeBlocks.length;
    codeBlocks.push(
      '<pre><code>' + code.replace(/\n$/, "") + "</code></pre>"
    );
    return "@@CODEBLOCK" + index + "@@";
  });

  text = text.replace(/`([^`\n]+)`/g, "<code>$1</code>");
  text = text.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  text = text.replace(/\*(.+?)\*/g, "<em>$1</em>");
  text = text.replace(/^### (.+)$/gm, "<h3>$1</h3>");
  text = text.replace(/^## (.+)$/gm, "<h2>$1</h2>");
  text = text.replace(/^# (.+)$/gm, "<h1>$1</h1>");

  text = text.replace(
    /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
    (_, label, url) =>
      '<a href="' + url + '" target="_blank" rel="noopener noreferrer">' +
      label + "</a>"
  );

  text = text.replace(
    /(^|[\s(])(https?:\/\/[^\s<]+)/g,
    (_, prefix, url) => {
      const cleanUrl = url.replace(/[.,!?;]+$/, "");
      const trailing = url.slice(cleanUrl.length);
      return prefix +
        '<a href="' + cleanUrl + '" target="_blank" rel="noopener noreferrer">' +
        cleanUrl + "</a>" + trailing;
    }
  );

  text = text.replace(/^[-*] (.+)$/gm, "<li>$1</li>");
  text = text.replace(/(<li>.*<\/li>\n?)+/g, match => "<ul>" + match + "</ul>");
  text = text.replace(/^\d+\. (.+)$/gm, "<li>$1</li>");
  text = text.replace(/\n/g, "<br>");

  codeBlocks.forEach((block, index) => {
    text = text.replace("@@CODEBLOCK" + index + "@@", block);
  });

  return text;
}

function addMessage(role, content, options = {}) {
  const chat = currentChat();
  if (!chat) return;

  const message = {
    id: makeId(),
    role,
    content: String(content).slice(0, 18000),
    time: Date.now()
  };

  chat.messages.push(message);
  chat.messages = chat.messages.slice(-MAX_MESSAGES);
  chat.updated = Date.now();

  if (role === "user" && chat.title === "New chat") {
    chat.title = message.content.replace(/\s+/g, " ").slice(0, 42);
  }

  if (!options.noSave) saveAll();

  renderOneMessage(message);
  ui.welcome.hidden = chat.messages.length > 0;
  renderHistory();

  return message;
}

function renderOneMessage(item) {
  const row = document.createElement("article");
  row.className = "message " + (item.role === "user" ? "user" : "assistant");
  row.dataset.messageId = item.id;

  const author = document.createElement("div");
  author.className = "message-author";
  author.textContent = item.role === "user" ? "You" : "JARVIS";

  row.appendChild(author);

  if (item.role === "user") {
    const bubble = document.createElement("div");
    bubble.className = "user-bubble";
    bubble.textContent = item.content;
    row.appendChild(bubble);
  } else {
    const content = document.createElement("div");
    content.className = "assistant-content";
    content.innerHTML = renderMarkdown(item.content);
    row.appendChild(content);
  }

  ui.messages.appendChild(row);
}

function renderCurrentChat() {
  ui.messages.replaceChildren();
  const chat = currentChat();
  const messages = chat ? chat.messages : [];

  messages.forEach(renderOneMessage);
  ui.welcome.hidden = messages.length > 0;
  scrollBottom();
}

function scrollBottom() {
  const area = $("#chatArea");
  requestAnimationFrame(() => {
    area.scrollTop = area.scrollHeight;
  });
}

function renderHistory() {
  ui.history.replaceChildren();

  const sorted = [...conversations]
    .sort((a, b) => b.updated - a.updated);

  sorted.forEach(chat => {
    const row = document.createElement("div");
    row.className = "history-item" + (chat.id === currentId ? " active" : "");

    const open = document.createElement("button");
    open.className = "history-open";
    open.textContent = chat.title || "New chat";
    open.title = chat.title || "New chat";
    open.addEventListener("click", () => {
      currentId = chat.id;
      saveAll();
      renderCurrentChat();
      renderHistory();
      closeSidebarMobile();
    });

    const del = document.createElement("button");
    del.className = "history-delete";
    del.textContent = "×";
    del.title = "Delete chat";
    del.setAttribute("aria-label", "Delete " + chat.title);
    del.addEventListener("click", (event) => {
      event.stopPropagation();
      deleteConversation(chat.id);
    });

    row.append(open, del);
    ui.history.appendChild(row);
  });
}

function newChat() {
  const chat = makeConversation();
  conversations.unshift(chat);
  currentId = chat.id;
  saveAll();
  renderHistory();
  renderCurrentChat();
  closeMenus();
  ui.input.focus();
}

function deleteConversation(id) {
  conversations = conversations.filter(c => c.id !== id);

  if (!conversations.length) {
    const chat = makeConversation();
    conversations.push(chat);
    currentId = chat.id;
  } else if (currentId === id) {
    currentId = [...conversations].sort((a, b) => b.updated - a.updated)[0].id;
  }

  saveAll();
  renderHistory();
  renderCurrentChat();
}

function clearCurrentChat() {
  const chat = currentChat();
  if (!chat) return;
  chat.messages = [];
  chat.title = "New chat";
  chat.updated = Date.now();
  saveAll();
  renderHistory();
  renderCurrentChat();
  closeMenus();
}

/* Processing indicator */

function showProcessing() {
  removeProcessing();

  const row = document.createElement("div");
  row.className = "message assistant";
  row.id = "processingMessage";

  const author = document.createElement("div");
  author.className = "message-author";
  author.textContent = "JARVIS";

  const content = document.createElement("div");
  content.className = "processing-row";

  const logo = document.createElement("div");
  logo.className = "processing-logo";
  logo.textContent = "J";

  const label = document.createElement("div");
  label.className = "processing-text";
  label.textContent = "Thinking";

  const dots = document.createElement("span");
  dots.className = "processing-dots";

  for (let i = 0; i < 3; i++) {
    dots.appendChild(document.createElement("span"));
  }

  label.appendChild(dots);
  content.append(logo, label);
  row.append(author, content);
  ui.messages.appendChild(row);
  scrollBottom();
}

function removeProcessing() {
  $("#processingMessage")?.remove();
}

function setBusy(value) {
  busy = value;
  ui.send.disabled = value;
  ui.input.disabled = value;
  ui.voice.disabled = value;
  setStatus(value ? "Thinking..." : "Ready", value);
  if (value) showProcessing();
  else removeProcessing();
}

/* Local commands */

function localCommand(text) {
  const q = text.trim().toLowerCase();

  if (/^(hi|hello|hey|namaste|namaskar)[!. ]*$/.test(q)) {
    return "Hello! I'm JARVIS. What can I help you with?";
  }

  if (/^(who are you|what are you|introduce yourself)[?.! ]*$/.test(q)) {
    return "I'm JARVIS, your browser-based AI assistant. I can help with quick commands, web lookups, news, study questions and coding.";
  }

  if (/^(time|what time is it|tell me the time)[?.! ]*$/.test(q)) {
    return "Your local time is " + new Date().toLocaleTimeString() + ".";
  }

  if (/^(date|today'?s date|what is the date|what is today'?s date)[?.! ]*$/.test(q)) {
    return "Today's date is " + new Date().toLocaleDateString(undefined, {
      weekday: "long", year: "numeric", month: "long", day: "numeric"
    }) + ".";
  }

  if (/^(open )?(youtube|yt)[!. ]*$/.test(q)) {
    window.open("https://www.youtube.com/", "_blank", "noopener,noreferrer");
    return "YouTube: https://www.youtube.com/";
  }

  if (/^(open )?google[!. ]*$/.test(q)) {
    window.open("https://www.google.com/", "_blank", "noopener,noreferrer");
    return "Google: https://www.google.com/";
  }

  if (/^(stop speaking|stop voice|quiet)[!. ]*$/.test(q)) {
    speechEnabled = false;
    if ("speechSynthesis" in window) speechSynthesis.cancel();
    return "Voice replies are disabled for this session.";
  }

  if (/^(enable voice|enable speech)[!. ]*$/.test(q)) {
    speechEnabled = true;
    return "Voice replies enabled.";
  }

  if (/^(help|show commands|what can you do)[?.! ]*$/.test(q)) {
    return [
      "Here's what I can do:",
      "",
      "• Tell the local time and date",
      "• Open Google or YouTube",
      "• Search the web for a topic",
      "• Retrieve recent news feeds",
      "• Explain concepts and help with homework using AI",
      "• Help write and debug code",
      "• Take voice input in supported browsers",
      "",
      "Use the Tools button for search, news, study and coding."
    ].join("\n");
  }

  return null;
}

/* Search and news */

function googleUrl(query) {
  return "https://www.google.com/search?q=" + encodeURIComponent(query);
}

function cleanHTML(html) {
  const doc = new DOMParser().parseFromString(html || "", "text/html");
  return (doc.body.textContent || "").trim();
}

async function webSearch(query) {
  const endpoint = "https://en.wikipedia.org/w/api.php?action=query&list=search&format=json&origin=*&srlimit=5&srsearch=" + encodeURIComponent(query);

  try {
    const response = await fetch(endpoint);
    if (!response.ok) throw new Error("Search request failed");

    const data = await response.json();
    const results = data?.query?.search || [];
    if (!results.length) throw new Error("No results");

    const lines = ["## Web search results", "Search: " + query, ""];

    results.forEach((item, i) => {
      lines.push(
        (i + 1) + ". **" + item.title + "**",
        cleanHTML(item.snippet),
        "https://en.wikipedia.org/?curid=" + item.pageid,
        ""
      );
    });

    lines.push("More results: " + googleUrl(query));
    return lines.join("\n");
  } catch {
    return "I couldn't retrieve search results from the quick lookup service. You can search the web here:\n\n" + googleUrl(query);
  }
}

async function liveNews(query) {
  const topic = query
    .replace(/\b(latest news|today'?s news|breaking news|current events|live news|news today|latest headlines|search the|news about)\b/ig, "")
    .trim() || "India";

  const rss = "https://news.google.com/rss/search?q=" +
    encodeURIComponent(topic + " when:7d") +
    "&hl=en-IN&gl=IN&ceid=IN:en";

  const endpoint = "https://api.rss2json.com/v1/api.json?rss_url=" + encodeURIComponent(rss);

  try {
    const response = await fetch(endpoint);
    if (!response.ok) throw new Error("News service failed");

    const data = await response.json();
    const items = (data.items || []).slice(0, 6);
    if (!items.length) throw new Error("No articles");

    const lines = [
      "## Latest news",
      "Topic: " + topic,
      "Retrieved: " + new Date().toLocaleString(),
      ""
    ];

    items.forEach((item, i) => {
      lines.push(
        (i + 1) + ". **" + cleanHTML(item.title) + "**",
        "Published: " + (item.pubDate || "Date unavailable"),
        item.link || "",
        ""
      );
    });

    lines.push("More news: " + googleUrl(topic + " latest news"));
    return lines.join("\n");
  } catch {
    return "The news feed is unavailable right now. Search for current headlines here:\n\n" + googleUrl(topic + " latest news");
  }
}

function isNewsQuery(q) {
  return /\b(latest news|today'?s news|breaking news|current events|live news|news today|latest headlines|news about|recent headlines)\b/i.test(q);
}

function isComplexQuery(q) {
  return /\b(explain|step by step|solve|prove|derive|debug|write code|create an app|build a website|write an essay|detailed explanation|teach me|homework|maths problem|reasoning|analy[sz]e|compare|make a project|generate code|program this|how do i build|why does|how does|what is the difference)\b/i.test(q)
    || q.length > 180;
}

/* AI */

async function askAI(prompt) {
  if (!window.puter?.ai?.chat) {
    throw new Error("Puter AI did not load. Check your internet connection and refresh the page.");
  }

  const chat = currentChat();
  const history = (chat?.messages || [])
    .filter(m => ["user", "assistant"].includes(m.role))
    .slice(-12)
    .map(m => ({ role: m.role, content: m.content }));

  const system = {
    role: "system",
    content: "You are JARVIS, a helpful and honest personal AI assistant. Give clear, accurate, friendly answers. Explain school topics at an understandable level. For code, provide complete usable examples when asked. Never claim you performed an action you did not perform. If information may be current or uncertain, say so and suggest checking reliable sources. Use readable Markdown."
  };

  const response = await window.puter.ai.chat([system, ...history]);

  if (typeof response === "string") return response;
  if (response?.message?.content) {
    const content = response.message.content;
    if (typeof content === "string") return content;
    if (Array.isArray(content)) {
      return content.map(part => part.text || "").join("\n");
    }
  }

  if (response?.text) return response.text;
  return JSON.stringify(response, null, 2);
}

/* Main routing */

async function processMessage(rawText) {
  const text = rawText.trim();
  if (!text || busy) return;

  ui.input.value = "";
  autoResizeInput();
  closeMenus();

  addMessage("user", text);

  const lower = text.toLowerCase();
  const command = localCommand(text);

  if (command !== null) {
    addMessage("assistant", command);
    speak(command);
    return;
  }

  setBusy(true);

  try {
    let answer;

    if (forcedTool === "search") {
      answer = await webSearch(text);
    } else if (forcedTool === "news" || isNewsQuery(text)) {
      answer = await liveNews(text);
    } else if (forcedTool === "study") {
      answer = await askAI("Help me study this topic with clear explanations and examples:\n" + text);
    } else if (forcedTool === "code") {
      answer = await askAI("Act as a coding assistant. Help with this coding request:\n" + text);
    } else if (/^(search|look up|find online|google)\s+/i.test(text)) {
      const query = text.replace(/^(search|look up|find online|google)\s+/i, "");
      answer = await webSearch(query);
    } else if (isComplexQuery(text)) {
      answer = await askAI(text);
    } else {
      answer = await webSearch(text);
    }

    addMessage("assistant", answer);
    speak(answer);
  } catch (error) {
    console.error(error);
    addMessage(
      "assistant",
      "I couldn't complete that request. " +
      (error?.message || "Please check your internet connection and try again.")
    );
  } finally {
    forcedTool = null;
    setBusy(false);
    ui.input.focus();
  }
}

/* Voice */

function setupVoice() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

  if (!SpeechRecognition) {
    ui.voice.title = "Voice recognition is not supported by this browser";
    return;
  }

  recognition = new SpeechRecognition();
  recognition.lang = "en-IN";
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;

  recognition.onstart = () => {
    ui.voice.classList.add("voice-active");
    ui.voice.innerHTML = "● <span>Listening</span>";
    setStatus("Listening", true);
  };

  recognition.onresult = event => {
    const transcript = event.results?.[0]?.[0]?.transcript || "";
    ui.input.value = transcript;
    autoResizeInput();
    processMessage(transcript);
  };

  recognition.onerror = () => {
    setStatus("Ready");
    ui.voice.classList.remove("voice-active");
    ui.voice.innerHTML = "♩ <span>Voice</span>";
  };

  recognition.onend = () => {
    ui.voice.classList.remove("voice-active");
    ui.voice.innerHTML = "♩ <span>Voice</span>";
    if (!busy) setStatus("Ready");
  };
}

function speak(text) {
  if (!speechEnabled || !("speechSynthesis" in window)) return;

  speechSynthesis.cancel();
  const plain = String(text)
    .replace(/https?:\/\/\S+/g, "link")
    .replace(/[#*_`]/g, "")
    .slice(0, 1800);

  const utterance = new SpeechSynthesisUtterance(plain);
  utterance.lang = "en-IN";
  utterance.rate = 1;
  speechSynthesis.speak(utterance);
}

/* Menus and tools */

function closeMenus() {
  ui.menu.hidden = true;
  ui.toolsMenu.hidden = true;
  ui.menuBtn.setAttribute("aria-expanded", "false");
  ui.toolsBtn.setAttribute("aria-expanded", "false");
}

function toggleMenu(button, menu) {
  const willOpen = menu.hidden;
  closeMenus();
  menu.hidden = !willOpen;
  button.setAttribute("aria-expanded", String(willOpen));
}

function chooseTool(tool) {
  forcedTool = tool;
  closeMenus();

  const prompts = {
    search: "Search the web for: ",
    news: "Get the latest news about ",
    study: "Help me study: ",
    code: "Help me write code for: "
  };

  ui.input.value = prompts[tool] || "";
  autoResizeInput();
  ui.input.focus();
}

function openModal(kind) {
  closeMenus();

  if (kind === "tools") {
    ui.modalTitle.textContent = "Tools";
    ui.modalContent.innerHTML = `
      <div class="setting-row"><div><strong>Web search</strong><p>Find encyclopedia results and links.</p></div><button data-modal-tool="search">Use</button></div>
      <div class="setting-row"><div><strong>Latest news</strong><p>Try retrieving recent news feeds.</p></div><button data-modal-tool="news">Use</button></div>
      <div class="setting-row"><div><strong>Study helper</strong><p>Use AI for lessons and explanations.</p></div><button data-modal-tool="study">Use</button></div>
      <div class="setting-row"><div><strong>Coding helper</strong><p>Ask AI for programming help.</p></div><button data-modal-tool="code">Use</button></div>
    `;
  } else if (kind === "history") {
    ui.modalTitle.textContent = "Chat history";
    ui.modalContent.innerHTML = `
      <div class="setting-row"><div><strong>Saved conversations</strong><p>Your chats are stored locally in this browser.</p></div><button id="historyDone">Done</button></div>
    `;
  } else {
    ui.modalTitle.textContent = "Settings";
    ui.modalContent.innerHTML = `
      <div class="setting-row"><div><strong>Voice replies</strong><p>Read JARVIS answers aloud when supported.</p></div><button id="voiceSetting">${speechEnabled ? "On" : "Off"}</button></div>
      <div class="setting-row"><div><strong>Clear current chat</strong><p>Remove messages from this conversation.</p></div><button id="clearSetting">Clear</button></div>
      <div class="setting-row"><div><strong>About JARVIS</strong><p>AI uses Puter.js. Search and news use external services.</p></div></div>
    `;
  }

  ui.modal.hidden = false;
}

function closeModal() {
  ui.modal.hidden = true;
}

function openSidebarMobile() {
  ui.sidebar.classList.add("mobile-open");
  ui.backdrop.classList.add("visible");
}

function closeSidebarMobile() {
  ui.sidebar.classList.remove("mobile-open");
  ui.backdrop.classList.remove("visible");
}

function autoResizeInput() {
  ui.input.style.height = "auto";
  ui.input.style.height = Math.min(ui.input.scrollHeight, 180) + "px";
}

/* Events */

ui.form.addEventListener("submit", event => {
  event.preventDefault();
  processMessage(ui.input.value);
});

ui.input.addEventListener("input", autoResizeInput);

ui.input.addEventListener("keydown", event => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    ui.form.requestSubmit();
  }
});

ui.newChat.addEventListener("click", newChat);
$("#openSidebar").addEventListener("click", openSidebarMobile);
$("#collapseSidebar").addEventListener("click", closeSidebarMobile);
ui.backdrop.addEventListener("click", closeSidebarMobile);

ui.menuBtn.addEventListener("click", () => toggleMenu(ui.menuBtn, ui.menu));
ui.toolsBtn.addEventListener("click", () => toggleMenu(ui.toolsBtn, ui.toolsMenu));

$("#clearModal")?.addEventListener("click", clearCurrentChat);

$("#settingsBtn").addEventListener("click", () => openModal("settings"));

$("#clearChatBtn")?.addEventListener("click", clearCurrentChat);

$("#closeModal").addEventListener("click", closeModal);
ui.modal.addEventListener("click", event => {
  if (event.target === ui.modal) closeModal();
});

document.addEventListener("click", event => {
  const actionButton = event.target.closest("[data-action]");
  if (actionButton) {
    const action = actionButton.dataset.action;
    if (action === "new") newChat();
    if (action === "clear") clearCurrentChat();
    if (action === "tools") openModal("tools");
    if (action === "history") openModal("history");
    if (action === "settings") openModal("settings");
  }

  const toolButton = event.target.closest("[data-tool]");
  if (toolButton) chooseTool(toolButton.dataset.tool);

  const modalTool = event.target.closest("[data-modal-tool]");
  if (modalTool) {
    const tool = modalTool.dataset.modalTool;
    closeModal();
    chooseTool(tool);
  }

  if (event.target.closest("#historyDone")) closeModal();

  if (event.target.closest("#voiceSetting")) {
    speechEnabled = !speechEnabled;
    openModal("settings");
  }

  if (event.target.closest("#clearSetting")) {
    clearCurrentChat();
    closeModal();
  }

  if (!event.target.closest(".menu-wrap")) closeMenus();
});

document.querySelectorAll("[data-prompt]").forEach(button => {
  button.addEventListener("click", () => {
    ui.input.value = button.dataset.prompt;
    autoResizeInput();
    ui.input.focus();
  });
});

ui.voice.addEventListener("click", () => {
  if (!recognition) {
    addMessage("assistant", "Voice input is not supported in this browser. Try a browser that supports Speech Recognition.");
    return;
  }

  try {
    recognition.start();
  } catch {
    try { recognition.stop(); } catch {}
  }
});

document.addEventListener("keydown", event => {
  if (event.key === "Escape") {
    closeMenus();
    closeModal();
    closeSidebarMobile();
  }
});

/* PWA support */

window.addEventListener("beforeinstallprompt", event => {
  event.preventDefault();
  deferredInstallPrompt = event;
});

if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./service-worker.js").catch(() => {});
  });
}

/* Startup */

loadAll();
setupVoice();
ui.input.focus();
