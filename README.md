# Clarity — Voice-to-Clean-Text Transcription (working title)

Voice input transcription app that removes filler words while keeping the original verbatim record intact and recoverable.

## Status

Working MVP skeleton, deployed: record in the browser → verbatim transcript (Whisper) → context-aware clean pass (Claude) → Clean/Verbatim toggle with removed spans marked, never silently discarded. Covers the P0 core loop from Epics A, B1, C2, and E1 in the PRD.

**Live demo:** https://clarity-voice-transcription.vercel.app
(backend: Render, cold-starts on the free tier — first request after idle can take ~30s)

## Architecture

- **`web/`** — React + Vite + TypeScript frontend. Records audio via `MediaRecorder`, calls the server, renders the Clean/Verbatim toggle.
- **`server/`** — Express + TypeScript backend. Proxies to OpenAI Whisper for transcription and Claude for the filler-removal pass, so API keys never reach the browser.
  - The clean pass is structurally constrained to *deletion only*: Claude returns exact substrings to remove via tool use, and the server deletes only text it can find verbatim in the original transcript — it can never rewrite, reorder, or add words. See [`server/src/clean.ts`](server/src/clean.ts).

## Running locally

```bash
# Backend
cd server
cp .env.example .env   # fill in OPENAI_API_KEY and ANTHROPIC_API_KEY
npm install
npm run dev             # http://localhost:8787

# Frontend (separate terminal)
cd web
npm install
npm run dev              # http://localhost:5173, proxies /api to the server
```

## Contents

- [`docs/PRD.md`](docs/PRD.md) — Product Requirements Document: personas, epics, detailed user stories with acceptance criteria, non-functional requirements, risks, and phased roadmap.

## Author

Built by [jhovahn](https://www.linkedin.com/in/jhovahn).
