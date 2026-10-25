
"use strict";

const $ = (selector) => document.querySelector(selector);

const STORAGE_KEY = "jarvis-v2-chats";
const THEME_KEY = "jarvis-v2-theme";
const VOICE_KEY = "jarvis-v2-voice";
const INTERNET_KEY = "jarvis-v2-internet-first";

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
    const lang = (language || "").toLowerCase();
    codeBlocks.push(`<div class="code-block"><div class="code-head"><span>${escapeHTML(lang || "code")}</span><span><button data-action="copycode">Copy code</button>${lang === "html" ? '<button data-action="preview">Preview</button>' : ""}</span></div><pre><code>${code.trim()}</code></pre></div>`);
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

  text = text.replace(/(^|\n)((?:<strong>)?Sources?:(?:<\/strong>)?[^\n]*)/g, '$1<div class="srcs">$2</div>');
  text = text.replace(/(^|\n)[ \t]*[-*] (.+)/g, "$1<li>$2</li>");
  text = text.replace(/(?:<li>.*?<\/li>\n?)+/gs, block => `<ul>${block.replace(/\n/g, "")}</ul>`);
  text = text.replace(/\n+(<div class="srcs">)/g, "$1");
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

  const lastAssistant = [...chat.messages].reverse().find(m => m.role === "assistant");
  const lastUser = [...chat.messages].reverse().find(m => m.role === "user");

  messagesBox.innerHTML = chat.messages.map(message => {
    const isUser = message.role === "user";
    const roleLabel = isUser ? "You" : "JARVIS";
    const avatar = isUser ? "Y" : "J";
    const content = renderMarkdown(message.content || "");
    const time = message.timestamp ? new Date(message.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "";
    const badge = message.src ? `<span class="src-badge">${message.src === "local" ? "On your device" : message.src === "net" ? "Internet" : message.src === "mix" ? "Internet + AI" : "AI"}</span>` : "";

    let actions = "";
    if (!isUser) {
      actions = `<div class="message-actions">
        <button data-action="copy" data-id="${message.id}">Copy</button>
        <button data-action="speak" data-id="${message.id}">Read aloud</button>
        ${message === lastAssistant && !busy ? `<button data-action="regen" data-id="${message.id}">Regenerate</button>` : ""}
      </div>`;
    } else if (message === lastUser && !busy) {
      actions = `<div class="message-actions"><button data-action="edit" data-id="${message.id}">Edit</button></div>`;
    }

    return `<article class="message ${isUser ? "user" : "assistant"}" data-message-id="${message.id}">
      <div class="message-avatar">${avatar}</div>
      <div class="message-main">
        <div class="message-label">${roleLabel}${badge}<time>${time}</time></div>
        <div class="message-content">${content}</div>
        ${actions}
      </div>
    </article>`;
  }).join("");

  decorateSources(messagesBox);

  $("#chatArea").scrollTop = $("#chatArea").scrollHeight;
}

function renderHistory() {
  const list = $("#historyList");

  const query = ($("#historySearch")?.value || "").toLowerCase();
  list.innerHTML = chats.filter(chat => !query || String(chat.title).toLowerCase().includes(query)).map(chat => `
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
  return /\b(latest|today|tonight|now|current|currently|recent|recently|news|weather|price|prices|rate|score|stock|202[5-9]|this week|this year|yesterday|tomorrow|release|released|launch|launched|version|update|updated|new|newest|president|prime minister|pm|chief minister|cm|minister|ceo|captain|coach|champion|winner|won|result|results|ranking|richest|population|trending|live|aaj|abhi|taaza|naya|nayi|khabar)\b/i.test(question);
}

function extractSources(text) {
  const matches = text.match(/https?:\/\/[^\s<>"')\]]+/g) || [];
  return [...new Set(matches.map(url => url.replace(/[.,;!?]+$/, "")).filter(Boolean))];
}

function buildSystemPrompt(webEnabled) {
  const webInstructions = webEnabled
    ? `For this request, use the available web_search tool to find relevant and recent information. Analyze the search results before answering. Include direct source links in Markdown when available, and finish with one line that starts with "Sources:" followed by the links you used. Never invent sources or claim to have searched if you did not.`
    : `If the user asks about current information that may have changed, use web search if available. Be transparent when verification is not possible.`;

  return `You are JARVIS, a friendly, capable AI assistant.
Today's date is ${new Date().toLocaleDateString("en-GB", { dateStyle: "full" })}. Your built-in knowledge has a cutoff and may be outdated, so for anything that can change (office holders, news, prices, sports, versions, events) rely on web search results or the supplied sources, not memory, and say when you could not verify something.
${webInstructions}
Answer in the language used by the user unless asked otherwise.
Use clear formatting, practical steps, and examples where helpful.
For schoolwork, explain clearly and accurately.
For coding, provide complete working code when requested.
Distinguish confirmed facts from guesses and acknowledge uncertainty.
Never fabricate web results, citations, or tool usage.`;
}

/* ===== Internet-first engine: free public services first, AI only when needed ===== */
async function fetchJSON(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error("HTTP " + response.status);
  return response.json();
}

const WEATHER_CODES = { 0: "Clear sky", 1: "Mostly clear", 2: "Partly cloudy", 3: "Overcast", 45: "Fog", 48: "Fog", 51: "Light drizzle", 53: "Drizzle", 55: "Heavy drizzle", 61: "Light rain", 63: "Rain", 65: "Heavy rain", 71: "Light snow", 73: "Snow", 75: "Heavy snow", 80: "Rain showers", 81: "Rain showers", 82: "Heavy showers", 95: "Thunderstorm", 96: "Thunderstorm with hail", 99: "Thunderstorm with hail" };

function calcAnswer(text) {
  let e = text.toLowerCase()
    .replace(/(\d+(?:\.\d+)?)\s*%\s*of\s*(\d+(?:\.\d+)?)/g, "($1/100*$2)")
    .replace(/\^/g, "**").replace(/[x\u00d7]/g, "*").replace(/\u00f7/g, "/").replace(/,/g, "");
  e = e.replace(/^(what is|what's|calculate|solve|compute|kitna hota hai)\s+/, "").replace(/[=?]+$/, "").trim();
  if (!/^[\d+\-*/().%\s]+$/.test(e) || !/\d/.test(e) || !/[+\-*/%]/.test(e)) return null;
  try {
    const value = Function('"use strict";return (' + e + ")")();
    return typeof value === "number" && isFinite(value) ? Math.round(value * 1e10) / 1e10 : null;
  } catch { return null; }
}

async function weatherAnswer(text) {
  if (!/(weather|mausam|temperature|barish)/i.test(text)) return null;
  const clean = text.replace(/[?!.]+$/, "");
  let city = (/\b(?:in|at|of|for)\s+([a-z\s.-]{2,40})$/i.exec(clean) || /([a-z\s.-]{2,40})\s+(?:ka|ki|me|mein)\s+(?:mausam|weather|temperature)/i.exec(clean) || [])[1];
  if (!city) return null;
  city = city.replace(/\b(today|now|right now|aaj|abhi)\b/ig, "").trim();
  const geo = await fetchJSON("https://geocoding-api.open-meteo.com/v1/search?count=1&name=" + encodeURIComponent(city));
  const place = geo.results && geo.results[0];
  if (!place) return null;
  const w = await fetchJSON("https://api.open-meteo.com/v1/forecast?latitude=" + place.latitude + "&longitude=" + place.longitude + "&current=temperature_2m,relative_humidity_2m,wind_speed_10m,weather_code&daily=temperature_2m_max,temperature_2m_min&timezone=auto&forecast_days=1");
  const now = w.current, day = w.daily;
  return { text: "**Weather in " + place.name + (place.country ? ", " + place.country : "") + "**\n\n- Now: " + now.temperature_2m + "\u00b0C, " + (WEATHER_CODES[now.weather_code] || "") + "\n- Humidity: " + now.relative_humidity_2m + "%\n- Wind: " + now.wind_speed_10m + " km/h\n- Today: " + day.temperature_2m_min[0] + "\u00b0C to " + day.temperature_2m_max[0] + "\u00b0C\n\nSources: [Open-Meteo](https://open-meteo.com)" };
}

async function currencyAnswer(text) {
  const m = /(\d+(?:\.\d+)?)\s*([a-z]{3})\s*(?:to|in|into)\s*([a-z]{3})\b/i.exec(text);
  if (!m) return null;
  const amount = +m[1], from = m[2].toUpperCase(), to = m[3].toUpperCase();
  const data = await fetchJSON("https://open.er-api.com/v6/latest/" + from);
  const rate = data.rates && data.rates[to];
  if (!rate) return null;
  return { text: "**" + amount + " " + from + " = " + (amount * rate).toFixed(2) + " " + to + "**\n\nRate: 1 " + from + " = " + rate + " " + to + "\n\nSources: [ExchangeRate-API](https://www.exchangerate-api.com)" };
}

async function dictionaryAnswer(text) {
  const t = text.trim();
  const m = /^(?:meaning of|define|definition of)\s+([a-z'-]+)\??$/i.exec(t) || /^what does ([a-z'-]+) mean\??$/i.exec(t) || /^([a-z'-]+)\s+(?:ka\s+)?meaning\??$/i.exec(t);
  if (!m) return null;
  const data = await fetchJSON("https://api.dictionaryapi.dev/api/v2/entries/en/" + encodeURIComponent(m[1]));
  const entry = data && data[0];
  if (!entry) return null;
  return { text: "**" + entry.word + "**" + (entry.phonetic ? " " + entry.phonetic : "") + "\n\n" + entry.meanings.slice(0, 3).map(x => "- *" + x.partOfSpeech + "*: " + ((x.definitions[0] || {}).definition || "")).join("\n") + "\n\nSources: [dictionaryapi.dev](https://dictionaryapi.dev)" };
}

async function wikiSources(text, hindi) {
  const topic = text.replace(/[?!.]+$/, "").replace(/^(who is|who was|what is|what are|tell me about|explain|about)\s+/i, "").replace(/\s+(kaun hai|kaun tha|kya hai|kya hota hai)$/i, "").trim();
  if (!topic || topic.length > 80) return [];
  const base = hindi ? "https://hi.wikipedia.org" : "https://en.wikipedia.org";
  const found = await fetchJSON(base + "/w/api.php?action=query&list=search&format=json&origin=*&srlimit=3&srsearch=" + encodeURIComponent(topic));
  const hits = ((found.query && found.query.search) || []).slice(0, 3);
  const pages = await Promise.all(hits.map(hit =>
    fetchJSON(base + "/api/rest_v1/page/summary/" + encodeURIComponent(hit.title.replace(/ /g, "_")))
      .then(p => p.extract ? { title: p.title, extract: p.extract.slice(0, 700), url: (p.content_urls && p.content_urls.desktop && p.content_urls.desktop.page) || base + "/wiki/" + encodeURIComponent(hit.title) } : null)
      .catch(() => null)));
  return pages.filter(Boolean);
}

async function netAnswer(text, skipWiki = false) {
  const t = text.trim();
  if (!t || t.length > 200) return null;
  const calc = calcAnswer(t);
  if (calc !== null) return { text: "**" + calc + "**\n\n(calculated on your device)", local: true };
  for (const fn of [weatherAnswer, currencyAnswer, dictionaryAnswer]) {
    try { const result = await fn(t); if (result) return result; } catch { /* try the next source */ }
  }
  const u = t.replace(/[?!.\s]+$/, "");
  const info = /^(who is|who was|what is|what are|tell me about|about)\s+\S/i.test(u) || /\s(kaun hai|kaun tha|kya hai|kya hota hai)$/i.test(u);
  const why = /\b(why|how|explain|compare|difference|vs|kaise|kyun|kyon|samjha\w*|summari[sz]e)\b/i.test(u);
  const aboutMe = /\b(you|your|yours|jarvis|my|mera|meri|tum|tumhara|aap)\b/i.test(u);
  if (!skipWiki && (info || why) && !aboutMe && (why || u.split(/\s+/).length <= 8)) {
    try {
      const pages = await wikiSources(u, /[\u0900-\u097F]/.test(u));
      if (pages.length) {
        const context = pages.map((p, i) => "[" + (i + 1) + "] " + p.title + " - " + p.url + "\n" + p.extract).join("\n\n");
        const fallback = "**" + pages[0].title + "**\n\n" + pages[0].extract + "\n\nSources: " + pages.map((p, i) => "[" + (i + 1) + " " + p.title + "](" + p.url + ")").join(" ");
        return { context, fallback: why ? null : fallback };
      }
    } catch { /* fall back to AI */ }
  }
  return null;
}

const AI_MODEL = "openai/gpt-5.6-luna";

/* ===== Internet-first policy: nearly every question is answered from the web ===== */
function internetFirstOn() {
  return localStorage.getItem(INTERNET_KEY) !== "false";
}

/* Only these stay AI-only: greetings, creative/code writing, translation and rewriting. */
function wantsInternet(question) {
  const t = question.trim().toLowerCase();
  if (t.length < 3) return false;
  if (t.split(/\s+/).length <= 5 && /^(hi+|hello|hey|yo|thanks?|thank you|ok(ay)?|bye|good (morning|night|evening|afternoon)|namaste|how are you|kaise ho|shukriya|dhanyavad)\b/.test(t)) return false;
  if (/\b(write|create|make|generate|build|draft|compose|code)\b.*\b(poem|story|essay|letter|email|song|joke|caption|code|program|script|function|website|webpage|html|css|app|game|bio|speech)\b/.test(t)) return false;
  if (/\b(translate|rewrite|paraphrase|proofread|fix (my )?grammar|improve this)\b/.test(t)) return false;
  return true;
}

function topicFrom(question) {
  return question.replace(/[?!.]+$/, "")
    .replace(/\b(please|current|currently|latest|now|today|right now|who is the|who is|who was|what is the|what is|what are|tell me about|explain|kaun hai|kaun tha|kya hai|kya hota hai)\b/gi, " ")
    .replace(/\s+/g, " ").trim();
}

function internetStats() {
  const answers = chats.flatMap(chat => chat.messages).filter(m => m.role === "assistant" && m.src);
  if (!answers.length) return "No answers yet. Ask a few questions to see how much JARVIS used the internet.";
  const net = answers.filter(m => m.src === "net").length;
  const mix = answers.filter(m => m.src === "mix").length;
  const ai = answers.filter(m => m.src === "ai").length;
  const local = answers.filter(m => m.src === "local").length;
  return `${Math.round((net + mix) / answers.length * 100)}% of your answers used the internet (${net} internet only, ${mix} internet + AI, ${ai} AI only, ${local} calculated on your device).`;
}

async function askAI(question, history, useWeb, opts = {}) {
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
    model: AI_MODEL,
    tools: [{ type: "web_search" }]
  };

  let response;
  let searched = useWeb;

  try {
    if (!useWeb && typeof opts.onText === "function") {
      const stream = await puter.ai.chat(messages, { model: AI_MODEL, stream: true });
      if (stream && stream[Symbol.asyncIterator]) {
        let acc = "";
        for await (const part of stream) {
          if (part && part.type === "error") throw new Error(part.message || "The AI stream failed.");
          if (part && part.text) { acc += part.text; opts.onText(acc); }
        }
        response = { message: { content: acc } };
      } else {
        response = stream;
      }
    } else {
      response = await puter.ai.chat(messages, options);
    }
  } catch (firstError) {
    // If the requested model/tool combination is not supported,
    // retry without forcing the web tool. Do not pretend web search worked.
    try {
      response = await puter.ai.chat(messages, {});
      searched = false;
      if (useWeb) showToast("Live search was unavailable, so this answer may be out of date.");
    } catch {
      throw firstError;
    }
  }

  const answer = normalizeAIResponse(response);
  if (!answer) throw new Error("AI ne readable answer nahi diya. Dobara try karo.");

  const note = useWeb && !searched ? "\n\n*Live web search was unavailable, so this answer may be out of date.*" : "";

  return {
    answer: answer + note,
    sources: extractSources(answer),
    searched
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

function removeLastExchange() {
  const chat = currentChat();
  if (!chat) return null;
  while (chat.messages.length && chat.messages[chat.messages.length - 1].role === "assistant") chat.messages.pop();
  const lastUser = chat.messages.pop();
  saveChats();
  renderAll();
  return lastUser || null;
}

function regenerateLast() {
  if (busy) return;
  const lastUser = removeLastExchange();
  if (!lastUser) return;
  $("#promptInput").value = lastUser.content;
  processMessage();
}

function editLast() {
  if (busy) return;
  const lastUser = removeLastExchange();
  if (!lastUser) return;
  const input = $("#promptInput");
  input.value = lastUser.content;
  autoResizeInput();
  input.focus();
}

function openPreview(html) {
  $("#previewFrame").srcdoc = html;
  $("#previewModal").classList.remove("hidden");
}

function closePreview() {
  $("#previewModal").classList.add("hidden");
  $("#previewFrame").srcdoc = "";
}

function decorateSources(root) {
  root.querySelectorAll(".srcs a").forEach(link => {
    if (link.querySelector("img")) return;
    let host;
    try { host = new URL(link.href).hostname; } catch { return; }

    const logo = document.createElement("img");
    logo.className = "src-logo";
    logo.alt = "";
    logo.width = 16;
    logo.height = 16;
    logo.loading = "lazy";
    logo.referrerPolicy = "no-referrer";

    let attempt = 0;
    logo.addEventListener("error", () => {
      attempt += 1;
      if (attempt === 1) logo.src = "https://www.google.com/s2/favicons?domain=" + encodeURIComponent(host) + "&sz=64";
      else logo.remove();
    });

    logo.src = "https://" + host + "/favicon.ico";
    link.prepend(logo);
  });
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
  const forcedWeb = forceWebSearch;
  const internetOn = internetFirstOn() && wantsInternet(question);
  const useWeb = forceWebSearch || isLikelyCurrentInfo(question) || internetOn;
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

  let live = null;
  let hit = null;
  let pages = [];
  let links = [];
  let context = "";
  let fallbackText = null;

  try {
    if (!wasStudyMode && !forcedWeb) {
      try { hit = await netAnswer(question, internetOn || isLikelyCurrentInfo(question)); } catch { hit = null; }
    }

    if (hit && hit.text) {
      addMessage("assistant", hit.text, { src: hit.local ? "local" : "net" });
      if (voiceReplies) speakText(hit.text);
      return;
    }

    context = (hit && hit.context) || "";
    fallbackText = (hit && hit.fallback) || null;

    if (internetOn && !context) {
      try { pages = await wikiSources(topicFrom(question), /[\u0900-\u097F]/.test(question)); } catch { pages = []; }
      if (pages.length) {
        links = pages.map((p, i) => "[" + (i + 1) + " " + p.title + "](" + p.url + ")");
        context = pages.map((p, i) => "[" + (i + 1) + "] " + p.title + " - " + p.url + "\n" + p.extract).join("\n\n");
        fallbackText = "**" + pages[0].title + "**\n\n" + pages[0].extract + "\n\nSources: " + links.join(" ");
      }
    }

    let aiPrompt = prompt;
    if (context) {
      aiPrompt = "Write a clear, well-organised final answer to the QUESTION. Base it on the numbered internet sources below and on live web search results when you have that tool. Stay accurate and do not invent facts. Cite inline like [1], and finish with one line that starts with 'Sources:' followed by markdown links, for example [1 Title](url) [2 Title](url). If the sources are not relevant, rely on web search instead.\n\nSOURCES:\n" + context + "\n\nQUESTION: " + question;
    }

    const srcTag = context || useWeb ? "mix" : "ai";
    let finalSrc = srcTag;
    const onText = text => {
      if (!live) {
        $("#thinking").classList.add("hidden");
        live = addMessage("assistant", text, { src: srcTag });
      } else {
        live.content = text;
        const el = document.querySelector(`[data-message-id="${live.id}"] .message-content`);
        if (el) {
          el.innerHTML = renderMarkdown(text);
          decorateSources(el);
          $("#chatArea").scrollTop = $("#chatArea").scrollHeight;
        }
      }
    };

    const result = await askAI(aiPrompt, priorHistory, useWeb, { onText });

    if (links.length && !/sources?:/i.test(result.answer)) result.answer += "\n\nSources: " + links.join(" ");
    if (useWeb && !context && !result.searched) finalSrc = "ai";

    if (live) {
      live.content = result.answer;
      live.sources = result.sources;
      live.src = finalSrc;
      saveChats();
    } else {
      addMessage("assistant", result.answer, { sources: result.sources, src: finalSrc });
    }
    if (voiceReplies) speakText(result.answer);
  } catch (error) {
    console.error("JARVIS request failed:", error);
    const chatNow = currentChat();
    if (live && chatNow) {
      chatNow.messages = chatNow.messages.filter(m => m !== live);
      saveChats();
    }
    if (fallbackText) {
      addMessage("assistant", fallbackText, { src: "net" });
      showToast("AI was unavailable, so JARVIS showed the Wikipedia sources directly.");
      return;
    }
    const reason = error?.message || "Unknown error";
    showError(`JARVIS could not complete this request. ${reason} Check your connection or try again later.`);
  } finally {
    busy = false;
    setThinking(false);
    renderMessages();
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
  $("#internetSetting").checked = internetFirstOn();
  $("#netStats").textContent = internetStats();
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
$("#internetSetting").addEventListener("change", event => {
  localStorage.setItem(INTERNET_KEY, event.target.checked ? "true" : "false");
  showToast(event.target.checked ? "Internet-first mode on." : "Internet-first mode off.");
});

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

  const action = button.dataset.action;
  const block = button.closest(".code-block");

  if (action === "copycode" && block) { copyText(block.querySelector("code").textContent); return; }
  if (action === "preview" && block) { openPreview(block.querySelector("code").textContent); return; }
  if (action === "regen") { regenerateLast(); return; }
  if (action === "edit") { editLast(); return; }

  const chat = currentChat();
  const message = chat?.messages.find(item => item.id === button.dataset.id);
  if (!message) return;

  if (action === "copy") copyText(message.content);
  if (action === "speak") speakText(message.content);
});

$("#historySearch").addEventListener("input", renderHistory);
$("#closePreview").addEventListener("click", closePreview);
$("#previewModal").addEventListener("click", event => { if (event.target.id === "previewModal") closePreview(); });

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
    closePreview();
    closeMenus();
    closeSidebarOnMobile();
  }
});

window.addEventListener("online", updateConnectionStatus);
window.addEventListener("offline", updateConnectionStatus);

if ("serviceWorker" in navigator && location.protocol !== "file:") {
  navigator.serviceWorker.register("service-worker.js").catch(() => {});
}

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
