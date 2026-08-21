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

/**
 * Deletes only the exact substrings the model returned, in order of where they
 * occur in the source text. This is what makes "never substitutes/adds words"
 * a structural guarantee rather than a prompt instruction: the model can only
 * choose *which* verbatim spans disappear, never emit new text.
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
