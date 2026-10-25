# Jarvis-V2
JARVIS 2.0 — Your AI Assistant

A mobile-friendly AI assistant built with HTML, CSS and JavaScript. AI runs through Puter.js, with no server and no API key.

## Features
- Clean light/dark interface with sidebar, chat history, chat search and Settings
- **Internet-first answers:** calculator, weather (Open-Meteo), exchange rates, word meanings and Wikipedia sources are fetched directly. AI is used when real thinking is needed.
- **Finalized answers with links:** for "who is / what is / why / how" questions, JARVIS gathers up to 3 Wikipedia sources and the AI writes one organised answer. The reply ends with clickable source buttons. If the AI is unavailable, the sources are still shown.
- **Internet-first mode (Settings, on by default):** almost every question is searched on the web first. Wikipedia sources are collected, live web search runs, and the AI only writes the final answer from them, always ending with a Sources line. Only greetings, creative/code writing, translation and rewriting stay AI-only. Settings shows what share of your answers used the internet.
- Fresh answers: today's date is given to the AI, and questions about anything that changes (news, office holders, prices, sports, versions) use live web search with a Sources line. If live search is unavailable, the answer is labelled and marked as possibly out of date.
- Web search button forces live search for any question
- Every answer is labelled: Internet, Internet + AI, AI, or On your device. Each source button shows the site's logo (favicon).
- **Strict internet mode** (Settings): searches the web for every question except simple greetings, pushing the internet share close to 99%. Settings shows the real percentage.
- More direct internet answers with no AI: crypto prices (CoinGecko), country facts (REST Countries), top tech stories (Hacker News), time in any city, plus weather, exchange rates, word meanings and the calculator
- Photo questions (attach a photo and ask about it) and image creation (/image or the Image button)
- Slash commands: /image /search /study /summarize /explain /translate /new /clear /help
- Stop button, richer answers (tables, numbered lists, quotes), pin and rename chats
- Personalize: your name, custom style instructions and accent colour. Backup and restore of all chats.
- Streaming replies, Regenerate, Edit your last question, Copy, Read aloud
- Code blocks with Copy code, and a sandboxed Preview for HTML
- Study assistant, voice input and spoken replies (where the browser supports them)
- Export conversation, clear chat, clear history
- PWA: installable, with an offline app shell (registered service worker)

## Project structure
```
Jarvis-V2/
├── index.html
├── style.css
├── app.js          (core chat engine)
├── extras.js       (new features, loaded after app.js)
├── extras.css      (styles for the new features)
├── manifest.json
├── service-worker.js
├── SECURITY.md
├── README.md
├── .github/workflows/codeql.yml
└── assets/
    ├── icon.svg
    ├── icon-192.png
    ├── icon-512.png
    └── icon-maskable-512.png
```

## Run / deploy (GitHub Pages)
1. Repository **Settings → Pages**
2. **Deploy from a branch**, branch `main`, folder `/ (root)`
3. Open the published URL. All paths are relative, so it works inside the `/Jarvis-V2/` folder.

## AI model
The model is set in one place: `AI_MODEL` at the top of `askAI` in `app.js` (currently `openai/gpt-5.6-luna`, the Puter model that supports the web search tool). Change it there if you want a different or cheaper model.

## Data and privacy
- Chats, generated images (compressed), notes of your style and settings are stored only in your browser. Photos you attach are sent for that question only and are not saved.
- Source logos are loaded from each source site's own `/favicon.ico`, with Google's favicon service as a fallback.
- Questions are sent to Puter (AI) or to public services (Open-Meteo, ExchangeRate-API, dictionaryapi.dev, Wikipedia) to get answers.
- Voice input uses your browser's speech service, which may process audio online.
- Do not store passwords, API keys or private information in this public repository.

## Known limitations
- AI features need internet and a working Puter.js session.
- Internet lookups work best in English (Hindi Wikipedia is used for Devanagari text).
- Voice features depend on browser support and permissions.
- Generated images are saved compressed in your browser; if storage fills up, download a backup and clear old chats.
- The extra direct sources (CoinGecko, REST Countries, Hacker News) are free public services and may rate-limit or change.
- Offline mode only keeps the app shell. The AI does not work offline.

## Built with
HTML5, CSS3, JavaScript, Puter.js
