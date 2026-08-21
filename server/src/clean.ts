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

export async function cleanTranscript(verbatim: string): Promise<CleanResult> {
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

  const matches: { start: number; end: number; text: string }[] = [];
  for (const span of spans) {
    if (!span) continue;
    const idx = verbatim.indexOf(span, 0);
    if (idx === -1) continue;
    matches.push({ start: idx, end: idx + span.length, text: span });
  }
  matches.sort((a, b) => a.start - b.start);

  let clean = "";
  let cursor = 0;
  for (const m of matches) {
    if (m.start < cursor) continue; // overlapping/duplicate match, skip
    clean += verbatim.slice(cursor, m.start);
    removedSpans.push({ text: m.text, start: m.start, end: m.end });
    cursor = m.end;
  }
  clean += verbatim.slice(cursor);

  clean = clean
    .replace(/\s+([,.!?])/g, "$1")
    .replace(/\s{2,}/g, " ")
    .replace(/^[,.\s]+/, "")
    .trim();
  // Capitalize first letter for readability.
  if (clean.length > 0) {
    clean = clean[0].toUpperCase() + clean.slice(1);
  }

  return { clean, removedSpans };
}
