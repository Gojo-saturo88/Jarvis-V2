# Security Policy

## Supported versions

Only the latest version on the `main` branch (the published site) receives fixes.

## Reporting a vulnerability

Please report security problems privately using GitHub's **Report a vulnerability** option on the repository's **Security** tab. Please do not post details in a public issue.

Include what you found, how to reproduce it, and which browser or device you used. Reports are reviewed as time allows, and confirmed problems are fixed in `main`.

## What this project does and does not store

- Chats, settings and the theme stay in your own browser (localStorage). Nothing is stored on a server by this project.
- The app contains no passwords, tokens or API keys. Never add any to this public repository.
- AI replies are produced through Puter.js, and simple lookups (weather, exchange rates, dictionary, Wikipedia) are fetched directly from public services. Your question text is sent to those services to get an answer.
- Replies are shown as escaped text with a small safe formatter. HTML previews run inside a sandboxed frame.
