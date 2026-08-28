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
    const verbatim =
      "All right, so I just, you know, want to make sure that everything works as expected.";
    const { clean, removedSpans, flaggedSpans } = applyRemovals(verbatim, [
      "so I just, you know, want",
    ]);
    expect(clean).toBe(verbatim);
    expect(removedSpans).toHaveLength(0);
    expect(flaggedSpans).toHaveLength(1);
    expect(flaggedSpans[0].text).toBe("so I just, you know, want");
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
  it("reports a rejected span with offsets that slice back to the exact original text", () => {
    // Real case found in testing: the model proposed "was like, ", which is
    // rejected because "was" is not in the filler vocabulary.
    const verbatim = "And then he was like, that is not going to work.";
    const { clean, removedSpans, flaggedSpans } = applyRemovals(verbatim, ["was like, "]);
    expect(clean).toBe(verbatim);
    expect(removedSpans).toHaveLength(0);
    expect(flaggedSpans).toHaveLength(1);
    expect(flaggedSpans[0].text).toBe("was like, ");
    expect(verbatim.slice(flaggedSpans[0].start, flaggedSpans[0].end)).toBe("was like, ");
  });

  it("applies the safe span and flags the unsafe one when both are proposed together", () => {
    const verbatim = "Um, he was like, that is fine.";
    const { clean, removedSpans, flaggedSpans } = applyRemovals(verbatim, [
      "Um, ",
      "was like, ",
    ]);
    expect(clean).toBe("He was like, that is fine.");
    expect(removedSpans).toHaveLength(1);
    expect(removedSpans[0].text).toBe("Um, ");
    expect(flaggedSpans).toHaveLength(1);
    expect(flaggedSpans[0].text).toBe("was like, ");
    expect(verbatim.slice(flaggedSpans[0].start, flaggedSpans[0].end)).toBe("was like, ");
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
