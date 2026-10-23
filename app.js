
"use strict";

const $ = (selector) => document.querySelector(selector);

const STORAGE_KEY = "jarvis-v2-chats";
const THEME_KEY = "jarvis-v2-theme";
const VOICE_KEY = "jarvis-v2-voice";

let chats = loadChats();
let activeChatId = chats[0]?.id || null;
let busy = false;
let forceWebSearch = false;
let studyMode = false;
let voiceReplies = localStorage.getItem(VOICE_KEY) === "true";
let recognition = null;
let toastTimer = null;

function makeId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function loadChats() {
  try {
    const data = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function saveChats() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(chats));
  } catch {
    showToast("Chat storage full. Export important chats before clearing history.");
  }
}

function currentChat() {
  return chats.find(chat => chat.id === activeChatId);
}

function createChat() {
  const chat = {
    id: makeId(),
    title: "New conversation",
    messages: [],
    createdAt: Date.now()
  };
  chats.unshift(chat);
  activeChatId = chat.id;
  saveChats();
  renderAll();
  closeMenus();
  closeSidebarOnMobile();
  $("#promptInput").focus();
}

function ensureChat() {
  if (!currentChat()) createChat();
  return currentChat();
}

function showToast(message) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 2400);
}

function escapeHTML(value) {
  return String(value).replace(/[&<>"']/g, char => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;",
    '"': "&quot;", "'": "&#39;"
  })[char]);
}

function safeURL(raw) {
  try {
    const url = new URL(raw);
    return ["http:", "https:"].includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}

function renderMarkdown(input) {
  let text = escapeHTML(input);
  const codeBlocks = [];

  text = text.replace(/```([\w-]*)\n?([\s\S]*?)```/g, (_, language, code) => {
    const index = codeBlocks.length;
    codeBlocks.push(`<pre><code>${code.trim()}</code></pre>`);
    return `@@JARVISCODE${index}@@`;
  });

  text = text.replace(/`([^`\n]+)`/g, "<code>$1</code>");
  text = text.replace(/^### (.+)$/gm, "<h3>$1</h3>");
  text = text.replace(/^## (.+)$/gm, "<h2>$1</h2>");
  text = text.replace(/^# (.+)$/gm, "<h1>$1</h1>");
  text = text.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  text = text.replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>");

  text = text.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, (_, label, url) => {
    const safe = safeURL(url);
    return safe ? `<a href="${safe}" target="_blank" rel="noopener noreferrer">${label}</a>` : label;
  });

  text = text.replace(/(^|\n)[ \t]*[-*] (.+)/g, "$1<li>$2</li>");
  text = text.replace(/(?:<li>.*?<\/li>\n?)+/gs, block => `<ul>${block}</ul>`);
  text = text.replace(/\n/g, "<br>");

  return text.replace(/@@JARVISCODE(\d+)@@/g, (_, index) => codeBlocks[Number(index)] || "");
}

function normalizeAIResponse(response) {
  const value = response?.message?.content ?? response?.content ?? response?.text;

  if (typeof value === "string") return value.trim();

  if (Array.isArray(value)) {
    return value.map(part => {
      if (typeof part === "string") return part;
      if (part?.type === "text") return part.text || "";
      return "";
    }).join("\n").trim();
  }

  return "";
}

function addMessage(role, content, extra = {}) {
  const chat = ensureChat();
  const message = {
    id: makeId(),
    role,
    content,
    timestamp: Date.now(),
    ...extra
  };
  chat.messages.push(message);

  if (role === "user" && chat.messages.filter(m => m.role === "user").length === 1) {
    chat.title = content.replace(/\s+/g, " ").slice(0, 42) || "New conversation";
  }

  saveChats();
  renderMessages();
  renderHistory();
  return message;
}

function renderMessages() {
  const chat = currentChat();
  const welcome = $("#welcome");
  const messagesBox = $("#messages");

  if (!chat || chat.messages.length === 0) {
    welcome.classList.remove("hidden");
    messagesBox.classList.add("hidden");
    messagesBox.innerHTML = "";
    return;
  }

  welcome.classList.add("hidden");
  messagesBox.classList.remove("hidden");

  messagesBox.innerHTML = chat.messages.map(message => {
    const isUser = message.role === "user";
    const roleLabel = isUser ? "You" : "JARVIS";
    const avatar = isUser ? "Y" : "J";
    const content = renderMarkdown(message.content || "");

    let actions = "";
    if (!isUser) {
      actions = `<div class="message-actions">
        <button data-action="copy" data-id="${message.id}">Copy</button>
        <button data-action="speak" data-id="${message.id}">Read aloud</button>
      </div>`;
    }

    return `<article class="message ${isUser ? "user" : "assistant"}" data-message-id="${message.id}">
      <div class="message-avatar">${avatar}</div>
      <div class="message-main">
        <div class="message-label">${roleLabel}</div>
        <div class="message-content">${content}</div>
        ${actions}
      </div>
    </article>`;
  }).join("");

  $("#chatArea").scrollTop = $("#chatArea").scrollHeight;
}

function renderHistory() {
  const list = $("#historyList");

  list.innerHTML = chats.map(chat => `
    <div class="history-item ${chat.id === activeChatId ? "active" : ""}">
      <button class="history-open" data-chat-id="${chat.id}" title="${escapeHTML(chat.title)}">
        ${escapeHTML(chat.title)}
      </button>
      <button class="history-delete" data-delete-id="${chat.id}" aria-label="Delete conversation">×</button>
    </div>
  `).join("");
}

function renderAll() {
  renderHistory();
  renderMessages();
}

function switchChat(id) {
  if (!chats.some(chat => chat.id === id)) return;
  activeChatId = id;
  renderAll();
  closeSidebarOnMobile();
}

function deleteChat(id) {
  chats = chats.filter(chat => chat.id !== id);
  if (activeChatId === id) activeChatId = chats[0]?.id || null;
  saveChats();
  renderAll();
}

function clearCurrentChat() {
  const chat = currentChat();
  if (!chat) return;
  chat.messages = [];
  chat.title = "New conversation";
  saveChats();
  renderAll();
  closeMenus();
  showToast("Current conversation cleared.");
}

function clearAllHistory() {
  if (!confirm("Delete all saved conversations? This cannot be undone.")) return;
  chats = [];
  activeChatId = null;
  saveChats();
  createChat();
  showToast("Chat history cleared.");
}

function setTheme(theme) {
  const dark = theme === "dark";
  document.body.classList.toggle("dark-mode", dark);
  localStorage.setItem(THEME_KEY, dark ? "dark" : "light");
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", dark ? "#171816" : "#faf9f6");
  $("#themeLabel").textContent = dark ? "Light mode" : "Dark mode";
  $("#themeToggle").querySelector("span:first-child").textContent = dark ? "☼" : "☾";

  document.querySelectorAll(".theme-option").forEach(button => {
    button.classList.toggle("active", button.dataset.theme === (dark ? "dark" : "light"));
  });
}

function setVoiceReplies(enabled) {
  voiceReplies = enabled;
  localStorage.setItem(VOICE_KEY, String(enabled));
  $("#voiceLabel").textContent = `Voice replies: ${enabled ? "On" : "Off"}`;
  $("#voiceSetting").checked = enabled;
}

function closeMenus() {
  $("#moreMenu").classList.add("hidden");
}

function closeSidebarOnMobile() {
  if (window.matchMedia("(max-width: 760px)").matches) {
    $("#sidebar").classList.remove("open");
  }
}

function setThinking(show, web = false) {
  $("#thinking").classList.toggle("hidden", !show);
  $("#thinkingTitle").textContent = web ? "Searching and analyzing" : "JARVIS is thinking";
  $("#thinkingSub").textContent = web
    ? "Gathering information and preparing an answer"
    : "Working on your request";
  $("#sendBtn").disabled = show;
  $("#promptInput").disabled = show;
  $("#errorBanner").classList.add("hidden");

  if (show) {
    $("#chatArea").scrollTop = $("#chatArea").scrollHeight;
  }
}

function showError(message) {
  const banner = $("#errorBanner");
  banner.textContent = message;
  banner.classList.remove("hidden");
}

function isLikelyCurrentInfo(question) {
  return /\b(latest|today|current|currently|recent|news|weather|price|prices|score|stock|202[5-9]|this week|yesterday|tomorrow|release date|version)\b/i.test(question);
}

function extractSources(text) {
  const matches = text.match(/https?:\/\/[^\s<>"')\]]+/g) || [];
  return [...new Set(matches.map(url => url.replace(/[.,;!?]+$/, "")).filter(Boolean))];
}

function buildSystemPrompt(webEnabled) {
  const webInstructions = webEnabled
    ? `For this request, use the available web_search tool to find relevant and recent information. Analyze the search results before answering. Include direct source links in Markdown when available. Never invent sources or claim to have searched if you did not.`
    : `If the user asks about current information that may have changed, use web search if available. Be transparent when verification is not possible.`;

  return `You are JARVIS, a friendly, capable AI assistant.
${webInstructions}
Answer in the language used by the user unless asked otherwise.
Use clear formatting, practical steps, and examples where helpful.
For schoolwork, explain clearly and accurately.
For coding, provide complete working code when requested.
Distinguish confirmed facts from guesses and acknowledge uncertainty.
Never fabricate web results, citations, or tool usage.`;
}

async function askAI(question, history, useWeb) {
  if (!navigator.onLine) {
    throw new Error("Internet connection nahi hai. Connect karke dobara try karo.");
  }

  if (!window.puter?.ai?.chat) {
    throw new Error("Puter AI load nahi hua. Internet check karke page refresh karo.");
  }

  const messages = [
    { role: "system", content: buildSystemPrompt(useWeb) },
    ...history.slice(-16).map(item => ({
      role: item.role,
      content: item.content
    })),
    { role: "user", content: question }
  ];

  const options = {
    model: "gpt-4o-mini",
    tools: [{ type: "web_search" }]
  };

  let response;

  try {
    response = await puter.ai.chat(messages, options);
  } catch (firstError) {
    // If the requested model/tool combination is not supported,
    // retry without forcing the web tool. Do not pretend web search worked.
    if (!useWeb) throw firstError;

    try {
      response = await puter.ai.chat(messages, { model: "gpt-4o-mini" });
      showToast("Search tool unavailable; AI answered without guaranteed live search.");
    } catch {
      throw firstError;
    }
  }

  const answer = normalizeAIResponse(response);
  if (!answer) throw new Error("AI ne readable answer nahi diya. Dobara try karo.");

  return {
    answer,
    sources: extractSources(answer)
  };
}

function tryLocalCommand(question) {
  const q = question.trim().toLowerCase();

  if (/^(what('?s| is) the )?time(\s+now)?\??$/.test(q) || q === "current time") {
    return `Your device time is **${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}**.`;
  }

  if (/^(what('?s| is) the )?date(\s+today)?\??$/.test(q) || q === "today's date") {
    return `Today's date is **${new Date().toLocaleDateString(undefined, { dateStyle: "full" })}**.`;
  }

  const sites = [
    { pattern: /\b(open|launch|go to)\s+(youtube|yt)\b/, url: "https://www.youtube.com/" },
    { pattern: /\b(open|launch|go to)\s+google\b/, url: "https://www.google.com/" },
    { pattern: /\b(open|launch|go to)\s+github\b/, url: "https://github.com/" },
    { pattern: /\b(open|launch|go to)\s+chatgpt\b/, url: "https://chatgpt.com/" }
  ];

  for (const site of sites) {
    if (site.pattern.test(q)) {
      window.open(site.url, "_blank", "noopener,noreferrer");
      return `Opening [${site.url}](${site.url}) in a new tab.`;
    }
  }

  return null;
}

async function processMessage() {
  if (busy) return;

  const input = $("#promptInput");
  const question = input.value.trim();
  if (!question) return;

  const localAnswer = tryLocalCommand(question);

  if (localAnswer !== null) {
    input.value = "";
    autoResizeInput();
    addMessage("user", question);
    addMessage("assistant", localAnswer);
    return;
  }

  const chat = ensureChat();
  const priorHistory = chat.messages.map(message => ({
    role: message.role,
    content: message.content
  }));

  input.value = "";
  autoResizeInput();
  addMessage("user", question);

  busy = true;
  const useWeb = forceWebSearch || isLikelyCurrentInfo(question);
  const wasStudyMode = studyMode;

  setThinking(true, useWeb);
  forceWebSearch = false;
  studyMode = false;
  $("#webMode").classList.remove("selected");
  $("#attachMode").classList.remove("selected");

  let prompt = question;
  if (wasStudyMode) {
    prompt = `Help me learn this step by step in a student-friendly way: ${question}`;
  }

  try {
    const result = await askAI(prompt, priorHistory, useWeb);
    addMessage("assistant", result.answer, { sources: result.sources });
    if (voiceReplies) speakText(result.answer);
  } catch (error) {
    console.error("JARVIS request failed:", error);
    const reason = error?.message || "Unknown error";
    showError(`JARVIS could not complete this request. ${reason} Check your connection or try again later.`);
  } finally {
    busy = false;
    setThinking(false);
    input.disabled = false;
    $("#sendBtn").disabled = false;
    input.focus();
  }
}

function autoResizeInput() {
  const input = $("#promptInput");
  input.style.height = "auto";
  input.style.height = Math.min(input.scrollHeight, 180) + "px";
}

function speakText(text) {
  if (!("speechSynthesis" in window)) {
    showToast("Voice replies are not supported by this browser.");
    return;
  }

  window.speechSynthesis.cancel();
  const cleanText = text
    .replace(/```[\s\S]*?```/g, "Code block omitted.")
    .replace(/https?:\/\/\S+/g, "link")
    .replace(/[#*_`>\[\]()]/g, " ")
    .slice(0, 6000);

  const utterance = new SpeechSynthesisUtterance(cleanText);
  utterance.lang = navigator.language || "en-US";
  window.speechSynthesis.speak(utterance);
}

function startVoiceInput() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

  if (!SpeechRecognition) {
    showToast("Voice input is not supported in this browser. Try Chrome.");
    return;
  }

  if (recognition) {
    recognition.stop();
    recognition = null;
    $("#micBtn").classList.remove("selected");
    return;
  }

  recognition = new SpeechRecognition();
  recognition.lang = navigator.language || "en-US";
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;

  recognition.onstart = () => {
    $("#micBtn").classList.add("selected");
    showToast("Listening… Speak now.");
  };

  recognition.onresult = event => {
    $("#promptInput").value = event.results[0][0].transcript;
    autoResizeInput();
    $("#promptInput").focus();
  };

  recognition.onerror = event => {
    showToast(`Voice input error: ${event.error}`);
  };

  recognition.onend = () => {
    $("#micBtn").classList.remove("selected");
    recognition = null;
  };

  try {
    recognition.start();
  } catch {
    showToast("Could not start voice input. Try again.");
    recognition = null;
  }
}

function exportCurrentChat() {
  const chat = currentChat();
  if (!chat || !chat.messages.length) {
    showToast("There is no conversation to export.");
    return;
  }

  const content = [
    `# ${chat.title}`,
    "",
    ...chat.messages.flatMap(message => [
      `## ${message.role === "user" ? "You" : "JARVIS"}`,
      "",
      message.content,
      ""
    ])
  ].join("\n");

  const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${chat.title.replace(/[^a-z0-9-_]/gi, "_").slice(0, 35) || "jarvis-chat"}.md`;
  link.click();
  URL.revokeObjectURL(url);
  closeMenus();
}

function copyText(text) {
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(text)
      .then(() => showToast("Copied to clipboard."))
      .catch(() => fallbackCopy(text));
  } else {
    fallbackCopy(text);
  }
}

function fallbackCopy(text) {
  const area = document.createElement("textarea");
  area.value = text;
  document.body.appendChild(area);
  area.select();
  try {
    document.execCommand("copy");
    showToast("Copied to clipboard.");
  } catch {
    showToast("Copy failed. Please select the text manually.");
  }
  area.remove();
}

function openSettings() {
  $("#modalBackdrop").classList.remove("hidden");
  $("#voiceSetting").checked = voiceReplies;
  document.querySelectorAll(".theme-option").forEach(button => {
    button.classList.toggle("active", button.dataset.theme === (document.body.classList.contains("dark-mode") ? "dark" : "light"));
  });
}

function closeSettings() {
  $("#modalBackdrop").classList.add("hidden");
}

function updateConnectionStatus() {
  const online = navigator.onLine;
  $("#connectionStatus").textContent = online ? "Internet connection available" : "You're offline";
  $(".status-dot").style.background = online ? "#6fa887" : "#d66b5e";
}

$("#newChat").addEventListener("click", createChat);
$("#openSidebar").addEventListener("click", () => $("#sidebar").classList.add("open"));
$("#closeSidebar").addEventListener("click", closeSidebarOnMobile);
$("#moreBtn").addEventListener("click", () => $("#moreMenu").classList.toggle("hidden"));
$("#themeToggle").addEventListener("click", () => {
  setTheme(document.body.classList.contains("dark-mode") ? "light" : "dark");
  closeMenus();
});
$("#voiceToggle").addEventListener("click", () => {
  setVoiceReplies(!voiceReplies);
  closeMenus();
  showToast(`Voice replies ${voiceReplies ? "enabled" : "disabled"}.`);
});
$("#exportChat").addEventListener("click", exportCurrentChat);
$("#clearCurrent").addEventListener("click", clearCurrentChat);
$("#clearHistory").addEventListener("click", clearAllHistory);
$("#settingsBtn").addEventListener("click", openSettings);
$("#closeModal").addEventListener("click", closeSettings);
$("#doneSettings").addEventListener("click", closeSettings);
$("#modalBackdrop").addEventListener("click", event => {
  if (event.target === $("#modalBackdrop")) closeSettings();
});

document.querySelectorAll(".theme-option").forEach(button => {
  button.addEventListener("click", () => setTheme(button.dataset.theme));
});

$("#voiceSetting").addEventListener("change", event => setVoiceReplies(event.target.checked));

$("#webMode").addEventListener("click", () => {
  forceWebSearch = !forceWebSearch;
  $("#webMode").classList.toggle("selected", forceWebSearch);
  showToast(forceWebSearch ? "Web search preferred for your next message." : "Automatic search mode enabled.");
});

$("#attachMode").addEventListener("click", () => {
  studyMode = !studyMode;
  $("#attachMode").classList.toggle("selected", studyMode);
  showToast(studyMode ? "Study assistant enabled for your next message." : "Study mode disabled.");
});

$("#studyNav").addEventListener("click", () => {
  studyMode = true;
  $("#attachMode").classList.add("selected");
  $("#promptInput").placeholder = "What would you like to learn?";
  closeSidebarOnMobile();
  $("#promptInput").focus();
});

$("#searchNav").addEventListener("click", () => {
  forceWebSearch = true;
  $("#webMode").classList.add("selected");
  $("#promptInput").placeholder = "What should JARVIS search for?";
  closeSidebarOnMobile();
  $("#promptInput").focus();
});

$("#chatsNav").addEventListener("click", () => {
  closeSidebarOnMobile();
  $("#promptInput").placeholder = "Message JARVIS...";
});

$("#sendBtn").addEventListener("click", processMessage);
$("#micBtn").addEventListener("click", startVoiceInput);

$("#promptInput").addEventListener("input", autoResizeInput);
$("#promptInput").addEventListener("keydown", event => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    processMessage();
  }
});

$("#historyList").addEventListener("click", event => {
  const deleteButton = event.target.closest("[data-delete-id]");
  if (deleteButton) {
    event.stopPropagation();
    deleteChat(deleteButton.dataset.deleteId);
    return;
  }

  const openButton = event.target.closest("[data-chat-id]");
  if (openButton) switchChat(openButton.dataset.chatId);
});

$("#messages").addEventListener("click", event => {
  const button = event.target.closest("[data-action]");
  if (!button) return;

  const chat = currentChat();
  const message = chat?.messages.find(item => item.id === button.dataset.id);
  if (!message) return;

  if (button.dataset.action === "copy") copyText(message.content);
  if (button.dataset.action === "speak") speakText(message.content);
});

document.querySelectorAll("[data-prompt]").forEach(button => {
  button.addEventListener("click", () => {
    $("#promptInput").value = button.dataset.prompt;
    autoResizeInput();
    $("#promptInput").focus();
  });
});

document.addEventListener("click", event => {
  if (!event.target.closest(".dropdown-wrap")) closeMenus();
});

document.addEventListener("keydown", event => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
    event.preventDefault();
    createChat();
  }
  if (event.key === "Escape") {
    closeSettings();
    closeMenus();
    closeSidebarOnMobile();
  }
});

window.addEventListener("online", updateConnectionStatus);
window.addEventListener("offline", updateConnectionStatus);

setTheme(localStorage.getItem(THEME_KEY) || "light");
setVoiceReplies(voiceReplies);
updateConnectionStatus();

if (!chats.length) {
  createChat();
} else {
  if (!activeChatId || !chats.some(chat => chat.id === activeChatId)) {
    activeChatId = chats[0].id;
  }
  renderAll();
}
