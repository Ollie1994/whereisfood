import { describe, expect, it } from "vitest";
import { parseCaption } from "@/lib/parser";
import { extractAddressCandidate } from "@/lib/parser/address";
import { extractDate } from "@/lib/parser/date";
import { extractLocation } from "@/lib/parser/location";
import { detectNegation } from "@/lib/parser/negation";
import { normalizeCaption } from "@/lib/parser/normalize";
import { extractTime } from "@/lib/parser/time";

// WHAT THIS SUITE IS FOR, AND WHAT IT DELIBERATELY DOES NOT RE-TEST.
//
// Each extractor is exhaustively tested in its own co-located suite — `time.test.ts`
// alone is 78 cases. Restating those here would produce a second, weaker copy that
// drifts, so this file tests only what is TRUE OF THE COMPOSITION and false of any
// part in isolation:
//
//   the ORDER the steps run in, which is a business rule (#67)
//   the VALUES that flow between them — the date `extractTime` builds its instants on
//   the MAPPING from two extractor outputs onto `scoreConfidence`'s two axes
//
// Every ordering assertion therefore runs the extractor DIRECTLY on the same caption
// as well, and asserts it finds something `parseCaption` did not return. An assertion
// that only checks `parseCaption` returned null cannot distinguish "the order
// suppressed it" from "there was nothing to find", and would pass against a parser
// with no ordering at all.
//
// MUTATION-VERIFIED, because "this test pins the order" is exactly the kind of claim
// this project has shipped unchecked before. Each mutant was applied to `index.ts`,
// run, and reverted; each is killed by this suite:
//
//   stop suppressing `place` on a negation
//   suppress `time` on a negation again — the r3 regression, see below
//   force a negation's `date` to `parsedAt` again — the other half of it
//   drop `isNegation` from the `scoreConfidence` input
//   check the address fallback before the dictionary
//   pass `parsedAt` to `extractTime` rather than the resolved date
//
// and two more that are killed by `purity.test.ts` rather than by anything here —
// appending `Date.now()` to `index.ts`, and appending an `@/lib/supabase` import.
//
// ⚠ THE SECOND AND THIRD ROWS ARE NEW AND ARE THE POINT OF THIS TABLE NOW. The
// suppression used to be a blanket early return that dropped `place`, `date` AND
// `time`, which contradicts plan decision #1 — the cancellation window IS the
// extracted range when there is one. Those two mutants restore the old behaviour, so
// the plan rule is now pinned in the direction it was actually violated, rather than
// only in the direction the original design happened to get right.
//
// ⚠ NO FAILURE COUNTS, AND THE DELETED ONES ARE WHY. A first version of this table
// gave a count per mutant. Three of the four were wrong within one commit: the
// known-gaps block below was added afterwards and catches several of the same
// mutants, so "3 failures" became 6, "1" became 2, "2" became 3. The numbers were
// accurate when written and stale before the branch was reviewed.
//
// This project already has that rule written down — the phase plan refuses to put a
// test count beside its acceptance criteria, saying "a hand-maintained number beside
// a growing table drifted twice … the table is the count" — and I reproduced the
// exact thing it warns about, in a table whose entire purpose is to be checkable.
// A count is a claim about a suite that grows; "this mutant is killed" is a claim
// about the mutant, and re-running it is what confirms it either way.
//
// ⚠ THE FIRST ROW IS STILL THE INTERESTING ONE. With the bail deleted, the negation's
// CONFIDENCE assertion still passed — `scoreConfidence` short-circuits on
// `isNegation` independently — while the `place` and `time` assertions failed. That
// is the split both modules' comments claim: the score is defended by
// `confidence.ts`, the FIELDS are defended by this order, and a suite asserting only
// the score would have called the mutant correct.

// The Stockholm calendar date every case is read against, unless it says otherwise.
// A SATURDAY, in CEST (UTC+2) — so 11:00 local is 09:00Z.
//
// ⚠ THE WEEKDAY IS LOAD-BEARING, which is why it is stated and why getting it wrong
// mattered. The `#96` rows resolve "söndag" to 2026-08-23, which is only the next day
// because this is a Saturday; on any other weekday those assertions would need a
// different date. An earlier version of this comment called it a Friday — and the
// `#96` block eight lines down correctly called it a Saturday, so the file
// contradicted itself. Both were written by reading the constant rather than
// computing it.
const SUMMER = "2026-08-22";
// A THURSDAY, in CET (UTC+1), where 11:00 local is 10:00Z. The weekday is deliberately
// NOT matched to SUMMER's — nothing here needs them to agree, and an earlier comment
// claiming "the same weekday" was both false and a promise no test depends on. What
// this constant is for is the OFFSET: it is used wherever a case would still pass with
// +02:00 hard-coded or dropped.
const WINTER = "2026-01-15";

describe("the worked example", () => {
  // Verbatim from the phase plan's acceptance criteria. One caption carrying an
  // emoji, a hashtag, a dictionary place, a date word and an explicit range — the
  // whole pipeline in a single row.
  const result = parseCaption("Idag lunch vid Järntorget 11-14 🌮 #gbg", SUMMER);

  it("resolves the dictionary entry, and carries the caption's own spelling", () => {
    expect(result.place).toEqual({
      kind: "dictionary",
      match: {
        entry: expect.objectContaining({ id: "jarntorget" }),
        // `address_raw` is defined as the text the location was resolved FROM, which
        // is why `extractLocation` returns a `LocationMatch` rather than an entry.
        matched: "Järntorget",
      },
    });
  });

  it("resolves 11:00–14:00 Europe/Stockholm on the parsed date, as UTC instants", () => {
    expect(result.time).toEqual({
      startsAt: "2026-08-22T09:00:00.000Z",
      endsAt: "2026-08-22T12:00:00.000Z",
      kind: "range",
    });
  });

  it("scores 1.0 — a dictionary place and an explicit window", () => {
    expect(result.parserConfidence).toBe(1.0);
  });

  it("is not a negation", () => {
    expect(result.isNegation).toBe(false);
  });
});

describe("a negation suppresses the place, and only the place", () => {
  // Chosen so that EVERY later step has something to find. That is the whole design
  // of this case: a caption where the extractors come up empty anyway would let a
  // parser with no short-circuit at all pass these assertions.
  const caption = "Inställt idag vid Järntorget 11-14";
  const normalized = normalizeCaption(caption);
  const date = extractDate(normalized, SUMMER);
  const result = parseCaption(caption, SUMMER);

  it("is a caption whose location and time extractors DO fire in isolation", () => {
    // The non-vacuity assertion, and the reason the three below mean anything. If a
    // dictionary edit or a `time.ts` change ever makes this caption stop resolving,
    // this fails FIRST and says so — rather than the ordering tests quietly passing
    // for the wrong reason.
    expect(detectNegation(normalized)).toBe(true);
    expect(extractLocation(normalized)?.entry.id).toBe("jarntorget");
    expect(extractTime(normalized, date)).not.toBeNull();
  });

  it("returns no place, even though the caption names one the dictionary knows", () => {
    // The field this defends. `services/locations.ts` (#69) branches on `place`, and
    // a cancellation carrying a resolved Järntorget is one careless `if (place)` away
    // from pinning the truck exactly where it just said it would not be.
    expect(result.place).toBeNull();
  });

  it("KEEPS the extracted window — it is the cancellation's payload", () => {
    // ⚠ THE OPPOSITE OF WHAT THIS ASSERTED BEFORE, and the change is a plan
    // requirement rather than a preference. Decision #1: "Cancellation window: the
    // extracted time range if there is one, otherwise the full Stockholm day of the
    // extracted date." #69 cannot scope the delete without it.
    expect(result.time).toEqual({
      startsAt: "2026-08-22T09:00:00.000Z",
      endsAt: "2026-08-22T12:00:00.000Z",
      kind: "range",
    });
  });

  it("scopes a partial cancellation to the slot it names", () => {
    // The failure the line above prevents, stated as the caption that produces it. A
    // truck cancelling lunch and keeping dinner: with `time: null` this fell through
    // to the full-day rule and #69 would have deleted the 17–20 pin too.
    const lunchOnly = parseCaption("Inställt 11-14 idag", SUMMER);

    expect(lunchOnly.isNegation).toBe(true);
    expect(lunchOnly.time?.startsAt).toBe("2026-08-22T09:00:00.000Z");
    expect(lunchOnly.time?.endsAt).toBe("2026-08-22T12:00:00.000Z");
  });

  it("resolves the day the caption names, so the window lands on the right date", () => {
    // Also reversed. The window is built on the resolved date, so dropping the date
    // would put a correct time on the wrong day — the two cannot be separated.
    const tomorrow = "Inställt imorgon vid Järntorget";

    expect(extractDate(normalizeCaption(tomorrow), SUMMER)).toBe("2026-08-23");
    expect(parseCaption(tomorrow, SUMMER).date).toBe("2026-08-23");
    // Still no place, which is the half of the suppression that stays.
    expect(parseCaption(tomorrow, SUMMER).place).toBeNull();
  });

  it("scores 0.0 even now that a window survives", () => {
    // The window reaching `scoreConfidence`'s time axis must not score it as a
    // location. `scoreConfidence` short-circuits on `isNegation` before either axis is
    // read, which is why narrowing the suppression was safe to do here.
    expect(result.parserConfidence).toBe(0.0);
    expect(result.isNegation).toBe(true);
  });

  it("with no time range, states only the day — the full-day fallback is #69's", () => {
    // The other half of decision #1. The parser reports "a cancellation, on this day,
    // with no window"; turning that into a full Stockholm day is the service's job,
    // and #58 deliberately does not compute `expires_at`.
    const allDay = parseCaption("Inställt idag", SUMMER);

    expect(allDay.isNegation).toBe(true);
    expect(allDay.date).toBe(SUMMER);
    expect(allDay.time).toBeNull();
  });
});

describe("the address fallback runs only on a dictionary miss", () => {
  it("does not produce an address for a place the dictionary resolved", () => {
    // "Järntorget 12" matches BOTH extractors: `-torget` is one of `address.ts`'s
    // street suffixes, and the house number corroborates it. Nothing but the order
    // separates them — `address.ts` imports no dictionary, by construction.
    const caption = "Järntorget 12";
    const normalized = normalizeCaption(caption);

    // Non-vacuity: the fallback genuinely fires on this text in isolation.
    expect(extractAddressCandidate(normalized)).toBe("Järntorget 12");

    // And the composition suppresses it, because the dictionary answered first.
    expect(parseCaption(caption, SUMMER).place).toEqual({
      kind: "dictionary",
      match: expect.objectContaining({ matched: "Järntorget" }),
    });
  });

  it("produces an address only when the dictionary missed", () => {
    const caption = "Vi står på Kungsgatan 12 idag 11-14";
    expect(extractLocation(normalizeCaption(caption))).toBeNull();

    expect(parseCaption(caption, SUMMER).place).toEqual({
      kind: "fallback",
      address: "Kungsgatan 12",
    });
  });

  it("resolves no place at all when neither extractor matches", () => {
    expect(parseCaption("Tack för idag!", SUMMER).place).toBeNull();
  });
});

describe("the resolved date is what the time is built on", () => {
  // The one value that flows BETWEEN two steps, and the only thing that can be wrong
  // about the composition while every extractor is individually correct.
  it("builds tomorrow's instants for a caption saying 'imorgon'", () => {
    const result = parseCaption("Imorgon Järntorget 11-14", SUMMER);

    expect(result.date).toBe("2026-08-23");
    // Not merely a different date string — the INSTANTS moved with it. A composition
    // that resolved the date but passed `parsedAt` to `extractTime` would still
    // report `date: "2026-08-23"` here and fail on this line.
    expect(result.time?.startsAt).toBe("2026-08-23T09:00:00.000Z");
    expect(result.time?.endsAt).toBe("2026-08-23T12:00:00.000Z");
  });

  it("applies the offset of the resolved date's own season, not a fixed one", () => {
    // Same caption, same wall clock, two different UTC instants. This is what makes
    // the assertions above about the pipeline rather than about a hard-coded +2.
    expect(parseCaption("Järntorget 11-14", SUMMER).time?.startsAt).toBe(
      "2026-08-22T09:00:00.000Z",
    );
    expect(parseCaption("Järntorget 11-14", WINTER).time?.startsAt).toBe(
      "2026-01-15T10:00:00.000Z",
    );
  });

  it("falls back to parsedAt for a caption naming no day", () => {
    // Not a missing answer — the post's own day IS the answer for a caption that
    // states no other one, and `extractDate` returns it rather than null.
    expect(parseCaption("Järntorget 11-14", WINTER).date).toBe(WINTER);
  });
});

describe("parser_confidence maps both extractor outputs onto the matrix", () => {
  // `confidence.test.ts` owns the matrix itself. What is tested HERE is the wiring:
  // that `place.kind` reaches the location axis and `time.kind` reaches the time
  // axis, and that neither is dropped or crossed. So the rows are chosen to move one
  // axis at a time, and the values only have to differ from each other to detect a
  // mis-wiring.
  it.each([
    // location axis, held at an explicit range
    ["Järntorget 11-14", 1.0, "dictionary + range"],
    ["Vi står på Kungsgatan 12 idag 11-14", 0.85, "fallback + range"],
    ["Öppet 11-14 idag", 0.2, "no place + range"],
    // time axis, held at a dictionary hit
    ["Imorgon lunchtid vid Nordstan", 0.85, "dictionary + lunchtid"],
    ["Heden kl 11", 0.7, "dictionary + start"],
    ["Vi står vid Heden idag", 0.6, "dictionary + no time"],
    // both axes at their weakest, and the two zero rows
    ["Vi står på Kungsgatan 12", 0.45, "fallback + no time"],
    ["Tack för idag!", 0.0, "nothing extracted"],
    ["Inställt idag vid Järntorget 11-14", 0.0, "negation, whatever else is present"],
  ])("%s scores %d — %s", (caption, expected) => {
    expect(parseCaption(caption, SUMMER).parserConfidence).toBe(expected);
  });

  it("distinguishes a fallback from a dictionary hit on the same time kind", () => {
    // The #3 penalty, arriving through the composition rather than asserted against
    // `scoreConfidence` directly. This is the pair the plan names: the same shape of
    // caption scores lower when the place came from the geocode fallback.
    const dictionary = parseCaption("Järntorget 11-14", SUMMER);
    const fallback = parseCaption("Kungsgatan 12 11-14", SUMMER);

    expect(dictionary.place?.kind).toBe("dictionary");
    expect(fallback.place?.kind).toBe("fallback");
    expect(fallback.parserConfidence).toBeLessThan(dictionary.parserConfidence);
  });
});

describe("known gaps, pinned so they are recorded rather than merely known", () => {
  // ⚠ THESE ASSERT CURRENT BEHAVIOUR, NOT CORRECT BEHAVIOUR. Both are wrong answers
  // this composition gives today, each deferred to a named issue for a reason stated
  // there. They are pinned because the alternative — a gap that lives only in a
  // comment — is how the same defect gets rediscovered and re-argued a phase later.
  // The issue that fixes each must UPDATE its test, which is what makes the fix
  // visible in the diff.

  it("#94 — pairs one clause's date with another's place and time, at 1.0", () => {
    const result = parseCaption("Heden 11-14, imorgon Lindholmen 17-20", SUMMER);

    expect(result.place).toEqual({
      kind: "dictionary",
      match: expect.objectContaining({ matched: "Heden" }),
    });
    // Tomorrow — from "imorgon", which belongs to the OTHER clause, the one naming
    // Lindholmen and 17-20.
    expect(result.date).toBe("2026-08-23");
    expect(result.time?.startsAt).toBe("2026-08-23T09:00:00.000Z");

    // The part that makes this expensive rather than merely wrong: nothing downstream
    // filters it. Scoring the maximum means it clears the 0.45 display threshold from
    // every lane, so the wrong pin is bounded only by `expires_at`.
    expect(result.parserConfidence).toBe(1.0);
  });

  it.each([
    "Heden 11-14 (ej söndag)",
    "Heden 11-14, ej söndag",
    "Heden 11-14 utom söndag",
    "Heden 11-14 förutom söndag",
    "Heden 11-14 (ej söndagar)",
  ])("#96 FIXED — %s no longer pins the excluded day", (caption) => {
    // ⚠ THIS BLOCK HAS FLIPPED. It was a known-gap pin: every one of these resolved to
    // SUNDAY — the single day the caption rules out — with `time.startsAt` on that day
    // and `parserConfidence` at 1.0, so nothing downstream filtered it. `date.ts` now
    // carries an exclusion guard and they fall back to the posting day.
    //
    // Kept here rather than deleted: this is the composed behaviour, and `date.ts`'s
    // own suite tests the extractor. Both matter — #96 was only ever visible as a pin.
    const result = parseCaption(caption, SUMMER);

    expect(result.isNegation).toBe(false);
    expect(result.date).toBe(SUMMER);
    expect(result.time?.startsAt).toBe("2026-08-22T09:00:00.000Z");
  });

  it("#96 — an exclusion after a real date word still does not move the date", () => {
    // Correct before the fix (first-match-wins picks "idag") and must stay correct
    // after it. This is the row that would catch an exclusion guard written so broadly
    // that it suppressed a legitimate leading date.
    expect(parseCaption("Heden 11-14 idag (ej söndag)", SUMMER).date).toBe(SUMMER);
  });

  it("#96 — a verb-negated weekday is still the pin's date", () => {
    // The composed half of `date.ts`'s two-category rule: "Glöm inte söndag" means the
    // truck IS there, so suppressing it would pin TODAY — the wrong-pin-now trade that
    // got `sista` removed from BACKWARD_MODIFIERS.
    const result = parseCaption("Heden 11-14, glöm inte söndag", SUMMER);

    expect(result.date).toBe("2026-08-23");
  });

  it("#80 — a closure named for another day cancels the day the post was sent", () => {
    // #80's own repro. A truck saying "we're at Heden 11-14 today, closed on Sunday"
    // parses as a cancellation OF TODAY, so per plan #1 the delete path removes the
    // pin of a truck standing there right now.
    const result = parseCaption("Vi står på Heden 11-14 idag, stängt på söndag", SUMMER);

    expect(result.isNegation).toBe(true);
    expect(result.date).toBe(SUMMER);
    // And the location the first clause states is gone, per the bail.
    expect(result.place).toBeNull();
  });

  it("#95 — a malformed parsedAt still scores and still carries a place", () => {
    const result = parseCaption("Järntorget 11-14", "not-a-date");

    // The window is dropped — `fromZonedTime` cannot read the date, which `time.ts`
    // degrades to `null` deliberately…
    expect(result.time).toBeNull();
    // …but the result is otherwise an ordinary location-only pin, and `date` is the
    // unusable string on its way to `locations.starts_at`, which is NOT NULL.
    expect(result.date).toBe("not-a-date");
    expect(result.place?.kind).toBe("dictionary");
    expect(result.parserConfidence).toBe(0.6);
  });
});

describe("purity", () => {
  // ⚠ THERE IS NO PURITY CHECK IN THIS FILE, and that is the point rather than an
  // omission. #67's acceptance criteria ask for "a purity check that no file under
  // src/lib/parser/ imports supabaseAdmin, calls fetch, or calls new Date()" — which
  // `purity.test.ts` in this directory already asserts, over the whole directory, by
  // globbing it. `index.ts` is covered by that glob the moment it exists, with no
  // purity code of its own; the suite's own comment predicts exactly this and names
  // #67 as one of the issues inheriting it.
  //
  // Writing a second copy here is the thing #75 was created to stop: re-deriving this
  // check cost PR #74 and #76 seven review rounds between them, and four successive
  // implementations each missed an import form the next one found.
  //
  // Verified by mutation rather than by argument, and both mutants were actually run:
  // appending `export const LEAK = Date.now();` to `index.ts` fails
  // `parser/purity.test.ts` at `index.ts imports nothing forbidden…`, and so does
  // adding an `import { supabaseAdmin } from "@/lib/supabase"`. Neither needs a line
  // in this file, and `index.ts` needed no purity code of its own to be covered.
  it("is asserted for this module by purity.test.ts, over the directory", () => {
    // The one thing that suite cannot check about itself: that `parseCaption` is
    // deterministic, so two calls with the same arguments agree. A clock or a network
    // read is what would break this, and it holds independently of how the guard is
    // implemented.
    const caption = "Idag lunch vid Järntorget 11-14 🌮 #gbg";

    expect(parseCaption(caption, SUMMER)).toEqual(parseCaption(caption, SUMMER));
  });
});
