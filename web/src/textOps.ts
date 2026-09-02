export interface Span {
  start: number;
  end: number;
}

/**
 * Deletes the given spans from verbatim and normalizes surrounding
 * punctuation/spacing. Mirrors the merge/normalize half of
 * server/src/clean.ts's applyRemovals -- the safety decision (which spans
 * are OK to delete) already happened server-side for confidently-removed
 * spans, and is exactly what a user's "Remove" click represents for a
 * flagged span, so this only needs to redo the mechanical deletion, not
 * re-validate it.
 */
export function buildCleanText(verbatim: string, spans: Span[]): string {
  const sorted = [...spans].sort((a, b) => a.start - b.start);

  let clean = "";
  let cursor = 0;
  for (const span of sorted) {
    if (span.start < cursor) continue; // overlapping/duplicate, skip
    clean += verbatim.slice(cursor, span.start);
    cursor = span.end;
    // If the removed span consumed all separating whitespace, deleting it
    // would otherwise glue the surrounding words together.
    const before = clean.slice(-1);
    const after = verbatim[cursor] ?? "";
    if (/\w/.test(before) && /\w/.test(after)) {
      clean += " ";
    }
  }
  clean += verbatim.slice(cursor);

  clean = clean
    .replace(/\s+([,.!?])/g, "$1")
    .replace(/,\s*([.!?])/g, "$1")
    .replace(/([,.!?])\1+/g, "$1")
    .replace(/\s{2,}/g, " ")
    .replace(/^[,.\s]+/, "")
    .trim();
  if (clean.length > 0) {
    clean = clean[0].toUpperCase() + clean.slice(1);
  }
  return clean;
}

export interface WordToken {
  text: string;
  start: number; // verbatim-space offset, not offset within the kept text
  end: number;
  isWord: boolean;
}

/**
 * Walks verbatim, skipping any already-removed spans, and tokenizes the
 * remaining ("kept") text into words and separators -- each token carries
 * its true verbatim-space offset. Needed for manual deletion mode: a click
 * on a rendered word has to be translated back into a {start,end} span that
 * fits the same buildCleanText/VerbatimView pipeline every other removal
 * source already uses, not just spliced out of whatever string happens to
 * be on screen.
 */
export function tokenizeKeptText(verbatim: string, alreadyRemoved: Span[]): WordToken[] {
  const sorted = [...alreadyRemoved].sort((a, b) => a.start - b.start);
  const tokens: WordToken[] = [];
  const wordPattern = /[a-zA-Z']+|[^a-zA-Z']+/g;

  function tokenizeRange(rangeStart: number, rangeEnd: number) {
    const slice = verbatim.slice(rangeStart, rangeEnd);
    const pattern = new RegExp(wordPattern);
    let m: RegExpExecArray | null;
    while ((m = pattern.exec(slice)) !== null) {
      tokens.push({
        text: m[0],
        start: rangeStart + m.index,
        end: rangeStart + m.index + m[0].length,
        isWord: /^[a-zA-Z']+$/.test(m[0]),
      });
    }
  }

  let cursor = 0;
  for (const span of sorted) {
    if (span.start < cursor) continue; // overlapping/duplicate, skip
    tokenizeRange(cursor, span.start);
    cursor = span.end;
  }
  tokenizeRange(cursor, verbatim.length);

  return tokens;
}
