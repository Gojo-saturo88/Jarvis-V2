
"use strict";

/* ==========================================
   JARVIS 2.0 — Main Application
   AI: Puter.js | Storage: Local browser
========================================== */

const $ = (selector) => document.querySelector(selector);

const elements = {
  status: $("#systemStatus"),
  install: $("#installBtn"),
  clock: $("#clock"),
  aiMode: $("#aiMode"),
  messages: $("#chatMessages"),
  form: $("#chatForm"),
  input: $("#chatInput"),
  voice: $("#voiceBtn"),
  send: $("#sendBtn"),
  clear: $("#clearChatBtn")
};

const STORAGE_KEY = "jarvis2_chat_history_v1";
const MAX_HISTORY = 60;

let chatHistory = [];
let busy = false;
let deferredInstallPrompt = null;
let recognition = null;
let isListening = false;
let speechEnabled = true;

const welcomeMessage =
  "Hello! I am JARVIS 2.0, your personal AI assistant. " +
  "Ask me a question, request study help, or try a command below.";

function setStatus(message) {
  if (elements.status) {
    elements.status.textContent = message;
  }
}

function updateClock() {
  if (!elements.clock) return;

  elements.clock.textContent = new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true
  }).format(new Date());
}

function escapeHTML(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[char]);
}

/* Keep chat messages as plain text for safety. */

function renderMessage(role, content, save = true) {
  if (!elements.messages) return;

  const message = document.createElement("div");
  message.className = `message ${role === "user" ? "user" : "assistant"}`;

  const name = document.createElement("div");
  name.className = "message-name";
  name.textContent = role === "user" ? "YOU" : "JARVIS";

  const bubble = document.createElement("div");
  bubble.className = "message-bubble";
  bubble.textContent = content;

  message.append(name, bubble);
  elements.messages.appendChild(message);
  elements.messages.scrollTop = elements.messages.scrollHeight;

  if (save) {
    chatHistory.push({
      role,
      content: String(content).slice(0, 12000),
      time: Date.now()
    });

    if (chatHistory.length > MAX_HISTORY) {
      chatHistory = chatHistory.slice(-MAX_HISTORY);
    }

    saveHistory();
  }

  return message;
}

function saveHistory() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(chatHistory));
  } catch (error) {
    console.warn("Chat history could not be saved.", error);
  }
}

function loadHistory() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");

    if (Array.isArray(saved)) {
      chatHistory = saved
        .filter(item =>
          item &&
          ["user", "assistant"].includes(item.role) &&
          typeof item.content === "string"
        )
        .slice(-MAX_HISTORY);
    }
  } catch {
    chatHistory = [];
  }

  if (chatHistory.length) {
    chatHistory.forEach(item => {
      renderMessage(item.role, item.content, false);
    });
  } else {
    renderMessage("assistant", welcomeMessage);
  }
}

function clearTypingIndicator() {
  const typing = $("#jarvisTyping");
  if (typing) typing.remove();
}

function showTypingIndicator() {
  clearTypingIndicator();

  if (!elements.messages) return;

  const message = document.createElement("div");
  message.id = "jarvisTyping";
  message.className = "message assistant";

  const name = document.createElement("div");
  name.className = "message-name";
  name.textContent = "JARVIS";

  const bubble = document.createElement("div");
  bubble.className = "message-bubble typing-indicator";
  bubble.setAttribute("aria-label", "JARVIS is thinking");

  for (let i = 0; i < 3; i++) {
    bubble.appendChild(document.createElement("span"));
  }

  message.append(name, bubble);
  elements.messages.appendChild(message);
  elements.messages.scrollTop = elements.messages.scrollHeight;
}

function setBusy(value) {
  busy = value;

  if (elements.send) elements.send.disabled = value;
  if (elements.input) elements.input.disabled = value;

  if (elements.aiMode) {
    elements.aiMode.textContent = value ? "PROCESSING" : "AI READY";
  }
}

/* ==========================================
   Local commands — no AI request needed
========================================== */

function getLocalCommand(text) {
  const command = text.toLowerCase().trim();

  if (/^(hi|hello|hey|namaste|namaskar|good morning|good evening)[!. ]*$/.test(command)) {
    return "Hello! How can I help you today?";
  }

  if (/^(who are you|what are you|introduce yourself)[?.! ]*$/.test(command)) {
    return "I am JARVIS 2.0, a browser-based personal assistant with AI chat, voice features and quick commands.";
  }

  if (/^(time|what time is it|tell me the time)[?.! ]*$/.test(command)) {
    return `The current time is ${new Date().toLocaleTimeString()}.`;
  }

  if (/^(date|today's date|what is the date|what is today's date)[?.! ]*$/.test(command)) {
    return `Today's date is ${new Date().toLocaleDateString(undefined, {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric"
    })}.`;
  }

  if (/^(open )?(youtube|yt)( please)?[!. ]*$/.test(command)) {
    window.open("https://www.youtube.com/", "_blank", "noopener,noreferrer");
    return "Opening YouTube in a new tab.";
  }

  if (/^(open )?google[!. ]*$/.test(command)) {
    window.open("https://www.google.com/", "_blank", "noopener,noreferrer");
    return "Opening Google in a new tab.";
  }

  if (/^(open )?calculator[!. ]*$/.test(command)) {
    return "Your device's calculator is not directly accessible from this webpage. You can open your phone's Calculator app.";
  }

  if (/^(help|show commands|what can you do)[?.! ]*$/.test(command)) {
    return [
      "Here are some things you can try:",
      "",
      "• Ask me a question using AI chat.",
      "• Say 'time' or 'date'.",
      "• Say 'open YouTube' or 'open Google'.",
      "• Ask for homework explanations, summaries or coding help.",
      "• Use the microphone button if your browser supports speech recognition."
    ].join("\n");
  }

  return null;
}

/* ==========================================
   AI connection — Puter.js
========================================== */

function getPuter() {
  return window.puter || null;
}

async function askAI(prompt) {
  const puter = getPuter();

  if (!puter || !puter.ai || typeof puter.ai.chat !== "function") {
    throw new Error(
      "Puter.js is not available. Check your internet connection, reload the page and try again."
    );
  }

  const recentMessages = chatHistory
    .slice(-12)
    .filter(item => item.content)
    .map(item => ({
      role: item.role === "assistant" ? "assistant" : "user",
      content: item.content
    }));

  const systemPrompt = {
    role: "system",
    content:
      "You are JARVIS 2.0, a helpful, friendly personal AI assistant. " +
      "Explain concepts clearly. Help students learn rather than merely memorise. " +
      "For maths, show steps on separate lines. " +
      "Be honest about your capabilities and do not claim to perform actions you cannot perform. " +
      "Reply in the language the user uses when practical."
  };

  const messages = [
    systemPrompt,
    ...recentMessages,
    { role: "user", content: prompt }
  ];

  const response = await puter.ai.chat(messages);

  let answer = "";

  if (typeof response === "string") {
    answer = response;
  } else if (response && typeof response.message?.content === "string") {
    answer = response.message.content;
  } else if (Array.isArray(response?.message?.content)) {
    answer = response.message.content
      .map(part => part.text || "")
      .join("\n");
  } else if (response && typeof response.text === "string") {
    answer = response.text;
  }

  if (!answer.trim()) {
    throw new Error("The AI returned an empty response. Please try again.");
  }

  return answer.trim();
}

/* ==========================================
   Voice output
========================================== */

function speak(text) {
  if (!speechEnabled || !("speechSynthesis" in window)) return;

  window.speechSynthesis.cancel();

  const utterance = new SpeechSynthesisUtterance(
    String(text).slice(0, 2500)
  );

  utterance.rate = 1;
  utterance.pitch = 1;
  utterance.lang = "en-IN";

  window.speechSynthesis.speak(utterance);
}


/* ==========================================
   JARVIS 2.0 — INTERNET SEARCH
========================================== */

function isNewsQuestion(q) {
  return /\b(latest news|today'?s news|breaking news|current events|live news|news today|latest headlines)\b/i.test(q);
}

function isComplexQuestion(q) {
  return /\b(explain in detail|step by step|solve|prove|derive|debug|write code|create an app|build a website|write an essay|detailed explanation|teach me|homework|maths problem|reasoning|analyze|analyse|compare in detail|make a project)\b/i.test(q)
    || q.length > 180;
}

function googleSearchUrl(query) {
  return "https://www.google.com/search?q=" + encodeURIComponent(query);
}

function cleanText(value) {
  const div = document.createElement("div");
  div.innerHTML = value || "";
  return (div.textContent || "").trim();
}

async function webLookup(query) {
  const api =
    "https://en.wikipedia.org/w/api.php?action=query" +
    "&list=search&srsearch=" + encodeURIComponent(query) +
    "&utf8=1&format=json&origin=*&srlimit=5";

  try {
    const response = await fetch(api);

    if (!response.ok) {
      throw new Error("Search service unavailable");
    }

    const data = await response.json();
    const results = data?.query?.search || [];

    if (!results.length) {
      const url = googleSearchUrl(query);

      window.open(url, "_blank", "noopener,noreferrer");

      return "I couldn't find a suitable quick result.\n\n" +
        "Google Search opened for your question:\n" + url;
    }

    const lines = [
      "INTERNET SEARCH RESULTS",
      "Query: " + query,
      ""
    ];

    results.forEach((item, index) => {
      const url =
        "https://en.wikipedia.org/?curid=" + item.pageid;

      lines.push(
        (index + 1) + ". " + cleanText(item.title),
        cleanText(item.snippet.replace(/<\/?span[^>]*>/g, "")),
        "Source: " + url,
        ""
      );
    });

    lines.push(
      "More results: " + googleSearchUrl(query),
      "",
      "Note: These are Wikipedia search results, not a complete web-wide search."
    );

    return lines.join("\n");
  } catch (error) {
    const url = googleSearchUrl(query);

    window.open(url, "_blank", "noopener,noreferrer");

    return "The quick search service is unavailable right now.\n\n" +
      "I've opened Google Search instead:\n" + url;
  }
}

async function getLiveNews(query) {
  const topic = query
    .replace(/latest news|today'?s news|breaking news|live news|news today|latest headlines/ig, "")
    .trim() || "India";

  const rss =
    "https://news.google.com/rss/search?q=" +
    encodeURIComponent(topic + " when:7d") +
    "&hl=en-IN&gl=IN&ceid=IN:en";

  const api =
    "https://api.rss2json.com/v1/api.json?rss_url=" +
    encodeURIComponent(rss);

  try {
    const response = await fetch(api);

    if (!response.ok) {
      throw new Error("News feed unavailable");
    }

    const data = await response.json();
    const items = (data.items || []).slice(0, 6);

    if (!items.length) {
      throw new Error("No news results");
    }

    const lines = [
      "LATEST NEWS RESULTS",
      "Topic: " + topic,
      "Retrieved: " + new Date().toLocaleString(),
      ""
    ];

    items.forEach((item, index) => {
      lines.push(
        (index + 1) + ". " + cleanText(item.title),
        "Published: " + (item.pubDate || "Date unavailable"),
        "Source: " + item.link,
        ""
      );
    });

    lines.push(
      "More news: " + googleSearchUrl(topic + " latest news"),
      "",
      "Check each linked article for the full report and confirmation."
    );

    return lines.join("\n");
  } catch (error) {
    const url = googleSearchUrl(topic + " latest news");

    window.open(url, "_blank", "noopener,noreferrer");

    return "Live news feed could not be loaded.\n\n" +
      "Search for current news here:\n" + url;
  }
}


/* ==========================================
   Chat flow
========================================== */

async function handleMessage(rawText) {
  const text = String(rawText || "").trim();

  if (!text || busy) return;

  renderMessage("user", text);

  if (elements.input) {
    elements.input.value = "";
    elements.input.focus();
  }

  const localAnswer = getLocalCommand(text);

  if (localAnswer !== null) {
    renderMessage("assistant", localAnswer);
    speak(localAnswer);
    return;
  }

  setBusy(true);
  setStatus("AI PROCESSING");
  showTypingIndicator();

  try {
    const answer = await askAI(text);
    clearTypingIndicator();
    renderMessage("assistant", answer);
    speak(answer);
    setStatus("SYSTEM ONLINE");
  } catch (error) {
    clearTypingIndicator();

    const message = error && error.message
      ? error.message
      : "An unexpected error occurred.";

    renderMessage(
      "assistant",
      `I couldn't get an AI response. ${message}\n\nCheck your connection and try again.`
    );

    setStatus("AI CONNECTION ISSUE");
    console.error("JARVIS AI error:", error);
  } finally {
    setBusy(false);
  }
}

/* ==========================================
   Voice input
========================================== */

function setupVoiceInput() {
  const SpeechRecognition =
    window.SpeechRecognition || window.webkitSpeechRecognition;

  if (!SpeechRecognition) {
    if (elements.voice) {
      elements.voice.title = "Voice recognition is not supported by this browser";
      elements.voice.setAttribute("aria-label", "Voice input unavailable");
    }
    return;
  }

  recognition = new SpeechRecognition();
  recognition.lang = "en-IN";
  recognition.continuous = false;
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;

  recognition.onstart = () => {
    isListening = true;

    if (elements.voice) {
      elements.voice.classList.add("listening");
      elements.voice.setAttribute("aria-label", "Stop voice input");
    }

    setStatus("LISTENING");
  };

  recognition.onresult = event => {
    const transcript = event.results?.[0]?.[0]?.transcript;

    if (transcript && elements.input) {
      elements.input.value = transcript;
      handleMessage(transcript);
    }
  };

  recognition.onerror = event => {
    console.warn("Voice recognition error:", event.error);

    if (event.error !== "no-speech" && event.error !== "aborted") {
      renderMessage(
        "assistant",
        "Voice input could not be used. Check microphone permission or type your message instead."
      );
    }
  };

  recognition.onend = () => {
    isListening = false;

    if (elements.voice) {
      elements.voice.classList.remove("listening");
      elements.voice.setAttribute("aria-label", "Start voice input");
    }

    if (!busy) setStatus("SYSTEM ONLINE");
  };
}

/* ==========================================
   PWA installation
========================================== */

function setupInstallButton() {
  if (!elements.install) return;

  elements.install.hidden = true;

  window.addEventListener("beforeinstallprompt", event => {
    event.preventDefault();
    deferredInstallPrompt = event;
    elements.install.hidden = false;
    elements.install.textContent = "Install App";
  });

  elements.install.addEventListener("click", async () => {
    if (!deferredInstallPrompt) {
      renderMessage(
        "assistant",
        "If installation is available, open your browser menu and choose 'Install app' or 'Add to Home screen'."
      );
      return;
    }

    deferredInstallPrompt.prompt();
    await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null;
    elements.install.hidden = true;
  });

  window.addEventListener("appinstalled", () => {
    deferredInstallPrompt = null;
    elements.install.hidden = true;
    setStatus("APP INSTALLED");
  });
}

/* ==========================================
   Quick actions
========================================== */

function setupQuickActions() {
  document.querySelectorAll("[data-prompt]").forEach(button => {
    button.addEventListener("click", () => {
      const prompt = button.getAttribute("data-prompt");
      if (prompt) handleMessage(prompt);
    });
  });

  document.querySelectorAll("[data-command]").forEach(button => {
    button.addEventListener("click", () => {
      const command = button.getAttribute("data-command");

      if (command === "youtube") {
        handleMessage("open YouTube");
      } else if (command === "google") {
        handleMessage("open Google");
      } else if (command === "clock") {
        handleMessage("time");
      } else if (command === "knowledge") {
        if (elements.input) {
          elements.input.focus();
          elements.input.placeholder = "Ask JARVIS anything...";
        }
      }
    });
  });
}

/* ==========================================
   Event listeners and startup
========================================== */

function init() {
  updateClock();
  window.setInterval(updateClock, 1000);

  loadHistory();
  setupVoiceInput();
  setupInstallButton();
  setupQuickActions();

  if (elements.form) {
    elements.form.addEventListener("submit", event => {
      event.preventDefault();
      handleMessage(elements.input?.value || "");
    });
  }

  if (elements.voice) {
    elements.voice.addEventListener("click", () => {
      if (!recognition) {
        renderMessage(
          "assistant",
          "Your browser does not support voice recognition. Try a compatible browser or type your message."
        );
        return;
      }

      if (isListening) {
        recognition.stop();
      } else {
        try {
          recognition.start();
        } catch (error) {
          console.warn("Could not start voice input:", error);
        }
      }
    });
  }

  if (elements.clear) {
    elements.clear.addEventListener("click", () => {
      chatHistory = [];
      saveHistory();

      if (elements.messages) {
        elements.messages.replaceChildren();
      }

      renderMessage("assistant", "Chat history cleared. What shall we do next?");
    });
  }

  document.addEventListener("visibilitychange", () => {
    if (document.hidden && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
  });

  if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("./service-worker.js")
        .then(() => console.log("JARVIS service worker registered."))
        .catch(error => console.warn("Service worker registration failed:", error));
    });
  }

  setStatus("SYSTEM ONLINE");
  console.log("JARVIS 2.0 initialized.");
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
