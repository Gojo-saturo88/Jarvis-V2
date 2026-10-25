"use strict";

/* ============================================================================
   JARVIS extras: slash commands, photo questions, image creation, stop button,
   richer Markdown (tables, numbered lists), more direct internet answers,
   strict internet mode, personalization, pin/rename chats and backups.
   Loaded after app.js and built on its functions.
   ========================================================================== */

(function () {
  const CUSTOM_KEY = "jarvis-v2-custom";
  const STRICT_KEY = "jarvis-v2-strict";
  const ACCENT_KEY = "jarvis-v2-accent";

  let imageMode = false;

  /* ---------- small helpers ---------- */
  const load = (key, fallback) => {
    try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
  };
  const getCustom = () => load(CUSTOM_KEY, { nick: "", style: "" });
  const strictOn = () => localStorage.getItem(STRICT_KEY) === "true";

  /* ---------- richer Markdown: tables, ordered lists, quotes, rules ---------- */
  window.renderMarkdown = function renderMarkdown(input) {
    let text = escapeHTML(input);
    const codeBlocks = [];

    text = text.replace(/```([\w-]*)\n?([\s\S]*?)```/g, (_, language, code) => {
      const index = codeBlocks.length;
      const lang = (language || "").toLowerCase();
      codeBlocks.push(`<div class="code-block"><div class="code-head"><span>${escapeHTML(lang || "code")}</span><span><button data-action="copycode">Copy code</button>${lang === "html" ? '<button data-action="preview">Preview</button>' : ""}</span></div><pre><code>${code.trim()}</code></pre></div>`);
      return `@@JARVISCODE${index}@@`;
    });

    const inline = value => value
      .replace(/`([^`\n]+)`/g, "<code>$1</code>")
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>")
      .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, (_, label, url) => {
        const safe = safeURL(url);
        return safe ? `<a href="${safe}" target="_blank" rel="noopener noreferrer">${label}</a>` : label;
      });

    const isTableSep = line => /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(line || "");
    const cells = line => line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map(c => inline(c.trim()));

    const lines = text.split("\n");
    const out = [];
    let i = 0;

    while (i < lines.length) {
      const line = lines[i];

      if (!line.trim()) { i++; continue; }

      if (/^@@JARVISCODE\d+@@$/.test(line.trim())) { out.push(line.trim()); i++; continue; }

      if (line.includes("|") && isTableSep(lines[i + 1])) {
        const head = cells(line);
        i += 2;
        const rows = [];
        while (i < lines.length && lines[i].includes("|") && lines[i].trim()) { rows.push(cells(lines[i])); i++; }
        out.push(`<div class="table-wrap"><table><thead><tr>${head.map(c => `<th>${c}</th>`).join("")}</tr></thead><tbody>${rows.map(r => `<tr>${r.map(c => `<td>${c}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`);
        continue;
      }

      const heading = /^(#{1,3}) (.+)$/.exec(line);
      if (heading) { out.push(`<h${heading[1].length}>${inline(heading[2])}</h${heading[1].length}>`); i++; continue; }

      if (/^-{3,}\s*$/.test(line)) { out.push("<hr>"); i++; continue; }

      if (/^&gt; ?/.test(line)) {
        const quote = [];
        while (i < lines.length && /^&gt; ?/.test(lines[i])) { quote.push(inline(lines[i].replace(/^&gt; ?/, ""))); i++; }
        out.push(`<blockquote>${quote.join("<br>")}</blockquote>`);
        continue;
      }

      if (/^\s*[-*] /.test(line)) {
        const items = [];
        while (i < lines.length && /^\s*[-*] /.test(lines[i])) { items.push(`<li>${inline(lines[i].replace(/^\s*[-*] /, ""))}</li>`); i++; }
        out.push(`<ul>${items.join("")}</ul>`);
        continue;
      }

      if (/^\s*\d+[.)] /.test(line)) {
        const items = [];
        while (i < lines.length && /^\s*\d+[.)] /.test(lines[i])) { items.push(`<li>${inline(lines[i].replace(/^\s*\d+[.)] /, ""))}</li>`); i++; }
        out.push(`<ol>${items.join("")}</ol>`);
        continue;
      }

      if (/^(\*\*)?Sources?:/i.test(line.trim())) { out.push(`<div class="srcs">${inline(line.trim())}</div>`); i++; continue; }

      const para = [];
      while (i < lines.length && lines[i].trim() && !/^(#{1,3} |-{3,}\s*$|&gt; ?|\s*[-*] |\s*\d+[.)] |@@JARVISCODE|(\*\*)?Sources?:)/i.test(lines[i]) && !(lines[i].includes("|") && isTableSep(lines[i + 1]))) {
        para.push(inline(lines[i])); i++;
      }
      if (para.length) out.push(`<p>${para.join("<br>")}</p>`);
      else i++;
    }

    return out.join("").replace(/@@JARVISCODE(\d+)@@/g, (_, index) => codeBlocks[Number(index)] || "");
  };

  /* ---------- pin and rename chats ---------- */
  window.renderHistory = function renderHistory() {
    const list = $("#historyList");
    const query = ($("#historySearch")?.value || "").toLowerCase();
    const sorted = [...chats].sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0));

    list.innerHTML = sorted
      .filter(chat => !query || String(chat.title).toLowerCase().includes(query))
      .map(chat => `
        <div class="history-item ${chat.id === activeChatId ? "active" : ""}">
          <button class="history-open" data-chat-id="${chat.id}" title="${escapeHTML(chat.title)}">${chat.pinned ? '<span class="pin-mark">&#9733;</span> ' : ""}${escapeHTML(chat.title)}</button>
          <button class="history-mini" data-pin-id="${chat.id}" aria-label="${chat.pinned ? "Unpin" : "Pin"} conversation" title="${chat.pinned ? "Unpin" : "Pin"}">${chat.pinned ? "&#9733;" : "&#9734;"}</button>
          <button class="history-mini" data-rename-id="${chat.id}" aria-label="Rename conversation" title="Rename">&#9998;</button>
          <button class="history-delete" data-delete-id="${chat.id}" aria-label="Delete conversation">&times;</button>
        </div>`).join("");
  };

  $("#historyList").addEventListener("click", event => {
    const pin = event.target.closest("[data-pin-id]");
    const rename = event.target.closest("[data-rename-id]");
    if (pin) {
      const chat = chats.find(c => c.id === pin.dataset.pinId);
      if (chat) { chat.pinned = !chat.pinned; saveChats(); renderHistory(); }
    } else if (rename) {
      const chat = chats.find(c => c.id === rename.dataset.renameId);
      if (!chat) return;
      const name = prompt("Rename conversation", chat.title);
      if (name && name.trim()) { chat.title = name.trim().slice(0, 60); saveChats(); renderHistory(); }
    }
  });
  $("#historySearch").addEventListener("input", () => renderHistory());

  /* ---------- more direct internet answers (no AI needed) ---------- */
  const COINS = { bitcoin: "bitcoin", btc: "bitcoin", ethereum: "ethereum", eth: "ethereum", dogecoin: "dogecoin", doge: "dogecoin", solana: "solana", xrp: "ripple", ripple: "ripple", bnb: "binancecoin", cardano: "cardano", litecoin: "litecoin" };

  async function cryptoAnswer(t) {
    const m = /\b(bitcoin|btc|ethereum|eth|dogecoin|doge|solana|xrp|ripple|bnb|cardano|litecoin)\b/i.exec(t);
    if (!m || !/(price|rate|worth|value|kitna|cost|how much)/i.test(t)) return null;
    const id = COINS[m[1].toLowerCase()];
    const data = await fetchJSON("https://api.coingecko.com/api/v3/simple/price?ids=" + id + "&vs_currencies=usd,inr&include_24hr_change=true");
    const c = data[id];
    if (!c) return null;
    const change = c.usd_24h_change;
    return { text: "**" + id.charAt(0).toUpperCase() + id.slice(1) + "**\n\n- USD: $" + c.usd.toLocaleString("en-US") + "\n- INR: \u20b9" + c.inr.toLocaleString("en-IN") + "\n- 24h change: " + (change >= 0 ? "+" : "") + change.toFixed(2) + "%\n\nSources: [CoinGecko](https://www.coingecko.com)" };
  }

  async function timeAnswer(t) {
    const m = /\b(?:time|samay)\b.*\b(?:in|at|of)\s+([a-z][a-z\s.-]{1,40})$/i.exec(t.replace(/[?!.]+$/, ""));
    if (!m) return null;
    const geo = await fetchJSON("https://geocoding-api.open-meteo.com/v1/search?count=1&name=" + encodeURIComponent(m[1].trim()));
    const place = geo.results && geo.results[0];
    if (!place || !place.timezone) return null;
    const when = new Date().toLocaleString("en-GB", { timeZone: place.timezone, dateStyle: "full", timeStyle: "short" });
    return { text: "**Time in " + place.name + (place.country ? ", " + place.country : "") + "**\n\n" + when + " (" + place.timezone + ")\n\nSources: [Open-Meteo](https://open-meteo.com)" };
  }

  async function countryAnswer(t) {
    const q = t.trim().replace(/[?!.]+$/, "");
    const m = /^(?:capital|population|currency|currencies|language|languages|area)s?\s+of\s+([a-z][a-z\s.'-]{1,40})$/i.exec(q) || /^(?:facts about|country)\s+([a-z][a-z\s.'-]{1,40})$/i.exec(q);
    if (!m) return null;
    const name = encodeURIComponent(m[1].trim());
    const fields = "?fields=name,capital,population,currencies,languages,region,area";
    let data;
    try { data = await fetchJSON("https://restcountries.com/v3.1/name/" + name + fields + "&fullText=true"); }
    catch { data = await fetchJSON("https://restcountries.com/v3.1/name/" + name + fields); }
    const c = Array.isArray(data) && data[0];
    if (!c) return null;
    const currency = Object.values(c.currencies || {}).map(x => x.name + (x.symbol ? " (" + x.symbol + ")" : "")).join(", ");
    return { text: "**" + c.name.common + "**\n\n- Capital: " + (c.capital || []).join(", ") + "\n- Region: " + c.region + "\n- Population: " + c.population.toLocaleString("en-US") + "\n- Area: " + Math.round(c.area).toLocaleString("en-US") + " km2\n- Currency: " + currency + "\n- Languages: " + Object.values(c.languages || {}).join(", ") + "\n\nSources: [REST Countries](https://restcountries.com)" };
  }

  async function newsAnswer(t) {
    if (!/\b(tech|technology|hacker news|programming|startup)\b.*\b(news|headlines|stories)\b/i.test(t)) return null;
    const data = await fetchJSON("https://hn.algolia.com/api/v1/search?tags=front_page&hitsPerPage=8");
    const items = (data.hits || []).filter(h => h.title).slice(0, 6);
    if (!items.length) return null;
    const lines = items.map(h => "- [" + h.title.replace(/[\[\]]/g, "") + "](" + (h.url || "https://news.ycombinator.com/item?id=" + h.objectID).replace(/\)/g, "%29") + ") (" + (h.points || 0) + " points)");
    return { text: "**Top tech stories right now**\n\n" + lines.join("\n") + "\n\nSources: [Hacker News](https://news.ycombinator.com)" };
  }

  const baseNetAnswer = netAnswer;
  netAnswer = async function (text, skipWiki) {
    const t = String(text || "").trim();
    if (t && t.length <= 200) {
      for (const engine of [cryptoAnswer, timeAnswer, countryAnswer, newsAnswer]) {
        try { const result = await engine(t); if (result) return result; } catch { /* try the next engine */ }
      }
    }
    return baseNetAnswer(text, skipWiki);
  };

  /* ---------- strict internet mode ---------- */
  const baseWantsInternet = wantsInternet;
  wantsInternet = function (question) {
    const t = question.trim().toLowerCase();
    if (/^(summarize the following|translate the following|explain this simply)/.test(t)) return false;
    if (strictOn()) {
      if (t.length < 3) return false;
      return !(t.split(/\s+/).length <= 5 && /^(hi+|hello|hey|thanks?|thank you|ok(ay)?|bye|namaste)\b/.test(t));
    }
    return baseWantsInternet(question);
  };

  /* ---------- personalization ---------- */
  const baseSystemPrompt = buildSystemPrompt;
  buildSystemPrompt = function (webEnabled) {
    let prompt = baseSystemPrompt(webEnabled);
    const custom = getCustom();
    if (custom.nick) prompt += "\nThe user's name is " + custom.nick + ". Use it naturally, not in every reply.";
    if (custom.style) prompt += "\nFollow these user style instructions unless they are unsafe or conflict with accuracy: " + custom.style;
    return prompt;
  };

  function applyAccent(color) {
    const style = document.body.style;
    if (color) { style.setProperty("--accent", color); style.setProperty("--accent-soft", color + "26"); }
    else { style.removeProperty("--accent"); style.removeProperty("--accent-soft"); }
  }

  const ACCENTS = [["Default", ""], ["Blue", "#3b82f6"], ["Green", "#16a34a"], ["Violet", "#7c3aed"], ["Rose", "#e11d48"]];
  ACCENTS.forEach(([name, color]) => {
    const button = document.createElement("button");
    button.type = "button";
    button.title = name;
    button.dataset.color = color;
    button.setAttribute("aria-label", name + " accent colour");
    button.style.background = color || "linear-gradient(135deg,#b76d49 50%,#e0a27f 50%)";
    button.addEventListener("click", () => {
      localStorage.setItem(ACCENT_KEY, color);
      applyAccent(color);
      markAccent();
    });
    $("#swatches").append(button);
  });
  function markAccent() {
    const current = localStorage.getItem(ACCENT_KEY) || "";
    document.querySelectorAll("#swatches button").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.color === current)));
  }
  applyAccent(localStorage.getItem(ACCENT_KEY) || "");

  $("#settingsBtn").addEventListener("click", () => {
    const custom = getCustom();
    $("#customNick").value = custom.nick || "";
    $("#customStyle").value = custom.style || "";
    $("#strictSetting").checked = strictOn();
    markAccent();
  });
  const saveCustom = () => localStorage.setItem(CUSTOM_KEY, JSON.stringify({ nick: $("#customNick").value.trim(), style: $("#customStyle").value.trim() }));
  $("#customNick").addEventListener("input", saveCustom);
  $("#customStyle").addEventListener("input", saveCustom);
  $("#strictSetting").addEventListener("change", event => {
    localStorage.setItem(STRICT_KEY, event.target.checked ? "true" : "false");
    showToast(event.target.checked ? "Strict internet mode on." : "Strict internet mode off.");
  });

  /* ---------- backup and restore ---------- */
  $("#backupBtn").addEventListener("click", () => {
    const blob = new Blob([JSON.stringify({ app: "jarvis-v2", version: 1, exported: new Date().toISOString(), chats }, null, 2)], { type: "application/json" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "jarvis-backup.json";
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  });
  $("#restoreBtn").addEventListener("click", () => $("#restoreInput").click());
  $("#restoreInput").addEventListener("change", async event => {
    const file = event.target.files[0];
    event.target.value = "";
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      const incoming = Array.isArray(data) ? data : data.chats;
      if (!Array.isArray(incoming)) throw new Error("bad file");
      let added = 0;
      incoming.slice(0, 200).forEach(chat => {
        if (chat && typeof chat.id === "string" && Array.isArray(chat.messages) && !chats.some(c => c.id === chat.id)) {
          chats.push({ id: chat.id, title: String(chat.title || "Restored chat").slice(0, 60), messages: chat.messages.filter(m => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string"), createdAt: chat.createdAt || Date.now(), pinned: !!chat.pinned });
          added++;
        }
      });
      saveChats();
      renderAll();
      showToast(added ? "Restored " + added + " chat" + (added > 1 ? "s" : "") + "." : "Nothing new to restore.");
    } catch {
      showToast("That file is not a valid JARVIS backup.");
    }
  });

  /* ---------- stop button ---------- */
  const baseSetThinking = setThinking;
  setThinking = function (show, web) {
    baseSetThinking(show, web);
    $("#stopBtn").classList.toggle("hidden", !show);
  };
  $("#stopBtn").addEventListener("click", () => {
    window.jarvisStop = true;
    showToast("Stopping. Web-search answers finish first, streamed answers stop right away.");
  });

  /* ---------- photo questions ---------- */
  $("#photoBtn").addEventListener("click", () => $("#photoInput").click());
  $("#photoInput").addEventListener("change", event => {
    const file = event.target.files[0];
    event.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) { showToast("Please choose an image."); return; }
    if (file.size > 8 * 1024 * 1024) { showToast("That photo is over 8 MB. Choose a smaller one."); return; }
    window.jarvisImage = file;
    $("#attachName").textContent = file.name;
    $("#attachChip").classList.remove("hidden");
    $("#promptInput").placeholder = "Ask something about the photo...";
    $("#promptInput").focus();
  });
  function clearPhoto() {
    window.jarvisImage = null;
    $("#attachChip").classList.add("hidden");
    $("#promptInput").placeholder = "Message JARVIS...";
  }
  $("#attachRemove").addEventListener("click", clearPhoto);

  /* ---------- image creation ---------- */
  function compressImage(element) {
    return new Promise((resolve, reject) => {
      const draw = () => {
        try {
          const max = 768;
          const scale = Math.min(1, max / Math.max(element.naturalWidth, element.naturalHeight));
          const canvas = document.createElement("canvas");
          canvas.width = Math.max(1, Math.round(element.naturalWidth * scale));
          canvas.height = Math.max(1, Math.round(element.naturalHeight * scale));
          canvas.getContext("2d").drawImage(element, 0, 0, canvas.width, canvas.height);
          resolve(canvas.toDataURL("image/jpeg", 0.82));
        } catch (error) { reject(error); }
      };
      if (element.complete && element.naturalWidth) draw();
      else { element.onload = draw; element.onerror = () => reject(new Error("image failed to load")); }
    });
  }

  async function generateImage(prompt, rawText) {
    if (!navigator.onLine) { showToast("Internet connection nahi hai."); return true; }
    if (!window.puter?.ai?.txt2img) { showToast("Image service did not load. Refresh the page and try again."); return true; }

    const input = $("#promptInput");
    input.value = "";
    autoResizeInput();
    setImageMode(false);
    addMessage("user", rawText);
    busy = true;
    setThinking(true, false);

    try {
      const element = await puter.ai.txt2img(prompt);
      const image = typeof element === "string" ? Object.assign(new Image(), { src: element }) : element;
      const url = await compressImage(image);
      addMessage("assistant", "Here is your image: " + prompt, { src: "ai", image: url });
    } catch (error) {
      console.error("Image creation failed:", error);
      showError("Could not create the image. " + (error && error.message ? error.message : "Please try again."));
    } finally {
      busy = false;
      setThinking(false);
      renderMessages();
    }
    return true;
  }

  function setImageMode(on) {
    imageMode = on;
    $("#imageMode").classList.toggle("selected", on);
    $("#promptInput").placeholder = on ? "Describe the image you want..." : "Message JARVIS...";
  }
  $("#imageMode").addEventListener("click", () => { setImageMode(!imageMode); $("#promptInput").focus(); });

  $("#messages").addEventListener("click", event => {
    const button = event.target.closest('[data-action="saveimg"]');
    if (!button) return;
    const message = currentChat()?.messages.find(m => m.id === button.dataset.id);
    if (!message || !message.image) return;
    const link = document.createElement("a");
    link.href = message.image;
    link.download = "jarvis-image.jpg";
    document.body.append(link);
    link.click();
    link.remove();
  });

  /* ---------- slash commands ---------- */
  const COMMANDS = [
    ["/image", "Create a picture: /image a red car"],
    ["/search", "Search the web: /search latest ISRO news"],
    ["/study", "Step-by-step help: /study photosynthesis"],
    ["/summarize", "Summarize pasted text"],
    ["/explain", "Explain simply with an example"],
    ["/translate", "/translate hindi: Good morning"],
    ["/new", "Start a new chat"],
    ["/clear", "Clear this chat"],
    ["/help", "Show commands"]
  ];

  const menu = $("#slashMenu");
  function updateSlashMenu() {
    const value = $("#promptInput").value;
    if (!/^\/\w*$/.test(value)) { menu.classList.add("hidden"); return; }
    const matches = COMMANDS.filter(([name]) => name.startsWith(value.toLowerCase()));
    if (!matches.length) { menu.classList.add("hidden"); return; }
    menu.innerHTML = matches.map(([name, hint]) => `<button type="button" data-cmd="${name}"><strong>${name}</strong><span>${escapeHTML(hint)}</span></button>`).join("");
    menu.classList.remove("hidden");
  }
  $("#promptInput").addEventListener("input", updateSlashMenu);
  menu.addEventListener("click", event => {
    const button = event.target.closest("[data-cmd]");
    if (!button) return;
    const input = $("#promptInput");
    input.value = button.dataset.cmd + " ";
    menu.classList.add("hidden");
    autoResizeInput();
    input.focus();
  });
  document.addEventListener("click", event => { if (!event.target.closest("#slashMenu, #promptInput")) menu.classList.add("hidden"); });

  window.jarvisHooks = {
    imageSent: clearPhoto,

    async beforeSend(question) {
      menu.classList.add("hidden");
      const match = /^\/(\w+)\s*([\s\S]*)$/.exec(question);

      if (!match) return imageMode ? generateImage(question, "/image " + question) : false;

      const command = match[1].toLowerCase();
      const rest = match[2].trim();
      const clearInput = () => { $("#promptInput").value = ""; autoResizeInput(); };

      switch (command) {
        case "image":
          if (!rest) { showToast("Add a description, e.g. /image a red car"); return true; }
          return generateImage(rest, question);
        case "new": clearInput(); $("#newChat").click(); return true;
        case "clear": clearInput(); $("#clearCurrent").click(); return true;
        case "help": clearInput(); showToast("Commands: " + COMMANDS.map(c => c[0]).join("  ")); return true;
        case "search":
          if (!rest) { showToast("Add something to search, e.g. /search ISRO news"); return true; }
          forceWebSearch = true; $("#webMode").classList.add("selected"); return rest;
        case "study":
          if (!rest) { showToast("Add a topic, e.g. /study photosynthesis"); return true; }
          studyMode = true; $("#attachMode").classList.add("selected"); return rest;
        case "summarize":
          if (!rest) { showToast("Paste the text after /summarize"); return true; }
          return "Summarize the following clearly in short bullet points:\n\n" + rest;
        case "explain":
          if (!rest) { showToast("Add a topic, e.g. /explain black holes"); return true; }
          return "Explain this simply, with one everyday example: " + rest;
        case "translate": {
          const parts = /^([a-z\s]{2,20}):\s*([\s\S]+)$/i.exec(rest);
          if (!parts) { showToast("Use: /translate hindi: Good morning"); return true; }
          return "Translate the following into " + parts[1].trim() + ". Reply with only the translation.\n\nTranslate the following text:\n" + parts[2].trim();
        }
        default: return false;
      }
    }
  };

  renderHistory();
})();
