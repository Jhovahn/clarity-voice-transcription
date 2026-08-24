# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Clarity is a voice-to-clean-text transcription app: record audio in the browser, transcribe verbatim (Whisper), then run a context-aware pass (Claude) that removes filler words while keeping the original recoverable via a Clean/Verbatim toggle.

## Architecture

Two independent npm projects, no root package.json/workspace — always `cd` into `server/` or `web/` first.

- **`server/`** — Express 5 + TypeScript (ESM) backend. Proxies to OpenAI Whisper (`transcribe.ts`) and Anthropic Claude (`clean.ts`) so API keys stay server-side. Both API calls fall back to mocked output when their respective API key env var is unset (useful for local dev without keys, and what CI exercises).
- **`web/`** — React 19 + Vite + TypeScript frontend. Records audio via `MediaRecorder`, calls `/api/*`, renders the Clean/Verbatim toggle. Vite dev server proxies `/api` to `http://localhost:8787`.
- Deploy targets: web → Vercel, server → Render (`render.yaml`, free-tier, cold-starts).

### Filler-removal design (`server/src/clean.ts`)

The clean pass is structurally constrained to deletion-only — this is the core product guarantee and the thing most likely to matter when touching this file:

- Claude is forced (via `tool_choice`) to return exact verbatim substrings to delete (`spans_to_remove`), never rewritten text.
- The server only deletes text it can locate with an exact substring search in the original transcript (`applyRemovals`); it can never add, reorder, or paraphrase.
- `isSafeSpan` is a second independent check: a span is only trusted if every word in it is drawn from a fixed filler vocabulary, or it's a pure adjacent-word repetition. Anything else is rejected and logged, even if Claude proposed it.
- Prefer under-removal (leaving a filler in) over over-removal (silently deleting meaning) — this bias is intentional, see the comments in `clean.ts`.

## Commands

Backend (`server/`):

```bash
npm install
npm run dev      # tsx watch, http://localhost:8787
npm test         # vitest run
npm run build    # tsc -> dist/
npm start        # node dist/index.js
```

Run a single server test:

```bash
npx vitest run src/clean.test.ts -t "test name"
```

Frontend (`web/`):

```bash
npm install
npm run dev       # vite, http://localhost:5173
npm run lint      # oxlint
npm run build     # tsc -b && vite build
npm run preview
```

CI (`.github/workflows/ci.yml`) runs on push/PR to `main`: server job does `npm ci && npm run build && npm test`; web job does `npm ci && npm run build`. Both must pass.

## Environment

`server/.env` (copy from `.env.example`): `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, optional `GLOBAL_DAILY_REQUEST_CAP`. Missing keys trigger mock fallbacks in `transcribe.ts`/`clean.ts` rather than errors.

## Conventions

- Server code is ESM TypeScript — internal imports use `.js` extensions (e.g. `import { cleanTranscript } from "./clean.js"`) even though source files are `.ts`.
- Web linting uses oxlint (`web/.oxlintrc.json`), not ESLint.
- No auth on the API; cost exposure to the OpenAI/Anthropic keys is bounded by a per-IP rate limiter and a process-lifetime global daily cap in `server/src/index.ts` — both explicitly noted as crude/demo-grade, not production auth.
