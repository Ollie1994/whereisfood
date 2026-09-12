import { describe, expect, it } from "vitest";
import { extractAddressCandidate, STREET_MODIFIERS, STREET_SUFFIXES } from "./address";
import { normalizeCaption } from "./normalize";
import { extractTime } from "./time";

// Purity is NOT asserted here — `purity.test.ts` globs this directory and already
// covers `address.ts`. See the same note in `location.test.ts`.

// Through step 0, for the same reason as `location.test.ts`: this function is only
// ever called on `normalizeCaption` output.
const extract = (caption: string) => extractAddressCandidate(normalizeCaption(caption));

describe("extractAddressCandidate", () => {
  it("has suffixes and modifiers to match with", () => {
    // Non-vacuity. An empty suffix list builds `(?:)`, an alternation matching the
    // empty string; an empty modifier list would quietly disable half the
    // corroboration rule and nothing below would say so.
    expect(STREET_SUFFIXES.length).toBeGreaterThan(0);
    expect(STREET_MODIFIERS.length).toBeGreaterThan(0);
  });

  describe("recognises each Swedish street suffix", () => {
    it.each([
      ["gatan", "Vi står på Kungsgatan 12 idag", "Kungsgatan 12"],
      ["vägen", "Vi står på Delsjövägen 12 idag", "Delsjövägen 12"],
      ["torget", "Vi står på Olskrokstorget 12 idag", "Olskrokstorget 12"],
      ["platsen", "Vi står på Drottningplatsen 12 idag", "Drottningplatsen 12"],
      ["allén", "Vi står på Kungsallén 12 idag", "Kungsallén 12"],
      ["kajen", "Vi står på Packhuskajen 12 idag", "Packhuskajen 12"],
      ["liden", "Vi står på Kaserntorgsliden 12 idag", "Kaserntorgsliden 12"],
      ["berget", "Vi står på Ramberget 12 idag", "Ramberget 12"],
    ])("-%s", (_suffix, caption, expected) => {
      expect(extract(caption)).toBe(expected);
    });

    it("covers every suffix in the exported list", () => {
      // The table above is hand-written, so a suffix added to `STREET_SUFFIXES`
      // without a row would be untested and look covered. This anchors coverage to
      // the list rather than to a number typed beside it (process-log row 10).
      const unmatched = STREET_SUFFIXES.filter(
        (suffix) => extract(`Vi står på Test${suffix} 12 idag`) === null,
      );

      expect(unmatched).toEqual([]);
    });
  });

  // ⚠ THE CENTRAL RULE OF THIS MODULE, and the one the first version got wrong.
  //
  // A street suffix is not evidence of a street: Swedish builds common nouns by the
  // same compounding, so `\p{L}{2,}` in front of a suffix admits "hållplatsen" as
  // readily as "Kungsgatan". A candidate must be corroborated by a house number or a
  // modifier.
  describe("a bare compound is not an address", () => {
    it.each([
      ["hållplatsen", "Vi står vid hållplatsen idag"],
      ["parkeringsplatsen", "Parkering på parkeringsplatsen"],
      ["lekplatsen", "Vi står vid lekplatsen"],
      ["idrottsplatsen", "Vi står vid idrottsplatsen"],
      ["arbetsplatsen", "Vi står på arbetsplatsen"],
      ["spårvägen", "Vi kör längs spårvägen"],
      ["motorvägen", "Vi står vid motorvägen"],
      ["hemvägen", "På väg hem, hemvägen"],
      ["gågatan", "Vi står på gågatan idag"],
    ])("rejects the common noun %s", (_noun, caption) => {
      // Every one of these was returned as a street address before the corroboration
      // rule, and each would have been geocoded inside a Gothenburg viewbox — which
      // answers confidently and at random.
      expect(extract(caption)).toBeNull();
    });

    it.each([
      ["berget", "Vi står uppe på berget idag"],
      ["torget", "Vi står på torget idag"],
      ["allén", "Vi står i allén idag"],
      ["vägen", "Vi står vid vägen idag"],
    ])("rejects the bare common noun %s", (_noun, caption) => {
      expect(extract(caption)).toBeNull();
    });

    it("prefers a corroborated candidate further right over an uncorroborated one", () => {
      // The failure that made this more than a false positive: leftmost matching
      // returned "hållplatsen" and threw away an address the caption stated outright.
      expect(extract("vi står vid hållplatsen på Kungsgatan 12")).toBe("Kungsgatan 12");
    });

    it("THE COST: a real street with neither a number nor a modifier is missed", () => {
      // Stated as a test rather than as prose, because it is the price of the rule
      // above and reversing it should mean deleting an assertion. Both of these are
      // ordinary captions and both now degrade to no pin. The answer for a named
      // place is to add it to the dictionary, where a human looks at the coordinate.
      expect(extract("Vi står på Kungsgatan idag")).toBeNull();
      expect(extract("Vi står på Ramberget 11-14")).toBeNull();
    });
  });

  describe("the house number", () => {
    it("is what corroborates an otherwise bare compound", () => {
      expect(extract("vi står på långgatan 12 idag 11-14")).toBe("långgatan 12");
    });

    it("keeps an attached entrance letter", () => {
      expect(extract("Vi står på Kungsgatan 12B idag")).toBe("Kungsgatan 12B");
    });

    it("does not swallow a one-letter word after the number", () => {
      // "i" is a preposition, not an entrance. Allowing a space before the entrance
      // letter produced "Kungsgatan 12 i" and sent that to the geocoder.
      expect(extract("Vi står på Kungsgatan 12 i Göteborg")).toBe("Kungsgatan 12");
    });

    it("keeps a number followed by a sentence break rather than a range", () => {
      expect(extract("Vi står på Kungsgatan 12. Välkomna!")).toBe("Kungsgatan 12");
    });

    it("is not taken from a longer number", () => {
      expect(extract("Vi står på Kungsgatan 1234")).toBeNull();
    });
  });

  // ⚠ THE DIGITS AFTER A STREET NAME ARE CONTESTED between this module and
  // `time.ts`. "Kungsgatan 11-14" is a street and a time window, and whichever module
  // takes those digits, the other must not — so these assertions run BOTH extractors
  // over the same caption rather than asserting one in isolation.
  //
  // The first version of the guard wrote its own separator class and had already
  // drifted from `RANGE_SEPARATOR` by the time it shipped: no em dash, no `till`. A
  // test that only checked `extractAddressCandidate` passed anyway, because it was
  // written against the same wrong list.
  describe("a time range is not a house number", () => {
    it.each([
      ["a hyphen", "11-14"],
      ["an en dash", "11–14"],
      ["an em dash", "11—14"],
      ["the word till", "11 till 14"],
      ["a dotted clock", "11.30-13.00"],
      ["a colon clock", "11:00-14:00"],
    ])("%s", (_case, range) => {
      const caption = `Vi står på Kungsgatan ${range}`;
      const normalized = normalizeCaption(caption);

      // `extractTime` claims these digits...
      expect(extractTime(normalized, "2026-09-12")).not.toBeNull();

      // ...so `extractAddressCandidate` must not, and with no number left there is
      // nothing corroborating "Kungsgatan" either.
      expect(extractAddressCandidate(normalized)).toBeNull();
    });

    it("still takes a number when no range follows it", () => {
      // The other half: the guard must not be so broad that a real house number is
      // dropped. Without this, "reject everything" would pass every case above.
      const normalized = normalizeCaption("Vi står på Kungsgatan 12 idag");

      expect(extractTime(normalized, "2026-09-12")).toBeNull();
      expect(extractAddressCandidate(normalized)).toBe("Kungsgatan 12");
    });
  });

  describe("two-word street names", () => {
    it("is corroborated by the modifier alone, with no number", () => {
      expect(extract("Vi står på Södra Vägen idag")).toBe("Södra Vägen");
    });

    it("keeps the ordinal that disambiguates the street", () => {
      // "Långgatan 12" is ambiguous between Första, Andra, Tredje and Fjärde
      // Långgatan — four different streets. The geocoder answers anyway.
      expect(extract("Lunch på Fjärde Långgatan 3 idag")).toBe("Fjärde Långgatan 3");
    });

    it("never takes the preposition in front of the street", () => {
      expect(extract("Vi står på Nya Allén idag")).toBe("Nya Allén");
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

    it("for a one-letter compound, which is not a street name", () => {
      expect(extract("Vi står på Xgatan 12 idag")).toBeNull();
    });
  });

  describe("the genitive is stripped from the query", () => {
    it("returns the street in its own form, not the case ending", () => {
      // Reachable only alongside a modifier now: a genitive and a house number do
      // not co-occur, so a bare "Kungsgatans" is uncorroborated and rejected before
      // the `s` matters.
      expect(extract("Vi ses vid Södra Vägens korsning")).toBe("Södra Vägen");
    });

    it("still rejects any other trailing letter", () => {
      expect(extract("Vi står på Södra Vägenx idag")).toBeNull();
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
    expect(extract("Idag står vi på Järntorget 3")).toBe("Järntorget 3");
  });

  it("is stable across repeated calls on the same caption", () => {
    // `ADDRESS` is the one global regex in this parser, because rejecting a
    // candidate is not the same as failing to find one. `matchAll` clones before
    // iterating, so `lastIndex` never carries between calls — this is what pins it.
    const caption = "Vi står på Andra Långgatan 12 idag";

    expect(extract(caption)).toBe(extract(caption));
    expect(extract(caption)).toBe("Andra Långgatan 12");
    expect(extract(caption)).toBe("Andra Långgatan 12");
  });
});
