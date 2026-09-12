import { describe, expect, it } from "vitest";
import { extractAddressCandidate, STREET_MODIFIERS, STREET_SUFFIXES } from "./address";
import { normalizeCaption } from "./normalize";

// Purity is NOT asserted here — `purity.test.ts` globs this directory and already
// covers `address.ts`. See the same note in `location.test.ts`.

// Through step 0, for the same reason as `location.test.ts`: this function is only
// ever called on `normalizeCaption` output.
const extract = (caption: string) => extractAddressCandidate(normalizeCaption(caption));

describe("extractAddressCandidate", () => {
  it("has suffixes and modifiers to match with", () => {
    // Non-vacuity. An empty suffix list builds `(?:)`, an alternation that matches
    // the empty string — every `toBeNull()` below would then fail loudly rather
    // than silently, but an empty MODIFIER list would quietly disable only the
    // two-word branch and nothing here would say so.
    expect(STREET_SUFFIXES.length).toBeGreaterThan(0);
    expect(STREET_MODIFIERS.length).toBeGreaterThan(0);
  });

  describe("recognises each Swedish street suffix", () => {
    it.each([
      ["gatan", "Vi står på Kungsgatan idag", "Kungsgatan"],
      ["vägen", "Vi står på Delsjövägen idag", "Delsjövägen"],
      ["torget", "Vi står på Olskrokstorget idag", "Olskrokstorget"],
      ["platsen", "Vi står på Drottningplatsen idag", "Drottningplatsen"],
      ["allén", "Vi står på Kungsallén idag", "Kungsallén"],
      ["kajen", "Vi står på Packhuskajen idag", "Packhuskajen"],
      ["liden", "Vi står på Kaserntorgsliden idag", "Kaserntorgsliden"],
      ["berget", "Vi står på Ramberget idag", "Ramberget"],
    ])("-%s", (_suffix, caption, expected) => {
      expect(extract(caption)).toBe(expected);
    });

    it("covers every suffix in the exported list", () => {
      // The table above is hand-written, so a suffix added to `STREET_SUFFIXES`
      // without a row would be untested and look covered. This anchors the count to
      // the list rather than to a number typed beside it (process-log row 10).
      const unmatched = STREET_SUFFIXES.filter(
        (suffix) => extract(`Vi står på Test${suffix} idag`) === null,
      );

      expect(unmatched).toEqual([]);
    });
  });

  describe("the house number", () => {
    it("is included when the caption gives one", () => {
      expect(extract("vi står på andra långgatan 12 idag 11-14")).toBe("andra långgatan 12");
    });

    it("is omitted when the caption gives none", () => {
      expect(extract("vi står på andra långgatan idag")).toBe("andra långgatan");
    });

    it("keeps an attached entrance letter", () => {
      expect(extract("Vi står på Kungsgatan 12B idag")).toBe("Kungsgatan 12B");
    });

    it("does not swallow a one-letter word after the number", () => {
      // "i" is a preposition, not an entrance. Allowing a space before the entrance
      // letter produced "Kungsgatan 12 i" and sent that to the geocoder.
      expect(extract("Vi står på Kungsgatan 12 i Göteborg")).toBe("Kungsgatan 12");
    });

    it("is dropped when what follows the street is a time range, not a number", () => {
      // The case that matters most. `extractTime` reads these same digits as
      // 11:00–14:00, so taking "11" here would make one pair of digits mean two
      // different things in one parse — and pin the truck at a doorway chosen by
      // accident. The street alone still geocodes.
      expect(extract("Vi står på Kungsgatan 11-14 idag")).toBe("Kungsgatan");
    });

    it.each([
      ["an en dash", "Vi står på Kungsgatan 11–14 idag"],
      ["a dotted range", "Vi står på Kungsgatan 11.30-13.00"],
      ["a colon range", "Vi står på Kungsgatan 11:00-14:00"],
    ])("drops the number for %s too", (_case, caption) => {
      expect(extract(caption)).toBe("Kungsgatan");
    });

    it("keeps a number followed by a sentence break rather than a range", () => {
      expect(extract("Vi står på Kungsgatan 12. Välkomna!")).toBe("Kungsgatan 12");
    });
  });

  describe("two-word street names", () => {
    it("keeps the ordinal that disambiguates the street", () => {
      // "Långgatan 12" is ambiguous between Första, Andra, Tredje and Fjärde
      // Långgatan — four different streets. The geocoder answers anyway.
      expect(extract("Lunch på Fjärde Långgatan 3 idag")).toBe("Fjärde Långgatan 3");
    });

    it("recognises a name whose second word is a bare suffix", () => {
      // "Södra Vägen" has no compound to match — the modifier is what makes it a
      // street name rather than the common noun "the avenue".
      expect(extract("Vi står på Södra Vägen idag")).toBe("Södra Vägen");
    });

    it("never takes the preposition in front of the street", () => {
      expect(extract("Vi står på Kungsgatan idag")).toBe("Kungsgatan");
    });

    it("takes only the modifier, not the word before it", () => {
      expect(extract("Ses vid gamla Kungsgatan idag")).toBe("gamla Kungsgatan");
    });

    it("collapses whitespace inside the candidate", () => {
      expect(extract("Vi står på Andra   Långgatan 12")).toBe("Andra Långgatan 12");
    });

    it("KNOWN LIMIT: misses a two-word name whose first word is not a modifier", () => {
      // "Danska Vägen" is a real Gothenburg street and this returns null for it.
      // The alternative — taking whatever word precedes a bare suffix — turns "vid
      // vägen" and "på torget" into addresses, and casing cannot tell them apart
      // because captions are routinely written all-lowercase. So the list stays
      // closed and covers the words that create the ambiguity worth resolving: the
      // ordinals and compass directions that distinguish four different Långgatan
      // and two different Vägen from each other.
      //
      // Pinned by a test rather than left in prose, so widening the list means
      // deleting an assertion that says why it is narrow. Fail-safe either way: the
      // cost is no pin, which is visible, not a wrong pin, which is not.
      expect(extract("Vi står på Danska Vägen idag")).toBeNull();
    });
  });

  describe("returns null", () => {
    it.each([
      ["a caption with no address", "god lunch idag!"],
      ["an empty caption", ""],
      ["a place name with no street suffix", "Vi står på Backaplan idag"],
      ["a time but no place", "Öppet 11-14 idag"],
    ])("for %s", (_case, caption) => {
      // This is the acceptance criterion that suppresses the network call entirely.
      // Most captions land here, and that is the correct outcome, not a gap.
      expect(extract(caption)).toBeNull();
    });

    it.each([
      ["berget", "Vi står uppe på berget idag"],
      ["torget", "Vi står på torget idag"],
      ["allén", "Vi står i allén idag"],
      ["vägen", "Vi står vid vägen idag"],
    ])("for the bare common noun %s", (_noun, caption) => {
      // Each of these is an ordinary Swedish word for somewhere the caption has
      // already named, or failed to. Geocoding "torget" inside a Gothenburg viewbox
      // returns a square — confidently, and at random.
      expect(extract(caption)).toBeNull();
    });

    it("for a one-letter compound, which is not a street name", () => {
      expect(extract("Vi står på Xgatan idag")).toBeNull();
    });
  });

  describe("the genitive is stripped from the query", () => {
    it("returns the street in its own form, not the case ending", () => {
      expect(extract("Vi ses vid Kungsgatans korsning")).toBe("Kungsgatan");
    });

    it("still rejects any other trailing letter", () => {
      expect(extract("Vi står på Kungsgatanx idag")).toBeNull();
    });
  });

  describe("picks the leftmost address when a caption holds two", () => {
    it("takes the first", () => {
      // Matches `extractLocation`'s rule. The parser resolves one caption to one
      // place; the leftmost is the caption's subject.
      expect(extract("Kungsgatan 12 idag, Packhuskajen imorgon")).toBe("Kungsgatan 12");
    });
  });

  it("finds an address written inside a hashtag", () => {
    // #78 preserves and segments tag text, so this reaches the matcher as
    // "Kungsgatan 12". Without that, a truck tagging its address got no pin.
    expect(extract("Lunch idag #Kungsgatan12")).toBe("Kungsgatan 12");
  });

  it("would match a dictionary place, which is why sequencing matters", () => {
    // `-torget` matches "Järntorget". That is CORRECT for the unknown squares this
    // module exists to catch, and never reached for the known ones because
    // `parseCaption` (#67) calls this only when `extractLocation` missed. Asserted
    // rather than commented, so removing the sequencing rule breaks a test instead
    // of quietly routing every known square through Nominatim.
    expect(extract("Idag står vi på Järntorget 11-14")).toBe("Järntorget");
  });

  it("is stable across repeated calls on the same caption", () => {
    // The stray-`g`-flag regression, same as `location.test.ts`.
    const caption = "Vi står på Andra Långgatan 12 idag";

    expect(extract(caption)).toBe(extract(caption));
    expect(extract(caption)).toBe("Andra Långgatan 12");
  });
});
