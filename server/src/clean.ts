import Anthropic from "@anthropic-ai/sdk";

let anthropic: Anthropic | undefined;

function getClient(): Anthropic {
  if (!anthropic) anthropic = new Anthropic();
  return anthropic;
}

export interface RemovedSpan {
  text: string;
  start: number;
  end: number;
}

export interface CleanResult {
  clean: string;
  removedSpans: RemovedSpan[];
}

const REMOVE_FILLERS_TOOL: Anthropic.Tool = {
  name: "remove_fillers",
  description:
    "Report the exact substrings to delete from the verbatim transcript to produce a clean, publish-ready version.",
  input_schema: {
    type: "object",
    properties: {
      spans_to_remove: {
        type: "array",
        description:
          "Exact substrings (verbatim, character-for-character, including surrounding filler punctuation like commas) to delete. Do not include partial words, rewrites, or paraphrases here — only text that should be deleted as-is.",
        items: { type: "string" },
      },
    },
    required: ["spans_to_remove"],
  },
};

const SYSTEM_PROMPT = `You clean spoken-word transcripts by identifying disfluencies to delete. You NEVER rewrite, reorder, or add words — you only identify exact spans of the original text to remove.

Standard aggressiveness — remove:
- Filled pauses: um, uh, er, erm
- Discourse/crutch phrases used as filler: like, you know, I mean, so (sentence-starting), actually, basically, kind of, sort of, right? (as a tic) — but only when they are NOT meaningful (e.g. keep "I like pizza", remove ", like," in "it was, like, really good")
- Exact word repetitions: "the the" -> keep one "the"

Do NOT remove:
- False starts / self-corrections (out of scope for this pass)
- Any word that changes the meaning of the sentence if deleted
- Content words, even if informal

CRITICAL — each span must be minimal and contiguous filler ONLY. Never let one span bridge across a content word to reach a second filler later in the sentence, even if it "reads cleaner" that way. If two fillers are separated by real content, return TWO separate spans, not one that swallows what's between them.

Example — "All right, so I just, you know, want to make sure it works":
- WRONG: one span "so I just, you know, want" (deletes the real words "I just" and "want")
- RIGHT: two spans "so " and ", you know," (keeps "I just" and "want" intact)

"so" is ambiguous — decide based on function, not just position:
- Discourse "so" (filler, remove): "Hey, so, I am starting to trade..." — just eases into the statement, no causal link to what follows. Deleting it changes nothing.
- Causal "so" (keep): "The setup was invalidated, so I closed the position." — expresses "as a result of"; deleting it breaks the logical link between the two clauses.

Return your answer only via the remove_fillers tool. Each entry in spans_to_remove must be copied EXACTLY (character for character) from the transcript you were given, so it can be located with a plain substring search. If nothing should be removed, return an empty array.`;

// Naive stand-in for the contextual disambiguation Claude does (PRD B4) —
// matches filler words regardless of meaningful use, so it will over-remove
// (e.g. "I like pizza"). Good enough to exercise the UI pipeline, not to
// evaluate cleanup quality.
const MOCK_FILLER_PATTERN =
  /\b(um+|uh+|erm?)\b,?\s*|\b(\w+)\s+\2\b(?=\s)|,?\s*\b(like|you know|basically|actually|kind of|sort of)\b,?\s*/gi;

function mockClean(verbatim: string): CleanResult {
  const spans: string[] = [];
  let match: RegExpExecArray | null;
  const pattern = new RegExp(MOCK_FILLER_PATTERN);
  while ((match = pattern.exec(verbatim)) !== null) {
    spans.push(match[0]);
  }
  return applyRemovals(verbatim, spans);
}

export async function cleanTranscript(verbatim: string): Promise<CleanResult> {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.warn("[clean] ANTHROPIC_API_KEY not set — using naive regex mock instead of Claude.");
    return mockClean(verbatim);
  }
  const message = await getClient().messages.create({
    model: "claude-sonnet-5",
    max_tokens: 2048,
    system: SYSTEM_PROMPT,
    tools: [REMOVE_FILLERS_TOOL],
    tool_choice: { type: "tool", name: "remove_fillers" },
    messages: [
      {
        role: "user",
        content: `Transcript:\n\n${verbatim}`,
      },
    ],
  });

  const toolUse = message.content.find(
    (block): block is Anthropic.ToolUseBlock => block.type === "tool_use"
  );
  const spans = (toolUse?.input as { spans_to_remove?: string[] })?.spans_to_remove ?? [];

  return applyRemovals(verbatim, spans);
}

// Vocabulary the model is allowed to delete unconditionally. Deliberately
// narrow: it's cheaper to under-remove (leaves a filler in) than to
// over-remove (silently deletes meaning) — PRD Epic B4 calls the latter the
// disqualifying failure mode for this product.
const FILLER_WORD = /^(um+|uh+|erm?|like|you|know|i|mean|kind|of|sort|actually|basically|so|right|well|okay|ok)$/i;

/**
 * A span is safe to delete if EITHER every word in it is drawn from the
 * filler vocabulary above, OR it's a pure adjacent repetition (e.g. the
 * first "the" in "the the") — checked by comparing it to the text
 * immediately before/after it, since a repeated word can be anything and
 * can't be vocabulary-listed. Anything else (e.g. a span that bridges two
 * fillers across a real content word) is rejected outright rather than
 * partially trusted.
 */
function isSafeSpan(span: string, verbatim: string, start: number, end: number): boolean {
  const trimmed = span.trim();
  if (trimmed.length === 0) return true;

  const words = trimmed.split(/[^a-zA-Z']+/).filter(Boolean);
  if (words.length > 0 && words.every((w) => FILLER_WORD.test(w))) return true;

  const normalize = (s: string) => s.trim().toLowerCase().replace(/[^a-z' ]/g, "");
  const len = end - start;
  const before = verbatim.slice(Math.max(0, start - len), start);
  const after = verbatim.slice(end, end + len);
  return normalize(before) === normalize(trimmed) || normalize(after) === normalize(trimmed);
}

/**
 * Deletes only the exact substrings the model returned, in order of where they
 * occur in the source text. This is what makes "never substitutes/adds words"
 * a structural guarantee rather than a prompt instruction: the model can only
 * choose *which* verbatim spans disappear, never emit new text — and even
 * that choice is checked against isSafeSpan before it's trusted.
 */
export function applyRemovals(verbatim: string, spans: string[]): CleanResult {
  const removedSpans: RemovedSpan[] = [];

  // The model returns one array entry per occurrence, so identical filler
  // text (e.g. "um, " said three times) appears as repeated identical
  // strings. Each entry must resolve to its own occurrence, not the same
  // first match every time — track a per-span-text search cursor.
  const searchFrom = new Map<string, number>();
  const matches: { start: number; end: number; text: string }[] = [];
  for (const span of spans) {
    if (!span) continue;
    const from = searchFrom.get(span) ?? 0;
    const idx = verbatim.indexOf(span, from);
    if (idx === -1) continue;
    if (!isSafeSpan(span, verbatim, idx, idx + span.length)) {
      console.warn("[clean] rejected unsafe span (would have removed non-filler content):", JSON.stringify(span));
      searchFrom.set(span, idx + span.length);
      continue;
    }
    matches.push({ start: idx, end: idx + span.length, text: span });
    searchFrom.set(span, idx + span.length);
  }
  matches.sort((a, b) => a.start - b.start);

  let clean = "";
  let cursor = 0;
  for (const m of matches) {
    if (m.start < cursor) continue; // overlapping/duplicate match, skip
    clean += verbatim.slice(cursor, m.start);
    removedSpans.push({ text: m.text, start: m.start, end: m.end });
    cursor = m.end;
    // If the removed span consumed all separating whitespace, deleting it
    // would otherwise glue the surrounding words together (e.g. "and, like, "
    // removed from "and, like, make" -> "andmake"). Re-insert one space.
    const before = clean.slice(-1);
    const after = verbatim[cursor] ?? "";
    if (/\w/.test(before) && /\w/.test(after)) {
      clean += " ";
    }
  }
  clean += verbatim.slice(cursor);

  clean = clean
    .replace(/\s+([,.!?])/g, "$1")
    .replace(/,\s*([.!?])/g, "$1") // dangling comma left behind when a removed span didn't include it, e.g. "recording, ." -> "recording."
    .replace(/([,.!?])\1+/g, "$1") // collapse repeated punctuation, e.g. ",," or ".."
    .replace(/\s{2,}/g, " ")
    .replace(/^[,.\s]+/, "")
    .trim();
  // Capitalize first letter for readability.
  if (clean.length > 0) {
    clean = clean[0].toUpperCase() + clean.slice(1);
  }

  return { clean, removedSpans };
}
