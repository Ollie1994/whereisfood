import { describe, expect, it } from "vitest";
import { AFTER, alt, BEFORE, escapeRegex, FLAGS } from "./boundary";

// Purity is NOT asserted here — `purity.test.ts` globs this directory.
//
// These are the tests the module had none of when it was extracted, and the gap was
// not free: `escapeRegex` shipped escaping every punctuation-shaped character on the
// argument that "the cost is a redundant backslash". Under the `u` flag that is false
// for most of them, and the module's own comment named the hyphen — the one character
// that made it throw — as its reason to exist. A single build-and-match assertion
// would have caught it (PR #89 review).

// Every ASCII punctuation character, so a literal cannot contain something the
// escaper was never tried against. Written as one string rather than a list because
// the interesting case is exactly a literal that contains ALL of them.
const PUNCTUATION = "!\"#$%&'()*+,-./:;<=>?@[\\]^_`{|}~";

describe("escapeRegex", () => {
  it.each([
    ["a hyphen — the case that threw", "Hisings-Backa"],
    ["a dot", "S:t Sigfrids plan"],
    ["parentheses", "Heden (norra)"],
    ["every ASCII punctuation character at once", `place${PUNCTUATION}name`],
    ["nothing to escape", "Järntorget"],
    ["a backslash", "a\\b"],
    ["a slash", "Kungsgatan/Vasagatan"],
  ])("produces a pattern that builds under the u flag: %s", (_case, literal) => {
    // `\-` outside a character class is a SyntaxError in Unicode mode, not a
    // redundant backslash — so an over-broad escaper throws HERE, at module load in
    // the real code, taking every importer of `location.ts` down with it. The `u`
    // flag is what makes this assertion meaningful; the same patterns build fine
    // without it, which is why nothing else in the codebase caught this.
    expect(() => new RegExp(escapeRegex(literal), FLAGS)).not.toThrow();
  });

  it.each([
    ["a hyphen", "Hisings-Backa", "vi står i hisings-backa idag", "vi står i hisingsxbacka"],
    ["a dot", "S.t Sigfrid", "på s.t sigfrid idag", "på sxt sigfrid idag"],
    ["parentheses", "Heden (norra)", "vid heden (norra) idag", "vid heden norra idag"],
    ["a plus", "A+B torget", "på a+b torget", "på ab torget"],
  ])("matches the literal and nothing that merely looks like it: %s", (_case, literal, hit, miss) => {
    // Both halves matter. Escaping that throws is loud; escaping that silently turns
    // `.` into "any character" is not, and it makes a missing dictionary entry into
    // an over-broad matcher instead of an error anyone would notice.
    const pattern = new RegExp(`${BEFORE}(${escapeRegex(literal)})${AFTER}`, FLAGS);

    expect(pattern.test(hit)).toBe(true);
    expect(pattern.test(miss)).toBe(false);
  });

  it("leaves a literal with nothing special in it untouched", () => {
    expect(escapeRegex("Järntorget")).toBe("Järntorget");
  });

  it("does not escape a hyphen, which needs none outside a character class", () => {
    // Pinned explicitly, because "escape it too, just in case" is exactly the
    // reasoning that broke it — and the resulting pattern is not merely redundant,
    // it is invalid.
    expect(escapeRegex("Hisings-Backa")).toBe("Hisings-Backa");
  });
});

describe("BEFORE and AFTER", () => {
  // These are the shared reason `\b` is not used anywhere in this parser. Asserted
  // here, at the definition, rather than re-derived in each consumer's suite.
  const guarded = new RegExp(`${BEFORE}stängt${AFTER}`, FLAGS);

  it.each([
    ["standing alone", "stängt", true],
    ["between spaces", "vi har stängt idag", true],
    ["after punctuation", "idag: stängt!", true],
    ["inside a Swedish compound, where \\b wrongly sees a boundary", "snöstängt", false],
    ["with letters after", "stängtid", false],
    ["with a digit in front", "3stängt", false],
  ])("%s", (_case, input, expected) => {
    expect(guarded.test(input)).toBe(expected);
  });

  it("is what \\b gets wrong", () => {
    // The concrete claim the comment in `boundary.ts` makes, verified rather than
    // asserted in prose: `\w` is ASCII, so "ö" reads as a non-word character and
    // manufactures a boundary in the middle of a Swedish compound.
    expect(/\bstängt\b/iu.test("snöstängt")).toBe(true);
    expect(guarded.test("snöstängt")).toBe(false);
  });
});

describe("alt", () => {
  it("builds a non-capturing alternation", () => {
    // Non-capturing matters: `location.ts` and `address.ts` both read groups by
    // index, and a capturing `alt` would silently renumber them.
    const pattern = new RegExp(`(${alt(["a", "b"])})`, FLAGS);

    expect(pattern.exec("b")?.slice(0, 3)).toEqual(["b", "b"]);
  });
});
