import { describe, expect, it } from "vitest";
import { extractTime } from "@/lib/parser/time";
import { normalizeCaption } from "@/lib/parser/normalize";

// Every fixture uses a FIXED date, never the clock. Two are chosen so the offset is
// visible in the expected values rather than hidden behind a helper: expressing the
// expectation as a literal UTC instant is what makes a wrong offset a failing test
// instead of a matching bug on both sides.
const SUMMER = "2026-08-22"; // CEST, UTC+2
const WINTER = "2026-01-15"; // CET,  UTC+1

// Sweden's 2026 transitions. The gap day is where the never-negative invariant is
// actually at risk — 02:00–02:59 does not exist.
const DST_START = "2026-03-29"; // 02:00 -> 03:00, the missing hour
const DST_END = "2026-10-25"; // 03:00 -> 02:00, the doubled hour

const hours = (a: string, b: string) => (Date.parse(b) - Date.parse(a)) / 3_600_000;

describe("extractTime", () => {
  describe("explicit ranges", () => {
    it("parses a plain hour range in summer", () => {
      expect(extractTime("Vi står på Heden 11-14", SUMMER)).toEqual({
        startsAt: "2026-08-22T09:00:00.000Z",
        endsAt: "2026-08-22T12:00:00.000Z",
        kind: "range",
      });
    });

    it("applies the winter offset, not a hardcoded one", () => {
      // The same wall clock is a different instant in January. A module that baked
      // in +2 would pass every summer fixture and be wrong for five months a year.
      expect(extractTime("Heden 11-14", WINTER)).toEqual({
        startsAt: "2026-01-15T10:00:00.000Z",
        endsAt: "2026-01-15T13:00:00.000Z",
        kind: "range",
      });
    });

    it.each([
      ["dotted", "11.30-13.00"],
      ["colon", "11:30-13:00"],
      ["mixed separators", "11.30-13:00"],
      ["spaced dash", "11:30 - 13:00"],
      ["en dash", "11:30–13:00"],
      ["em dash", "11:30—13:00"],
    ])("parses the %s form to the same window", (_label, caption) => {
      // These are one time written several ways, not several vocabularies.
      expect(extractTime(caption, SUMMER)).toEqual({
        startsAt: "2026-08-22T09:30:00.000Z",
        endsAt: "2026-08-22T11:00:00.000Z",
        kind: "range",
      });
    });

    it.each([
      ["a full stop", "Öppet 11-14. Välkomna!"],
      ["a full stop with minutes", "Öppet 11:00-14:00."],
      ["end of caption", "Vi står på Heden 11-14."],
      ["a comma", "Öppet 11-14, välkomna"],
      ["an exclamation", "Öppet 11-14! Kom förbi"],
      ["a closing paren", "Vi står på Heden (11-14)"],
      // The LEADING half of the same bug: an abbreviation's full stop sits directly
      // against the digits, and the strict guard treated it as part of the number.
      // "kl.11-14" degraded to a marked start at 11:00, silently losing the close.
      // Mutation-verified separately — reverting only the leading guard fails here.
      ["a period directly before the digits", "Öppet kl.11-14"],
      ["that period plus a trailing one", "Öppet kl.11-14. Välkomna"],
    ])("reads a range preceded or followed by %s", (_label, caption) => {
      // ⚠ THE GAP 47 TESTS MISSED: not one of them put punctuation after a time.
      // The trailing guard rejected any `.` or `:`, so an ordinary Swedish sentence
      // ending made the whole range unmatchable and the caption returned null
      // (PR #84 review). A period after a time is the common shape, not an edge.
      expect(extractTime(caption, SUMMER)).toEqual({
        startsAt: "2026-08-22T09:00:00.000Z",
        endsAt: "2026-08-22T12:00:00.000Z",
        kind: "range",
      });
    });

    it("does not silently degrade a punctuated range to a marked start", () => {
      // The worst form of the bug above, because it LOOKED like it worked: the range
      // failed on the full stop, `MARKED_START` then matched "kl 11", and the stated
      // 14:00 close disappeared with nothing to signal it.
      expect(extractTime("Öppet kl 11-14. Välkomna", SUMMER)).toEqual({
        startsAt: "2026-08-22T09:00:00.000Z",
        endsAt: "2026-08-22T12:00:00.000Z",
        kind: "range",
      });
    });

    it("reads a range with no minutes on one side", () => {
      expect(extractTime("Öppet 11-14.30", SUMMER)).toEqual({
        startsAt: "2026-08-22T09:00:00.000Z",
        endsAt: "2026-08-22T12:30:00.000Z",
        kind: "range",
      });
    });
  });

  describe("the midnight roll", () => {
    it("rolls 22-01 to the following day and yields three hours", () => {
      // The named case from the plan (#5): "22-01" must be a 3 h window, never
      // negative.
      const result = extractTime("Järntorget 22-01", SUMMER);

      expect(result).toEqual({
        startsAt: "2026-08-22T20:00:00.000Z",
        endsAt: "2026-08-22T23:00:00.000Z",
        kind: "range",
      });
      expect(hours(result!.startsAt, result!.endsAt!)).toBe(3);
    });

    it("rolls across a month boundary", () => {
      const result = extractTime("22-01", "2026-08-31");

      expect(result?.endsAt).toBe("2026-08-31T23:00:00.000Z");
      expect(hours(result!.startsAt, result!.endsAt!)).toBe(3);
    });

    it("rolls across a year boundary", () => {
      const result = extractTime("22-01", "2026-12-31");

      // 22:00 CET on the 31st is 21:00Z; 01:00 CET on 2027-01-01 is 00:00Z.
      expect(result?.startsAt).toBe("2026-12-31T21:00:00.000Z");
      expect(result?.endsAt).toBe("2027-01-01T00:00:00.000Z");
      expect(hours(result!.startsAt, result!.endsAt!)).toBe(3);
    });

    it("builds the rolled end from the next DATE, not by adding 24 hours", () => {
      // ⚠ THE DISTINCTION THAT MAKES DST CORRECT. A window starting the evening
      // before the clocks go forward and ending after them is one hour SHORTER in
      // real time than the wall clock suggests. Adding 86_400_000 ms to the start
      // instant cannot produce this; converting 03:00 against the next calendar date
      // does.
      const result = extractTime("22-03", "2026-03-28");

      expect(result?.startsAt).toBe("2026-03-28T21:00:00.000Z");
      expect(result?.endsAt).toBe("2026-03-29T01:00:00.000Z");
      // Wall clock says 5 hours; the missing hour makes it 4.
      expect(hours(result!.startsAt, result!.endsAt!)).toBe(4);
    });

    it("gives an extra hour across the autumn transition", () => {
      // The mirror case: the doubled hour makes the window longer than the wall
      // clock reads. Both directions are pinned so neither can be "fixed" away.
      const result = extractTime("22-03", "2026-10-24");

      expect(hours(result!.startsAt, result!.endsAt!)).toBe(6);
    });
  });

  describe("the never-negative invariant", () => {
    it.each([
      ["01:59-02:00", -59],
      ["01:30-02:00", -30],
      ["01:00-02:00", 0],
      ["01:30-02:30", 0],
    ])("drops the end when %s would produce a non-positive window", (caption) => {
      // ⚠ THE WALL CLOCK IS NOT ENOUGH TO GUARANTEE THIS. On the spring-forward day
      // 02:00–02:59 does not exist in Stockholm, and `fromZonedTime` maps those wall
      // times back onto the preceding hour — so 01:59 < 02:00 is plainly true and
      // the converted window is still MINUS 59 minutes. Found by scanning every
      // minute pair on both transition days; all six offenders are on this day, and
      // every one has its end inside the missing hour.
      //
      // The end is dropped rather than rolled: rolling would fabricate a ~24 h
      // window out of a timezone artefact, while `endsAt: null` is already a
      // meaningful state that the locations service's expiry fallback handles.
      const result = extractTime(caption, DST_START);

      expect(result).not.toBeNull();
      expect(result?.startsAt).not.toBeNull();
      expect(result?.endsAt).toBeNull();
    });

    it("drops the end of a degenerate equal-time window", () => {
      // Not negative, so it never triggers the roll — and a zero-length window is a
      // row that can never overlap anything and is expired on arrival. The same
      // strictly-after check covers it, which is why it is one invariant and not two
      // special cases.
      expect(extractTime("11-11", SUMMER)?.endsAt).toBeNull();
    });

    it("keeps ordinary windows on both transition days", () => {
      // The guard must not cost anything outside the missing hour.
      expect(extractTime("11-14", DST_START)?.endsAt).toBe("2026-03-29T12:00:00.000Z");
      expect(extractTime("11-14", DST_END)?.endsAt).toBe("2026-10-25T13:00:00.000Z");
    });

    it("never produces an end at or before the start, across a full day of windows", () => {
      // The property behind the cases above, swept over every transition day rather
      // than asserted at the four points that happened to be found.
      for (const date of [DST_START, DST_END, SUMMER, WINTER]) {
        for (let h = 0; h < 24; h++) {
          for (const m of [0, 30, 59]) {
            const caption = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}-23:59`;
            const result = extractTime(caption, date);

            expect(result).not.toBeNull();
            if (result?.endsAt != null) {
              expect(result.endsAt > result.startsAt).toBe(true);
            }
          }
        }
      }
    });
  });

  describe("lunchtid", () => {
    it("maps to 11:00-14:00 Stockholm and is tagged as an inference", () => {
      // `kind` is what keeps this scoreable at 0.85 while an identical explicit
      // range scores 1.0 — the two produce the SAME instants, so the discriminator
      // is the only thing separating them downstream.
      expect(extractTime("Vi kör lunchtid på Heden", SUMMER)).toEqual({
        startsAt: "2026-08-22T09:00:00.000Z",
        endsAt: "2026-08-22T12:00:00.000Z",
        kind: "lunchtid",
      });
    });

    it("is case-insensitive, since normalizeCaption does not lowercase", () => {
      expect(extractTime("LUNCHTID", SUMMER)?.kind).toBe("lunchtid");
      expect(extractTime("Lunchtid", SUMMER)?.kind).toBe("lunchtid");
    });

    it("produces the same instants as the equivalent explicit range, but a different kind", () => {
      const named = extractTime("lunchtid", SUMMER);
      const explicit = extractTime("11-14", SUMMER);

      expect(named?.startsAt).toBe(explicit?.startsAt);
      expect(named?.endsAt).toBe(explicit?.endsAt);
      expect(named?.kind).not.toBe(explicit?.kind);
    });

    it("does not fire on 'lunch' alone", () => {
      // "Dagens lunch" is a menu, not a time. Only the compound naming the WINDOW
      // carries a definition the plan fixes.
      expect(extractTime("Dagens lunch är tacos", SUMMER)).toBeNull();
    });

    it("does not fire inside a longer word", () => {
      expect(extractTime("lunchtiden är slut", SUMMER)).toBeNull();
    });
  });

  describe("precedence", () => {
    it("prefers an explicit range over lunchtid", () => {
      // ⚠ THE CASE THAT DECIDES THE ORDER. "Lunchtid! 12-15" must be 12:00-15:00.
      // An explicit range is what the truck SAID; lunchtid is what this module
      // INFERS when they did not. Preferring the statement over the inference is the
      // plan's own principle (#5) — guards constrain what the system infers, never
      // what it was told.
      expect(extractTime("Lunchtid! 12-15 på Heden", SUMMER)).toEqual({
        startsAt: "2026-08-22T10:00:00.000Z",
        endsAt: "2026-08-22T13:00:00.000Z",
        kind: "range",
      });
    });

    it("prefers lunchtid over a marked start, since it gives a complete window", () => {
      expect(extractTime("Lunchtid, vi öppnar kl 10", SUMMER)?.kind).toBe("lunchtid");
    });

    it("takes the first range that passes the HOUR CHECK, not the first that matches", () => {
      // ⚠ THIS IS THE TEST THAT MAKES THE HOUR CHECK LOAD-BEARING, and it was not
      // here until mutation testing showed that deleting `h > 23` broke nothing.
      //
      // "61-63" fully matches the range pattern — two one-or-two-digit numbers
      // joined by a dash — and is rejected only by the numeric hour check. Without
      // that check it becomes the chosen candidate, `fromZonedTime` returns an
      // Invalid Date for hour 61, and the whole caption yields null: a truck that
      // plainly stated 11-14 gets no window because a price range came first.
      //
      // An earlier version of this test used "89-119" and asserted the same thing
      // wrongly. "119" is three digits, so the trailing digit guard rejects that
      // candidate before the hour check ever sees it — the fixture passed with or
      // without the guard it claimed to be testing.
      expect(extractTime("Korv 61-63 kr, öppet 11-14", SUMMER)).toEqual({
        startsAt: "2026-08-22T09:00:00.000Z",
        endsAt: "2026-08-22T12:00:00.000Z",
        kind: "range",
      });
    });

    it("rejects hour 24, which the timezone library accepts as the WRONG instant", () => {
      // ⚠ THE ONE OUT-OF-RANGE HOUR THAT FAILS SILENTLY. `fromZonedTime` returns an
      // Invalid Date for 25 and above — so the isNaN guard happens to cover those —
      // but it ACCEPTS "T24:00:00" and resolves it to midnight at the START of the
      // same day, which is 2026-08-21T22:00Z. Relying on the library to reject
      // out-of-range hours would therefore turn "24-01" into a window on the wrong
      // day rather than into no window at all.
      expect(extractTime("24-01", SUMMER)).toBeNull();
      expect(extractTime("kl 24", SUMMER)).toBeNull();
    });
  });

  describe("a start with no end", () => {
    it.each(["kl 11", "kl. 11", "klockan 11", "från 11", "kl 11:00"])(
      "reads %s as a start with endsAt null",
      (caption) => {
        const result = extractTime(`Vi står på Heden ${caption}`, SUMMER);

        expect(result?.startsAt).toBe("2026-08-22T09:00:00.000Z");
        expect(result?.endsAt).toBeNull();
      },
    );

    it("tags a marked start as 'start', not 'range'", () => {
      // ⚠ A SCORING BUG, not a naming preference. The confidence matrix scores
      // "location + explicit time range" at 1.0, so tagging an opening time as
      // `range` made "Heden kl 11" outrank a caption giving a complete window
      // (PR #84 review). Widens the type #58 specified, deliberately — nothing
      // consumes `kind` yet, and #66 would otherwise inherit the defect.
      expect(extractTime("Heden kl 11", SUMMER)?.kind).toBe("start");
    });

    it("is distinguishable from a range whose end the DST gap dropped", () => {
      // The reason `endsAt === null` cannot serve as the discriminator: a range with
      // its end dropped is identical to a marked start in every other field.
      const droppedEnd = extractTime("01:59-02:00", DST_START);
      const markedStart = extractTime("kl 11", SUMMER);

      expect(droppedEnd?.endsAt).toBeNull();
      expect(markedStart?.endsAt).toBeNull();
      expect(droppedEnd?.kind).toBe("range");
      expect(markedStart?.kind).toBe("start");
    });

    it("does not read a bare number as a start", () => {
      // ⚠ THE GUARD THAT KEEPS THE MODULE FROM INVENTING WINDOWS. Captions are full
      // of numbers that are not clock times, and every one of these would otherwise
      // produce a fabricated start, a location row and a pin.
      expect(extractTime("Vi har 3 nya rätter", SUMMER)).toBeNull();
      expect(extractTime("2 för 100 kr", SUMMER)).toBeNull();
      expect(extractTime("5 sorters korv", SUMMER)).toBeNull();
    });
  });

  describe("no time at all", () => {
    it("returns null rather than a fabricated window", () => {
      expect(extractTime("Vi står på Järntorget idag", SUMMER)).toBeNull();
      expect(extractTime("", SUMMER)).toBeNull();
    });

    it.each([
      ["a price", "Burgare 10-20 kr, öppet 11-14"],
      ["a spaced price", "Vi har 5 - 10 kr rabatt, öppet 11-14"],
      ["a seat count", "Vi har 5 - 10 platser kvar, öppet 11-14"],
      ["a portion count", "Meny 2-3 rätter, Heden 11-14"],
      ["a kronor spelling", "Korv 15-20 kronor, öppet 11-14"],
    ])("skips %s and finds the real window after it", (_label, caption) => {
      // ⚠ THE MODULE'S CLAIM THAT A RANGE IS SELF-IDENTIFYING WAS FALSE, and the
      // original fixtures only passed because their numbers exceeded 23. Two
      // dash-joined numbers under 24 are ordinary in a food caption, and each of
      // these produced a fabricated serving window (PR #84 review).
      //
      // The trailing-unit guard is MONOTONE: a unit it does not know leaves the
      // status quo, while one it knows removes a fabrication and lets the scan
      // continue. None of the listed words can follow a clock time in Swedish.
      expect(extractTime(caption, SUMMER)).toEqual({
        startsAt: "2026-08-22T09:00:00.000Z",
        endsAt: "2026-08-22T12:00:00.000Z",
        kind: "range",
      });
    });

    it("returns null for a unit range with no real time after it", () => {
      expect(extractTime("Burgare 10-20 kr", SUMMER)).toBeNull();
      expect(extractTime("Vi har 2-3 rätter", SUMMER)).toBeNull();
    });

    it("KNOWN LIMIT: a bare house-number range still fabricates a window", () => {
      // Pinned rather than fixed. "Första Långgatan 12-14" is a Gothenburg street
      // with a house-number range and no trailing unit to catch it. Separating that
      // from a time needs the address recognition #65 builds, and guessing at it
      // here would be the vocabulary churn this phase keeps paying for.
      //
      // Asserted so the limit is visible and so closing it is a deliberate change to
      // this test rather than something that looks like a regression.
      expect(extractTime("Första Långgatan 12-14", SUMMER)).not.toBeNull();
    });

    it("rejects numbers that cannot be clock times", () => {
      expect(extractTime("Nordostpassagen 61-63", SUMMER)).toBeNull();
      expect(extractTime("Tacos 89-119 kr", SUMMER)).toBeNull();
      expect(extractTime("25-30 personer", SUMMER)).toBeNull();
    });

    it("does not read a house number out of an address", () => {
      // The digit-adjacency guards, not word guards: "61" must not be reachable as
      // an hour just because it is next to a dash.
      expect(extractTime("Vi står på Nordostpassagen 61", SUMMER)).toBeNull();
    });
  });

  describe("an unusable date", () => {
    // `fromZonedTime` does NOT throw on a date it cannot read — it returns an
    // Invalid Date, and `.toISOString()` on that is a RangeError. This module runs
    // inside `after()`, where a throw is an unhandled rejection that loses the post,
    // so the failure has to become a value here.
    it.each(["not-a-date", "", "2026-13-01", "2026-08-22T10:00:00Z"])(
      "returns null instead of throwing for %s",
      (date) => {
        expect(() => extractTime("11-14", date)).not.toThrow();
        expect(extractTime("11-14", date)).toBeNull();
      },
    );
  });

  describe("regex statelessness", () => {
    it("returns the same result when called repeatedly", () => {
      // A module-level global regex carries `lastIndex` across calls, so a shared
      // instance alternates between finding and not finding on identical input —
      // a bug that passes any single-call test. `matchAll` iterates a clone, and
      // this is what verifies that rather than assuming it.
      const caption = "Heden 11-14 lunchtid kl 11";

      for (let i = 0; i < 5; i++) {
        expect(extractTime(caption, SUMMER)).toEqual({
          startsAt: "2026-08-22T09:00:00.000Z",
          endsAt: "2026-08-22T12:00:00.000Z",
          kind: "range",
        });
      }
    });
  });

  describe("composed with normalizeCaption", () => {
    it("reads a time carried by a hashtag", () => {
      // #78 segments "#Lunch11-14Heden" into "Lunch 11-14 Heden", so times now reach
      // this module from tags.
      expect(extractTime(normalizeCaption("#Lunch11-14Heden"), SUMMER)?.startsAt).toBe(
        "2026-08-22T09:00:00.000Z",
      );
    });

    it("survives an emoji used as a separator", () => {
      expect(extractTime(normalizeCaption("Järntorget\u{1F32E}11-14"), SUMMER)?.endsAt).toBe(
        "2026-08-22T12:00:00.000Z",
      );
    });

    it("reads a decomposed caption once normalized", () => {
      // The NFD class (#56): text from Apple devices arrives decomposed, and
      // `normalizeCaption` composes it. "lunchtid" has no diacritic, but the caption
      // around it does, and the boundary lookarounds are `\p{L}`-based.
      const decomposed = "Vi kör lunchtid på Järntorget".normalize("NFD");

      expect(extractTime(normalizeCaption(decomposed), SUMMER)?.kind).toBe("lunchtid");
    });
  });
});
