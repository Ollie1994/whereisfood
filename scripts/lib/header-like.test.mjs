import { describe, expect, it } from "vitest";
import { headerLike } from "./header-like.mjs";

// The regex headerLike() replaced, kept as the oracle: its answers are the spec, only its
// time on long lines was wrong (IS #348).
const ORACLE = /(?:--|\/\*)\s*[^\s:]+(?:[ \t]+[^\s:]+){0,2}\s*:/;

// Every line up to a length over an alphabet, where headerLike and the oracle differ (the
// first five).
function mismatches(alphabet, maxLength) {
  const found = [];
  const line = [];
  const visit = () => {
    const text = line.join("");
    if (headerLike(text) !== ORACLE.test(text) && found.length < 5) found.push(JSON.stringify(text));
    if (line.length === maxLength) return;
    for (const ch of alphabet) {
      line.push(ch);
      visit();
      line.pop();
    }
  };
  visit();
  return found;
}

describe("headerLike", () => {
  // The openers' characters, the separators words allow (space, tab), whitespace they don't
  // (\v, \r), a colon and a word letter.
  it("answers as the regex it replaced on every line of up to six of nine characters", () => {
    expect(mismatches(["-", "/", "*", " ", "\t", "\v", ":", "a", "\r"], 6)).toEqual([]);
  });

  // Long enough for three and four words after an opener (`--a a a:` is 8 characters,
  // `--a a a a:` 10), which six characters can't reach: a limit of two words passed the
  // test above.
  it("answers as the regex it replaced on every line of up to ten of four characters", () => {
    expect(mismatches(["-", " ", "a", ":"], 10)).toEqual([]);
  });

  it("finds a header-like comment, and passes prose", () => {
    expect(headerLike("-- red: the constraint > lets a window overlap")).toBe(true);
    expect(headerLike("select 1; -- run: schema")).toBe(true);
    expect(headerLike("/* green : x")).toBe(true);
    expect(headerLike("-- the seed trucks: share windows")).toBe(true);
    expect(headerLike("-- the seed's four trucks: share windows")).toBe(false);
    expect(headerLike("-- The seed's trucks share their 11:00–14:00 windows")).toBe(false);
    expect(headerLike("delete from locations;")).toBe(false);
  });

  // A bound far above the scan's time and below a quadratic form's: the old regex took about
  // 80 ms for 8 000 dashes, its time growing with the square of the length (IS #348's PR),
  // so seconds for 100 000. Not a million: a quadratic form runs to the end before the
  // assert can fail, which there took minutes (a synchronous call can't be cut off).
  it("scans a line of a hundred thousand dashes in well under a second", () => {
    const start = performance.now();
    expect(headerLike("-".repeat(100_000))).toBe(false);
    expect(performance.now() - start).toBeLessThan(1000);
  });
});
