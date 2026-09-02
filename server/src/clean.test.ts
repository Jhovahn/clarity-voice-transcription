import { describe, it, expect } from "vitest";
import { applyRemovals } from "./clean.js";

describe("applyRemovals", () => {
  it("removes a single filled pause and normalizes surrounding punctuation", () => {
    const { clean, removedSpans } = applyRemovals(
      "So, um, this is a test recording.",
      ["So, um, "]
    );
    expect(clean).toBe("This is a test recording.");
    expect(removedSpans).toHaveLength(1);
  });

  it("removes every occurrence of a repeated identical filler span, not just the first", () => {
    // Regression test: applyRemovals used indexOf(span, 0) for every entry,
    // so three identical "um, " spans all resolved to the same first match
    // and only one "um" ever actually got deleted.
    const { clean } = applyRemovals(
      "Um, so I think, um, this is, um, a good test case, you know.",
      ["Um, so ", "um, ", "um, ", ", you know"]
    );
    expect(clean).not.toContain("um");
    expect(clean).toBe("I think, this is, a good test case.");
  });

  it("does not merge adjacent words when a removed span consumes both surrounding spaces", () => {
    const { clean } = applyRemovals("and, like, make sure", [", like, "]);
    expect(clean).toBe("And make sure");
    expect(clean).not.toContain("andmake");
  });

  it("cleans up a dangling comma left when a span excludes its leading comma", () => {
    const { clean } = applyRemovals(
      "this is a test recording, you know.",
      ["you know"]
    );
    expect(clean).toBe("This is a test recording.");
    expect(clean).not.toMatch(/,\s*\./);
  });

  it("rejects a span that bridges across real content words instead of only filler", () => {
    // Regression test: the model once returned "so I just, you know, want"
    // as a single span, silently deleting the real words "I just" and
    // "want" along with the two actual fillers. This must never be applied.
    // flaggedSpans now reports the extracted filler-only sub-spans rather
    // than the whole bundle -- see the "applyRemovals flaggedSpans splitting"
    // suite below for dedicated coverage of that behavior.
    const verbatim =
      "All right, so I just, you know, want to make sure that everything works as expected.";
    const { clean, removedSpans, flaggedSpans } = applyRemovals(verbatim, [
      "so I just, you know, want",
    ]);
    expect(clean).toBe(verbatim);
    expect(removedSpans).toHaveLength(0);
    expect(flaggedSpans.map((s) => s.text)).toEqual(["so ", ", you know, "]);
  });

  it("still allows the correctly-split version of the same sentence", () => {
    const verbatim =
      "All right, so I just, you know, want to make sure that everything works as expected.";
    const { clean } = applyRemovals(verbatim, ["so ", ", you know,"]);
    expect(clean).toContain("I just");
    expect(clean).toContain("want to make sure");
    expect(clean).not.toContain("you know");
  });

  it("allows an exact adjacent word repetition to be collapsed", () => {
    const { clean } = applyRemovals(
      "I think the the best approach is to just ship it.",
      ["the "]
    );
    expect(clean).toBe("I think the best approach is to just ship it.");
  });

  it("rejects a non-adjacent 'repetition' that isn't actually a duplicate", () => {
    const verbatim = "I think the best approach is to just ship it.";
    const { clean, removedSpans } = applyRemovals(verbatim, ["best "]);
    expect(clean).toBe(verbatim);
    expect(removedSpans).toHaveLength(0);
  });

  it("returns the original text unchanged when no spans are given", () => {
    const verbatim = "This transcript has no filler words in it.";
    const { clean, removedSpans } = applyRemovals(verbatim, []);
    expect(clean).toBe(verbatim);
    expect(removedSpans).toHaveLength(0);
  });

  it("ignores a span that doesn't literally appear in the transcript", () => {
    const verbatim = "This is a clean sentence.";
    const { clean, removedSpans, flaggedSpans } = applyRemovals(verbatim, ["not present"]);
    expect(clean).toBe(verbatim);
    expect(removedSpans).toHaveLength(0);
    // Never located in the transcript, so it isn't evidence the model tried to
    // delete real content — not a review-queue candidate.
    expect(flaggedSpans).toHaveLength(0);
  });
});

describe("applyRemovals flaggedSpans", () => {
  it("reports a rejected span's extracted filler sub-span, offsets slicing back to the original text", () => {
    // Real case found in testing: the model proposed "was like, ", which is
    // rejected because "was" is not in the filler vocabulary. The extracted
    // sub-span is "like, " (plus its leading space) -- "was" itself never
    // appears in flaggedSpans.
    const verbatim = "And then he was like, that is not going to work.";
    const { clean, removedSpans, flaggedSpans } = applyRemovals(verbatim, ["was like, "]);
    expect(clean).toBe(verbatim);
    expect(removedSpans).toHaveLength(0);
    expect(flaggedSpans).toHaveLength(1);
    expect(flaggedSpans[0].text).toBe(" like, ");
    expect(flaggedSpans[0].text).not.toContain("was");
    expect(verbatim.slice(flaggedSpans[0].start, flaggedSpans[0].end)).toBe(flaggedSpans[0].text);
  });

  it("applies the safe span and flags the extracted sub-span when both are proposed together", () => {
    const verbatim = "Um, he was like, that is fine.";
    const { clean, removedSpans, flaggedSpans } = applyRemovals(verbatim, [
      "Um, ",
      "was like, ",
    ]);
    expect(clean).toBe("He was like, that is fine.");
    expect(removedSpans).toHaveLength(1);
    expect(removedSpans[0].text).toBe("Um, ");
    expect(flaggedSpans).toHaveLength(1);
    expect(flaggedSpans[0].text).toBe(" like, ");
    expect(verbatim.slice(flaggedSpans[0].start, flaggedSpans[0].end)).toBe(flaggedSpans[0].text);
  });

  it("is empty when no spans are given", () => {
    const { flaggedSpans } = applyRemovals("This transcript has no filler words in it.", []);
    expect(flaggedSpans).toEqual([]);
  });

  it("is empty when every proposed span is safe", () => {
    const { clean, flaggedSpans } = applyRemovals(
      "So, um, this is a test recording.",
      ["So, um, "]
    );
    expect(clean).toBe("This is a test recording.");
    expect(flaggedSpans).toEqual([]);
  });
});

describe("applyRemovals flaggedSpans splitting (#23)", () => {
  it("splits a bundled rejection into independent filler-only sub-spans instead of flagging the whole bundle", () => {
    const verbatim =
      "All right, so I just, you know, want to make sure that everything works as expected.";
    const { flaggedSpans } = applyRemovals(verbatim, ["so I just, you know, want"]);
    expect(flaggedSpans.map((s) => s.text)).toEqual(["so ", ", you know, "]);
    // Neither extracted sub-span should contain the real content words.
    for (const span of flaggedSpans) {
      expect(span.text).not.toMatch(/\bI\b|\bjust\b|\bwant\b/);
    }
    // And every offset must slice back to its own text exactly.
    for (const span of flaggedSpans) {
      expect(verbatim.slice(span.start, span.end)).toBe(span.text);
    }
  });

  it("falls back to flagging the whole span when it contains no filler-vocabulary words at all", () => {
    // A rejected repetition-check candidate on an unrelated word -- there's
    // nothing to extract, so the original span is flagged unchanged.
    const verbatim = "I think the best approach is to just ship it.";
    const { flaggedSpans } = applyRemovals(verbatim, ["best "]);
    expect(flaggedSpans).toHaveLength(1);
    expect(flaggedSpans[0].text).toBe("best ");
  });

  it("never extracts 'I' alone, even though it individually matches the filler vocabulary (case-insensitive 'i mean')", () => {
    // Regression test: found via manual testing. "so" and "I" are adjacent
    // filler-vocabulary matches (FILLER_WORD is case-insensitive, so "I"
    // matches the "i" entry meant for "i mean"), so the naive run-merge
    // logic would bundle them into one run and extract "so I ", offering to
    // delete the actual word "I". PAIR_PARTNER restricts "i"/"you"/"know"/
    // "mean" to only merge with their specific idiom partner.
    const verbatim = "All right, so I just, you know, want to make sure it works.";
    const { flaggedSpans } = applyRemovals(verbatim, ["so I just, you know, want"]);
    for (const span of flaggedSpans) {
      expect(span.text).not.toMatch(/\bI\b/);
    }
  });

  it("does not extract a lone 'you' or 'know' that isn't paired with its idiom partner", () => {
    const verbatim = "I think you just want to leave.";
    const { flaggedSpans } = applyRemovals(verbatim, ["you just"]);
    // No filler-vocabulary word here is validly extractable alone, so this
    // falls back to flagging the whole (unhelpful, but honest) span.
    expect(flaggedSpans).toHaveLength(1);
    expect(flaggedSpans[0].text).toBe("you just");
  });

  it("still extracts the 'i mean' idiom pair correctly", () => {
    const verbatim = "It was, i mean, a difficult decision honestly.";
    const { flaggedSpans } = applyRemovals(verbatim, ["was, i mean, a"]);
    expect(flaggedSpans.map((s) => s.text)).toEqual([", i mean, "]);
  });

  it("produces non-overlapping sub-spans when a standalone-safe word sits directly next to an idiom pair", () => {
    // Regression test: "so" and "you know" are positionally adjacent with
    // only one separator between them, but don't merge into one run (since
    // "so"+"you" isn't a valid idiom pair). Both runs' leading/trailing
    // separator grabs could otherwise double-claim that same separator
    // token, producing overlapping spans.
    const verbatim = "Well so you know this is tricky honestly.";
    const { flaggedSpans } = applyRemovals(verbatim, ["so you know this"]);
    const sorted = [...flaggedSpans].sort((a, b) => a.start - b.start);
    for (let i = 1; i < sorted.length; i++) {
      expect(sorted[i].start).toBeGreaterThanOrEqual(sorted[i - 1].end);
    }
  });

  it("extracted sub-spans, when actually removed, produce clean readable output", () => {
    const verbatim =
      "All right, so I just, you know, want to make sure that everything works as expected.";
    const { flaggedSpans } = applyRemovals(verbatim, ["so I just, you know, want"]);
    const reapplied = applyRemovals(
      verbatim,
      flaggedSpans.map((s) => s.text)
    );
    expect(reapplied.clean).toBe("All right, I just want to make sure that everything works as expected.");
  });
});
