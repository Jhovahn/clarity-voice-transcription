# Product Requirements Document

## Clarity — Voice-to-Clean-Text Transcription (Working Title)

| | |
|---|---|
| **Status** | Draft v0.2 — scope revised |
| **Owner** | Product (draft authored on behalf of jhovahngibbs) |
| **Date** | 2026-08-20 |
| **Doc type** | PRD — pre-implementation, no engineering scoping done yet |

> **Note on assumptions:** No target platform, business model, or company context was specified. This draft assumes a consumer/prosumer product aimed at knowledge workers and creators. Assumptions are called out explicitly throughout — flag anything that should change and I'll revise.
>
> **Scope revision (v0.2):** Platform scope is narrowed to **web-first**: a responsive web app that works on desktop and mobile browsers. This avoids app-store distribution/review friction and lets v1 reach every platform through one build. Native iOS/Android apps are deferred — a later phase can wrap the same web app (e.g., via Capacitor) once there's a clear need for native-only capability (background recording, on-device ASR, offline mode). The product requirements and user stories below are unchanged by this — it affects delivery, not what the product does for the user. See §7 and §11.

---

## 1. Problem Statement

People increasingly *speak* content they used to type — voice memos, dictated emails and docs, interview recordings, meeting notes. Raw speech-to-text is accurate but unreadable: it's full of "um," "uh," "like," false starts, and repeated words that a human editor would instinctively cut. Today, users either:

1. Use a verbatim transcription tool and manually clean it up afterward (slow, tedious), or
2. Use a tool that silently "cleans" speech with no visibility into what was changed (fast, but untrustworthy — you can't tell if it altered your meaning).

There is no widely-trusted product that gives a **clean, publish-ready transcript by default**, while remaining **transparent, reversible, and configurable** enough that a journalist, researcher, or anyone else who needs the *exact* original words can still get them with confidence.

## 2. Goals

- **G1 — Speed to usable text.** A user should be able to speak naturally and get a transcript that needs little to no manual cleanup for casual use cases (notes, drafts, messages).
- **G2 — Trustworthy transformation.** Removing filler words is an edit, not free — the product must make that edit visible, reversible, and auditable, so users never wonder "did it change what I meant?"
- **G3 — Adapts to the user's speech, not the other way around.** Different people have different verbal habits (including accents, stutters, ESL patterns); the product must not treat a person's natural speech pattern as a universal "error."
- **G4 — Serves both casual and high-stakes use.** The same core engine should work for a quick voice memo *and* for a journalist or researcher who needs a defensible verbatim record.

## 3. Non-Goals (v1)

- Not a general-purpose text editor / word processor.
- Not a live meeting bot that auto-joins Zoom/Meet/Teams calls (candidate for a later phase).
- Not a summarization or paraphrasing tool — output is a faithful transcript, not a rewrite.
- Not a speech-therapy or clinical assessment tool, and must not be framed or marketed as one.
- Not attempting real-time speech translation in v1 (single source language per session).
- Not a native iOS/Android app in v1 — ships as a responsive web app first (see §7, §11); native wrapping is a later-phase option, not a v1 goal.

## 4. Personas

| Persona | Who | Core need | Where filler removal helps / hurts |
|---|---|---|---|
| **Maya** — Podcast host / creator | Records solo memos and interview clips for show notes and social posts | Fast, quotable, clean text | Wants aggressive cleanup, but needs quotes to stay factually accurate |
| **Daniel** — PM / knowledge worker | Dictates meeting notes and messages on the go | Paste-ready text, zero proofreading | Wants max cleanup, low stakes if imperfect |
| **Priya** — Journalist | Records interviews for articles | A clean draft **and** a defensible verbatim record for fact-checking/quotes | Cannot risk cleanup that changes meaning or could be challenged; needs verbatim mode |
| **Sam** — Grad student / qualitative researcher | Transcribes interviews for coding/analysis | Speaker-labeled transcripts, both clean and verbatim views | Needs disfluencies preserved *as data* in some analysis modes |
| **Alex** — Accessibility user (RSI / dyslexia) | Uses dictation as primary input for all writing | Natural speech → professional-quality text | Wants strong cleanup; must not misfire on their specific speech patterns |
| **Jordan** — Public-speaking coach / Toastmaster | Records practice talks | Wants filler words **counted and highlighted**, not silently removed | Inverse use case — informs an "Insights" mode rather than deletion |
| **Non-native / accented speaker** (cross-cutting) | Any persona | Accurate transcription and filler detection regardless of accent | High risk of false positives (real words misread as filler) if the model isn't robust |

## 5. Key Definitions

- **Disfluency / filler:** anything a fluent reader would remove from spoken text without changing its meaning. Categories:
  - *Filled pauses:* um, uh, er, erm
  - *Discourse/crutch phrases:* like, you know, I mean, so, actually, basically, kind of, right?, sort of
  - *Repetitions:* "the the," "I I," "and and"
  - *False starts / self-corrections:* "I want— I need to go" → "I need to go"
  - *Trailing off / restarts:* incomplete clauses abandoned mid-sentence
- **Verbatim transcript:** raw transcription, unedited, exactly as spoken (including all disfluencies).
- **Clean transcript:** the same content with disfluencies removed and punctuation/casing normalized.
- **Aggressiveness level:** how much of the disfluency taxonomy above is removed (see Epic B).

## 6. Epics & User Stories

Priority key: **P0** = required for MVP, **P1** = important, targeted post-MVP, **P2** = later / stretch.

---

### Epic A — Capture & Core Transcription

**A1. Live recording → transcript**
*As any user, I want to record my voice and get a text transcript within seconds of stopping, so dictation is as fast as typing.*
- Recording uses the browser's microphone access (desktop or mobile browser) — no app install required.
- Given I tap Record and speak, when I tap Stop, then the clean transcript appears within 3 seconds for recordings under 2 minutes.
- A live partial (streaming) transcript is shown while I'm still speaking, so I get immediate feedback before the final cleanup pass runs.
- I can pause and resume within a single recording session without losing prior audio/text.
- Continuous recordings of at least 30 minutes are supported without failure (via chunked processing).
- **Priority: P0**

**A2. Import existing audio/video**
*As a user, I want to import an existing recording (voice memo, meeting recording) and get a transcript, so I don't have to re-record content I already have.*
- Supports common formats (mp3, wav, m4a, mp4 audio track).
- Files up to a defined size/duration cap (e.g., 2 hours / 500MB) process asynchronously with a progress indicator and completion notification.
- **Priority: P1**

**A3. Language detection / selection**
*As a user, I want the app to auto-detect my spoken language (or let me set it manually), so transcription is accurate without per-session setup.*
- **Priority: P1** (MVP ships English-only; this story governs the multi-language rollout)

---

### Epic B — Filler Detection & Removal Engine

**B1. Default clean transcript**
*As a user, I want common filler words and filled pauses removed automatically by default, so my output reads cleanly with no manual editing.*
- Default ("Standard") mode removes filled pauses, exact word repetitions, and obvious false starts.
- Automatic punctuation, capitalization, and sentence-boundary correction is applied (fillers often break sentence flow).
- Removal never changes word order or substitutes/adds words — it only deletes disfluent spans.
- A side-by-side diff of what was removed is available (see Epic E).
- **Priority: P0**

**B2. Aggressiveness control**
*As a user, I want to control how much gets removed (filled pauses only → also discourse fillers → also repetitions/false starts), so the tool matches my use case.*
- At least 3 presets: **Light** (filled pauses only), **Standard** (+ discourse fillers), **Aggressive** (+ repetitions/false starts/trailing-off).
- A live preview shows the effect of each preset on a sample sentence before the user commits.
- Custom per-category toggles available beyond the presets.
- **Priority: P0**

**B3. Custom word/phrase lists**
*As a user, I want to add words/phrases I always want removed or always want kept, so the tool adapts to my personal speech habits and domain vocabulary.*
- Example: always keep "actually" (I use it meaningfully); always remove my personal tic "at the end of the day."
- Custom lists apply on top of the selected preset.
- **Priority: P1**

**B4. Contextual disambiguation (meaningful vs. filler use)**
*As a user — especially one with an accent or non-native speech pattern — I want the engine to distinguish meaningful uses of a word from filler uses of the same word (e.g., "I **like** pizza" vs. "It was, **like**, really good"), so my sentences aren't stripped of meaning.*
- Detection is context-aware (NLP-based), not naive string matching.
- Any word removed can be restored with a single tap directly from the clean transcript.
- False-positive removals are logged/reportable to improve the model.
- **Priority: P0** — a tool that silently damages meaning is worse than a verbatim-only tool.

**B5. Repetition & false-start collapsing**
*As a user, I want repeated words and abandoned false starts collapsed into the sentence I actually meant (e.g., "I want— I need to go" → "I need to go"), so the transcript reflects intent, not every attempt.*
- **Priority: P1**

---

### Epic C — Review & Editing Experience

**C1. Direct transcript editing**
*As a user, I want to edit the cleaned transcript like a normal text field, so I can make final tweaks before using it.*
- **Priority: P0**

**C2. Clean ⇄ Verbatim toggle**
*As a user, I want to switch instantly between the "Clean" and "Verbatim" view of the same transcript, so I can double-check nothing important was cut.*
- Toggle requires no reprocessing (both versions are generated together, not one-derived-on-demand).
- Verbatim view visually marks what the clean pass removed (e.g., struck-through inline) rather than being a separate, disconnected document.
- **Priority: P0**

**C3. Inline "what was actually said" lookup**
*As a user, I want to tap any point in the clean transcript and see what was originally said there (if anything was edited), so I can verify accuracy without hunting through the raw transcript.*
- **Priority: P1**

**C4. Audio-synced playback**
*As a user, I want to tap a word in the transcript and jump the audio to that exact timestamp, so I can verify unclear passages against the original recording.*
- **Priority: P1**

---

### Epic D — Customization & Profiles

**D1. Saved preference profiles**
*As a user, I want to save my filler-removal settings as a profile, and switch between profiles for different contexts (e.g., "Journalism — verbatim only" vs. "Quick notes — aggressive clean"), so I don't reconfigure every session.*
- **Priority: P1**

---

### Epic E — Trust, Transparency & Reversibility

**E1. Original is never silently discarded**
*As a user, I want the original audio and raw verbatim transcript retained by default, so I always have an accountable record of exactly what was said.*
- Verbatim transcript (and audio, subject to storage settings) persists unless the user explicitly deletes it.
- The clean transcript is always visually/labelled as a *derived, edited* version — never presented as if it were the raw record.
- **Priority: P0** — this is the trust foundation the whole product rests on.

**E2. One-tap full revert**
*As a user, I want a single control to revert to the exact verbatim transcript, so I never feel locked into an automated edit I disagree with.*
- **Priority: P0**

**E3. Verbatim-only / no-edit mode**
*As a user in a legal, medical, or journalistic context, I want the option to disable all automatic editing and get a strictly verbatim transcript, so I can meet accuracy and chain-of-custody requirements.*
- This mode is offered explicitly (not buried) — ideally surfaced during onboarding use-case selection (see K1).
- **Priority: P0**

---

### Epic F — Multi-Speaker & Context

**F1. Speaker labeling with per-speaker cleanup**
*As a user recording a conversation or interview, I want speakers labeled (Speaker 1/2, or named), with filler removal applied independently per speaker, so multi-person transcripts stay clean and correctly attributed.*
- **Priority: P1**

**F2. Turn-boundary-aware cleanup**
*As a user, I want filler removal to respect conversational turn boundaries, so cleaning up one speaker's "um" never visually merges their line with the previous speaker's.*
- **Priority: P2**

---

### Epic G — Export & Integrations

**G1. Standard export formats**
*As a user, I want to export or copy the clean transcript as plain text, Markdown, .docx, or caption formats (SRT/VTT), so I can drop it directly into my existing workflow.*
- **Priority: P0**

**G2. Direct send to other tools**
*As a user, I want to send a transcript directly to tools I already use (Notes, Google Docs, Notion, Slack, email), so I don't have to copy-paste manually.*
- **Priority: P1**

**G3. Developer API**
*As a developer, I want an API/SDK to submit audio and receive both clean and verbatim transcripts programmatically, so I can build filler-removal into my own product (e.g., a meeting tool or CRM voice-notes feature).*
- **Priority: P2**

---

### Epic H — Privacy & Data Handling

**H1. Processing & retention control**
*As a privacy-conscious user, I want clear control over whether my audio is processed on-device or in the cloud, and whether it's ever used for model training, so I can decide what I'm comfortable sharing — especially for sensitive conversations.*
- Any data retention/training use is explicit **opt-in**, never opt-out-by-default.
- On-device processing offered where platform capability allows.
- Clear, immediate data-deletion controls (delete audio, delete transcript, delete both).
- **Priority: P0**

**H2. Third-party recording consent**
*As a user recording a conversation with other people present, I want a reminder about two-party consent recording laws and an easy way to notify participants a recording is happening, so I use the product responsibly and legally.*
- **Priority: P1** — legal/ethical risk mitigation, not a core feature but important guardrail.

---

### Epic I — Accessibility

**I1. Fully voice/screen-reader navigable app**
*As a user who relies on dictation due to a motor impairment or RSI, I want to navigate the entire app (not just dictate transcript content) via voice and screen reader, so voice is a complete alternative to typing and clicking.*
- **Priority: P1**

**I2. Respectful handling of atypical speech**
*As a user with a stutter or a non-standard speech pattern, I want filler detection tuned so it doesn't mistake my natural speech for "errors," and I want a frictionless, non-judgmental way to fully disable disfluency removal, so the product adapts to how I actually speak rather than the reverse.*
- Product copy never frames disfluency removal as "fixing," "correcting," or "improving" the user's speech — it's described neutrally as formatting/editing text, the same way autocorrect doesn't imply someone can't spell.
- **Priority: P0** — this is an ethical requirement (relates to G3), not a nice-to-have.

---

### Epic J — Insights & Coaching (opt-in, later phase)

**J1. Filler-word practice report**
*As a public-speaking coach or someone rehearsing a talk, I want a report of how many filler words I used and where, so I can improve — even though I don't want them removed from this particular recording.*
- Delivered via an explicitly separate, opt-in "Practice Mode": fillers are **retained** in the output but counted, highlighted, and trended over time.
- Must not be the default experience — this is the one persona where the product's default behavior (removal) is actively unwanted.
- **Priority: P2**

---

### Epic K — Onboarding

**K1. Trust-building first run**
*As a new user, I want a short guided first run — record one test sentence, immediately see the clean vs. verbatim result side by side — so I understand and trust what the product does before relying on it for real content.*
- Onboarding also asks the user's primary use case (quick notes vs. professional/verbatim-sensitive work) to suggest a starting profile (Epic D) rather than defaulting everyone to "Aggressive."
- **Priority: P1**

---

## 7. Non-Functional Requirements

- **Latency:** clean transcript available within 3s of stopping recording for clips under 2 minutes; longer content processes asynchronously with progress feedback.
- **Accuracy targets:** underlying ASR word error rate and filler-detection precision/recall need explicit targets before build — flagged as an open question (Section 9), since these numbers should come from eng/data science, not be asserted here.
- **Platform support:** responsive web app (desktop + mobile browser) at launch. Native iOS/Android deferred to a later phase, likely as a wrapped build of the same web app rather than separate native codebases, unless a native-only capability (e.g., background recording, offline on-device ASR) becomes a hard requirement.
- **Language support:** English only at MVP; roadmap-gated expansion (filler vocabularies are language- and culture-specific and cannot simply be translated).
- **Offline/on-device:** at least a partial on-device path should be evaluated for privacy-sensitive users (Epic H1), even if cloud processing is the default for accuracy/latency reasons.

## 8. Success Metrics

- Reduction in post-transcription manual edit time/keystrokes vs. a verbatim baseline.
- Filler-detection precision and recall (false-positive rate is the more dangerous failure mode — it erodes trust).
- Rate at which users invoke "restore this word" (B4) or full revert (E2) — a proxy for over-aggressive default behavior.
- % of sessions where the user switches to Verbatim view (Epic C2) — if consistently high, it signals users don't trust the clean output.
- Retention / repeat usage, especially among the accessibility persona (Alex), since that persona depends on daily reliability.

## 9. Risks & Open Questions

- **Ethical risk:** aggressive or careless filler removal can read as "correcting" someone's natural speech, which is especially fraught for accented, ESL, or disfluent (e.g., stuttering) speakers. Default behavior and product copy need care (see I2, G3) — this is a design risk, not just an engineering one.
- **Legal/professional risk:** journalists, researchers, and legal/medical users may face real consequences if a "clean" transcript is mistaken for verbatim, or if an edit is later shown to have altered meaning. E1–E3 exist specifically to mitigate this, but the UI must make the distinction impossible to miss, not just technically available.
- **Processing location tradeoff:** on-device processing is better for privacy/latency-sensitive users but likely worse for accuracy versus a cloud model, at least initially. Needs an engineering feasibility check before committing to H1 as written.
- **Multi-language scoping:** which languages ship after English, and in what order, is undecided — likely driven by user demand data post-launch rather than decided upfront.
- **Monetization/pricing model:** not addressed in this draft — free tier vs. paid tiers (e.g., verbatim/legal mode, API access, longer imports) needs a separate pricing exercise.
- **Meeting-platform integration** (auto-joining Zoom/Meet/Teams) is explicitly out of scope for v1 but is a plausible, competitively-relevant Phase 3+ item worth revisiting.

## 10. Phased Roadmap (proposed)

**Phase 1 — MVP (web app)**
Single-speaker record + import (A1, A2), English only, Standard/Light/Aggressive presets (B1, B2), contextual disambiguation with restore (B4), Clean/Verbatim toggle (C2), direct edit (C1), original always retained + full revert (E1, E2), verbatim-only mode (E3), basic export (G1), processing/retention privacy controls (H1), respectful-defaults for atypical speech (I2), guided onboarding (K1). Delivered as a deployed, responsive web app — no native mobile build.

**Phase 2**
Multi-speaker diarization (F1), custom word lists (B3) and profiles (D1), integrations (G2), additional languages (A3), audio-synced playback (C4) and inline lookup (C3), accessibility navigation (I1).

**Phase 3**
Developer API (G3), Insights/Coaching mode (J1), enterprise/compliance features (audit trails, retention policies for regulated industries), caption-format export at scale, possible meeting-platform integration, native iOS/Android wrap if warranted by then.

## 11. Technical Approach (high-level)

This section stays intentionally brief — it records the platform/stack decision behind §7 and §10 so the two stay consistent, not a full architecture design.

- **Client:** single responsive web app (desktop + mobile browser), rather than separate per-platform codebases. Keeps v1 to one build to test, ship, and iterate on.
- **Backend:** a separate service handles transcription orchestration (calling an ASR provider) and the filler-removal/disambiguation logic (B1–B5), rather than doing this in the client — keeps the "what changed and why" audit trail (Epic E) server-side and consistent regardless of which client eventually calls it (web now, potentially native or an API partner later, per G3).
- **Native mobile:** deferred. If pursued later, wrapping the existing web app is the default plan over building separate native codebases, unless a specific native-only capability (background recording, offline/on-device ASR for H1) turns out to be required.

Detailed stack selection (frameworks, ASR vendor, hosting) belongs in a separate technical design doc once this PRD is validated — not duplicated here.

---

*This document defines the product and user experience. §11 records the platform-level delivery decision that shapes scope; detailed implementation (frameworks, vendor choices, code) is intentionally left to a separate technical design doc.*
