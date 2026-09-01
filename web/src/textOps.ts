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
