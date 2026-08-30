import { describe, expect, it } from "vitest";
import { extractDate, WEEKDAYS } from "@/lib/parser/date";
import { detectNegation } from "@/lib/parser/negation";
import { normalizeCaption } from "@/lib/parser/normalize";

// Every fixture resolves against a FIXED `parsedAt`, never the clock — which is the
// property the whole module exists to have. `scripts/reparse.mjs` (#71) replays old
// posts, so a test that passed only on the day it was written would be describing
// behaviour the re-parse path cannot rely on.
//
// 2026-08-22 is a SATURDAY, and that is load-bearing for the weekday table below:
// it sits mid-week-end, so every other weekday is 1–6 days ahead and none of the
// expected values coincide by accident.
const SATURDAY = "2026-08-22";

// The seven days following SATURDAY, so a weekday expectation can be read off
// directly instead of computed in the test — computing it here would just be the
// implementation restated, and would pass even if both were wrong the same way.
const SUNDAY = "2026-08-23";
const MONDAY = "2026-08-24";
const TUESDAY = "2026-08-25";
const WEDNESDAY = "2026-08-26";
const THURSDAY = "2026-08-27";
const FRIDAY = "2026-08-28";

describe("extractDate", () => {
  describe("idag", () => {
    it.each(["idag", "Idag", "IDAG", "i dag", "I dag"])(
      "resolves %s to the day the post was made",
      (expression) => {
        expect(extractDate(`${expression} lunch`, SATURDAY)).toBe(SATURDAY);
      },
    );

    it("accepts the two-word spelling SAOL prefers", () => {
      // "i dag" is the recommended form, so matching only "idag" would miss the
      // spelling a writer taught the current rules would use.
      expect(extractDate("Vi kör i dag 11-14", SATURDAY)).toBe(SATURDAY);
    });
  });

  describe("imorgon", () => {
    it.each(["imorgon", "Imorgon", "IMORGON", "i morgon", "I morgon"])(
      "resolves %s to the following day",
      (expression) => {
        expect(extractDate(`${expression} Heden`, SATURDAY)).toBe(SUNDAY);
      },
    );

    it("does not fire on the noun 'morgon' without its particle", () => {
      // ⚠ THE REGRESSION THIS PINS: `(?:i\s+)?morgon` would match the greeting and
      // pin a truck that is open today on tomorrow's date instead.
      expect(extractDate("God morgon! Vi står på Heden 11-14", SATURDAY)).toBe(SATURDAY);
      expect(extractDate("God morgon", SATURDAY)).toBe(SATURDAY);
    });

    it("does not fire inside a longer word starting with 'morgon'", () => {
      // "i morgondagens meny" is a genitive noun phrase, not the adverb.
      expect(extractDate("Vi berättar om i morgondagens meny", SATURDAY)).toBe(SATURDAY);
    });
  });

  describe("named weekdays", () => {
    it.each([
      ["måndag", MONDAY],
      ["tisdag", TUESDAY],
      ["onsdag", WEDNESDAY],
      ["torsdag", THURSDAY],
      ["fredag", FRIDAY],
      ["lördag", SATURDAY],
      ["söndag", SUNDAY],
    ])("resolves %s to the nearest upcoming occurrence", (weekday, expected) => {
      expect(extractDate(`Vi står på Heden på ${weekday}`, SATURDAY)).toBe(expected);
    });

    it("resolves the parsedAt weekday to parsedAt itself, not seven days on", () => {
      // The acceptance criterion that separates `(target - current + 7) % 7` from a
      // "strictly future" reading. A truck posting "Lördag 11-14" on a Saturday
      // means THIS Saturday; +7 would pin it a week out and show nothing today.
      expect(extractDate("Lördag 11-14 på Järntorget", SATURDAY)).toBe(SATURDAY);
    });

    it("needs no preposition before the weekday", () => {
      // "Söndag 11-14" — leading with the day is the common caption shape.
      expect(extractDate("Söndag 11-14 Lindholmen", SATURDAY)).toBe(SUNDAY);
      expect(extractDate("På söndag 11-14", SATURDAY)).toBe(SUNDAY);
      expect(extractDate("I söndag kör vi", SATURDAY)).toBe(SUNDAY);
    });

    it.each(["söndag", "söndagen", "söndagar", "söndagarna"])(
      "matches the inflected form %s",
      (form) => {
        // Swedish inflects weekdays and captions use every form. Listing only the
        // stem made the first of these match and the rest miss (process-log #86).
        expect(extractDate(`Vi kör på ${form}`, SATURDAY)).toBe(SUNDAY);
      },
    );

    it("is never in the past, for every combination of weekday and post day", () => {
      // The property behind the individual cases: whatever day a post is made and
      // whatever day it names, the answer is that day or later. A missing `+ 7` in
      // the modulo, or a stray sign, produces a negative delta for some pair — and
      // a pin dated yesterday is invisible on the map.
      //
      // Walks a full week of post days so no single `parsedAt` can hide it.
      const postDays = [
        SATURDAY,
        SUNDAY,
        MONDAY,
        TUESDAY,
        WEDNESDAY,
        THURSDAY,
        FRIDAY,
      ];

      for (const parsedAt of postDays) {
        for (const weekday of WEEKDAYS) {
          const resolved = extractDate(`Vi kör på ${weekday}`, parsedAt);

          expect(resolved >= parsedAt).toBe(true);
          // And within the coming week — a correct nearest-occurrence never
          // overshoots by more than six days.
          expect(daysBetween(parsedAt, resolved)).toBeLessThanOrEqual(6);
        }
      }
    });

    it("uses \\p{L} boundaries, so a weekday stem inside a longer word is not a match", () => {
      // ⚠ WHY `\b` IS WRONG HERE. `\w` excludes å, ä and ö, so `/\bsöndag\b/`
      // matches inside "söndagsöppet" — the "ö" reads as a word boundary. Swedish
      // compounds are built by exactly this concatenation, so the lookarounds have
      // to be `\p{L}`-based. This assertion is what makes the copy of that idiom in
      // `date.ts` trustworthy rather than merely intended.
      //
      // ⚠ THIS PINS THE MECHANISM AND THE CURRENT BEHAVIOUR — it does NOT assert
      // that not matching is the right answer. An earlier version of this test ran
      // those two claims together, and they are separate: `\b` is wrong for Swedish
      // regardless, while whether "söndagsöppet" SHOULD resolve to Sunday is an open
      // question listed under KNOWN LIMITS in `date.ts`. These compounds do name
      // their day, so today's answer can be a day early. If that limit is ever
      // closed, this test changes on purpose rather than looking like a regression.
      expect(extractDate("Söndagsöppet som vanligt", SATURDAY)).toBe(SATURDAY);
      expect(extractDate("Vi har fredagsmys ikväll", SATURDAY)).toBe(SATURDAY);
      expect(extractDate("Lördagsöppet 11-14 på Heden", "2026-08-20")).toBe("2026-08-20");
    });

    it("does not resolve the past form 'i fredags' to the coming Friday", () => {
      // "i fredags" means LAST Friday. The inflection list deliberately omits `s`
      // so this falls through to parsedAt rather than resolving forward — the one
      // direction the module must never take a backward-looking caption.
      expect(extractDate("Som vi sa i fredags kör vi vidare", SATURDAY)).toBe(SATURDAY);
      expect(extractDate("Tack alla som kom i söndags", SATURDAY)).toBe(SATURDAY);
    });

    it.each(["Förra", "Senaste", "Föregående"])(
      "does not resolve '%s fredagen' forward to the coming Friday",
      (modifier) => {
        // ⚠ THE OTHER HALF OF THE BACKWARD-REFERENCE GUARD, and the half the `s`
        // omission does not cover: these take the ordinary definite inflection, so
        // the stem matches cleanly. Before `BACKWARD_MODIFIERS` existed, "Förra
        // fredagen var kul" resolved to 2026-08-28 — six days FORWARD, in the one
        // direction the module documents that it never goes (PR #83 review).
        expect(extractDate(`${modifier} fredagen var kul`, SATURDAY)).toBe(SATURDAY);
      },
    );

    it.each([
      ["Sista fredagen i månaden kör vi på Heden", FRIDAY],
      ["Sista söndagen i månaden är det marknad", SUNDAY],
    ])("resolves the forward-looking 'sista' in %s", (caption, expected) => {
      // ⚠ THE r1 OVERCORRECTION, pinned so it cannot come back. `sista` was in
      // BACKWARD_MODIFIERS for one round, and it is the one member with an ordinary
      // FORWARD reading — "the last Friday of the month" is a recurring slot, and
      // "sista söndagen i månaden" is the standard phrasing for a monthly market.
      // Suppressing them returned the posting day: a wrong pin TODAY, worse than the
      // wrong future day the guard was added to prevent (PR #83 r2).
      expect(extractDate(caption, SATURDAY)).toBe(expected);
    });

    it("requires the backward modifier to be a whole word, not a word ending", () => {
      // ⚠ The lookbehind had no left boundary for one round, so it matched the
      // SUFFIX of a longer word and silently suppressed the date behind it — the
      // unbounded-token class `BEFORE` and `AFTER` prevent everywhere else in this
      // module, while the guard's own comment claimed it spanned one word (PR #83 r2).
      //
      // "allrasenaste" ends in "senaste" and is a probe, not a caption anyone is
      // likely to post. It has to be: the case that ORIGINALLY exposed this was
      // "Nästsista fredagen", and removing `sista` from the list in the same round
      // made that fixture stop engaging the guard at all — it passed against the
      // unbounded version too, which is the vacuous-fixture trap twice in one file.
      // Mutation-verified: dropping the inner boundary fails this.
      //
      // FRIDAY rather than a nearer weekday on purpose — "lördagen" would resolve to
      // SATURDAY, which is also `parsedAt`, so a suppressed match and a successful
      // one would give the same answer and the assertion would prove nothing.
      expect(extractDate("Allrasenaste fredagen var kul, vi ses snart", SATURDAY)).toBe(FRIDAY);
    });

    it("suppresses only the position it guards, not the rest of the caption", () => {
      // The modifier must be ADJACENT: an earlier "förra" must not silence a
      // weekday later in the caption.
      expect(extractDate("Förra veckan var lugn, på fredag kör vi", SATURDAY)).toBe(FRIDAY);
      expect(extractDate("Vi minns förra lördagen. På söndag kör vi", SATURDAY)).toBe(SUNDAY);
      // And a suppressed weekday does not consume the match — a later, unguarded
      // one still wins.
      expect(extractDate("Förra fredagen var kul, på måndag kör vi", SATURDAY)).toBe(MONDAY);
    });

    it("governs the weekday branch only, and nothing else in the alternation", () => {
      // ⚠ A SYNTHETIC PROBE, not a caption anyone would write — and that is the
      // point. The previous version of this test claimed this scope and could not
      // detect losing it: both its fixtures put an intervening clause between the
      // modifier and the date word, so hoisting the lookbehind to cover `today` and
      // `tomorrow` left them green. It tested non-adjacency twice and named it
      // scope — the vacuous-fixture failure this project logged as row 43.
      //
      // Placing the modifier DIRECTLY before each branch is the only way to tell the
      // two scopes apart. "förra imorgon" is not Swedish, which is precisely why no
      // realistic caption can pin this and a probe has to.
      expect(extractDate("förra imorgon", SATURDAY)).toBe(SUNDAY);
      expect(extractDate("förra i morgon", SATURDAY)).toBe(SUNDAY);
    });

    it("falls back rather than guessing when case folding matches a word it cannot identify", () => {
      // The `iu` regex matches by Unicode CASE FOLDING while the weekday lookup is
      // exact equality, and folding is the wider relation: U+017F (ſ, long s) folds
      // to "s", so "tiſdag" matches the pattern and then fails the lookup. Behind
      // the `as` cast this module used to carry, `indexOf` returned -1 and the
      // modulo turned it into a plausible WRONG day — Sunday for a caption naming
      // Tuesday (PR #83 review). A silent wrong date is the failure worth pinning.
      expect(extractDate("Vi kör på tiſdag", SATURDAY)).toBe(SATURDAY);
    });
  });

  describe("no date expression", () => {
    it("falls back to the day the post was made", () => {
      expect(extractDate("Vi står på Järntorget 11-14", SATURDAY)).toBe(SATURDAY);
    });

    it("falls back on an empty caption", () => {
      expect(extractDate("", SATURDAY)).toBe(SATURDAY);
    });

    it("gives the right date for same-day words it does not know", () => {
      // "ikväll", "inatt" and "i eftermiddag" all name a time ON the day of the
      // post, so the fallback resolves them correctly without an entry of their
      // own. `extractTime` (#58) is what reads the time out of them.
      expect(extractDate("Vi kör ikväll 17-21", SATURDAY)).toBe(SATURDAY);
      expect(extractDate("Öppet i eftermiddag", SATURDAY)).toBe(SATURDAY);
    });
  });

  describe("several dates in one caption", () => {
    it("takes the first expression, which is the day the post is about", () => {
      // "Idag Heden, imorgon Lindholmen" is the ordinary two-day caption. Preferring
      // the later or the more specific expression would move today's truck to
      // tomorrow and leave the map empty on the day the post was made.
      expect(extractDate("Idag Heden 11-14, imorgon Lindholmen", SATURDAY)).toBe(SATURDAY);
      expect(extractDate("Imorgon Heden, på måndag Lindholmen", SATURDAY)).toBe(SUNDAY);
    });

    it("takes the first even when a weekday precedes a relative word", () => {
      // Documents the cost of the rule rather than hiding it: a caption leading with
      // a future day resolves to that day.
      expect(extractDate("På måndag Lindholmen, idag är vi på Heden", SATURDAY)).toBe(MONDAY);
    });

    it("takes the date from a LEADING cancellation tag — #80's case, pinned here", () => {
      // ⚠ ASSERTS A KNOWN WRONG ANSWER ON PURPOSE. Since #78 stopped deleting tag
      // text, a leading "#StängtPåSöndag" puts the day the truck is CLOSED first, so
      // first-match-wins returns Sunday for a post about today.
      //
      // Nothing is mis-pinned today: `detectNegation` fires on this caption and
      // `parseCaption` bails before the date is used. It goes live exactly when #80
      // stops the negation cancelling today — so this is the regression test for a
      // defect that does not exist yet, and #80 should flip it rather than meet it.
      // Fixing it here would mean teaching this module the negation vocabulary,
      // which is the layering inversion `normalize.ts` refuses for the same reason.
      const leading = normalizeCaption("#StängtPåSöndag Heden 11-14 idag!");
      expect(extractDate(leading, SATURDAY)).toBe(SUNDAY);
      expect(detectNegation(leading)).toBe(true);

      // The trailing form, which the PR body originally claimed for both, is fine.
      const trailing = normalizeCaption("Heden 11-14 idag! #StängtPåSöndag");
      expect(extractDate(trailing, SATURDAY)).toBe(SATURDAY);
    });
  });

  describe("calendar arithmetic", () => {
    // These are why the module does its arithmetic in UTC rather than anchoring a
    // date to an invented time of day in Europe/Stockholm. Anchored at Stockholm
    // midnight, "+ 24 hours" lands on 01:00 the next day at the March boundary and
    // 23:00 the SAME day at the October one — the second silently returns the wrong
    // date. UTC has no offset and no DST, so none of these is a special case.

    it("crosses the Stockholm DST start correctly", () => {
      // 2026-03-29 is the 23-hour day.
      expect(extractDate("imorgon", "2026-03-28")).toBe("2026-03-29");
      expect(extractDate("imorgon", "2026-03-29")).toBe("2026-03-30");
    });

    it("crosses the Stockholm DST end correctly", () => {
      // 2026-10-25 is the 25-hour day.
      expect(extractDate("imorgon", "2026-10-24")).toBe("2026-10-25");
      expect(extractDate("imorgon", "2026-10-25")).toBe("2026-10-26");
    });

    it("crosses a month boundary", () => {
      expect(extractDate("imorgon", "2026-08-31")).toBe("2026-09-01");
    });

    it("crosses a year boundary", () => {
      expect(extractDate("imorgon", "2026-12-31")).toBe("2027-01-01");
      // 2027-01-01 is a Friday, so the coming Monday is the 4th — a weekday jump
      // across the same boundary, which is the case a day-of-month increment breaks.
      expect(extractDate("på måndag", "2026-12-31")).toBe("2027-01-04");
    });

    it("handles a leap day", () => {
      expect(extractDate("imorgon", "2028-02-28")).toBe("2028-02-29");
      expect(extractDate("imorgon", "2028-02-29")).toBe("2028-03-01");
    });

    it("always returns a yyyy-MM-dd string", () => {
      // Zero-padding is easy to lose when a date is rebuilt from its fields, and an
      // unpadded "2026-9-1" reaches Postgres as a different value or not at all.
      for (const parsedAt of ["2026-01-05", "2026-09-01", "2026-12-31"]) {
        for (const caption of ["idag", "imorgon", "på måndag", "inget datum"]) {
          expect(extractDate(caption, parsedAt)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        }
      }
    });
  });

  describe("an unusable parsedAt is returned untouched", () => {
    // The caller owns `parsedAt` (#67 derives it), so these should be unreachable.
    // They are asserted because the UNGUARDED path throws rather than degrading —
    // `new Date(NaN).toISOString()` is a RangeError — and this module runs inside
    // `after()`, where a throw is an unhandled rejection that loses the post.
    it.each([
      ["not a date at all", "not-a-date"],
      ["an empty string", ""],
      ["a timestamp rather than a date", "2026-08-22T10:00:00Z"],
      ["a two-digit year, which Date.UTC would map into the 1900s", "26-08-22"],
      ["an impossible day, which Date.UTC would roll forward", "2026-02-31"],
      ["an impossible month", "2026-13-01"],
      ["an unpadded date", "2026-8-2"],
    ])("returns %s unchanged instead of throwing", (_why, parsedAt) => {
      expect(() => extractDate("imorgon", parsedAt)).not.toThrow();
      expect(extractDate("imorgon", parsedAt)).toBe(parsedAt);
    });
  });

  describe("composed with normalizeCaption", () => {
    // ⚠ TESTED AS A COMPOSITION ON PURPOSE. The NFD bug (#56) was invisible in both
    // modules' own tests and lived only in the handoff between them: text from Apple
    // devices arrives with "ä" decomposed, and every pattern here silently fails to
    // match it. `normalizeCaption` composes to NFC, and that is the contract this
    // module depends on.
    it("resolves a date word that arrives decomposed (NFD)", () => {
      // "lördag" with a combining diaeresis rather than a single codepoint.
      const decomposed = "Vi kör pä lördag".normalize("NFD");

      expect(extractDate(normalizeCaption(decomposed), SATURDAY)).toBe(SATURDAY);
    });

    it.each([
      ["#idag", SATURDAY],
      ["#Imorgon", SUNDAY],
      ["#PåSöndag", SUNDAY],
      ["#söndag", SUNDAY],
    ])("resolves the date carried by the tag %s", (tag, expected) => {
      // #78 stopped deleting tag text and started segmenting it, so date words now
      // reach this module from hashtags — input it would never have seen before.
      expect(extractDate(normalizeCaption(`Heden 11-14 ${tag}`), SATURDAY)).toBe(expected);
    });

    it("resolves a date out of a run-together tag", () => {
      // "#Lunch11-14Imorgon" segments to "Lunch 11-14 Imorgon" (#78).
      expect(extractDate(normalizeCaption("#Lunch11-14Imorgon Heden"), SATURDAY)).toBe(SUNDAY);
    });

    it("survives an emoji used as a separator", () => {
      // `normalizeCaption` turns an emoji into a space; without that "Järntorget🌮imorgon"
      // is one token and nothing in it matches.
      expect(extractDate(normalizeCaption("Järntorget🌮imorgon"), SATURDAY)).toBe(SUNDAY);
    });
  });
});

// Whole days between two yyyy-MM-dd strings. Deliberately not the module's own
// helper: a test that reuses the implementation's arithmetic cannot detect an error
// in it. `Date.parse` on a date-only string is UTC by spec, so this is exact.
function daysBetween(from: string, to: string): number {
  return (Date.parse(to) - Date.parse(from)) / 86_400_000;
}
