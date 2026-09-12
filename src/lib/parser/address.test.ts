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
    // empty string, which would make every `toBeNull()` below pass for the wrong
    // reason; an empty modifier list would silently drop the first word of every
    // two-word street name and only one assertion would notice.
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

  // ⚠ THE CENTRAL RULE, and it took two review rounds to state correctly.
  //
  // Swedish street names and Swedish common nouns are built the same way — a stem
  // plus a definite suffix — so no morphological rule separates them. Each earlier
  // version added one more condition and found the same class again a round later.
  // The rule is now one sentence: a candidate is a suffix-compound followed by a
  // house number.
  describe("a suffix alone is not an address", () => {
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
      // r0 admitted every one of these. The guard then was `\p{L}{2,}` in front of
      // the suffix, which excludes only the BARE nouns — and Swedish forms compounds
      // by exactly that shape, so the guard excluded the case that was not the
      // problem.
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
  });

  // ⚠ A MODIFIER NAMES; IT DOES NOT LICENSE. r1 accepted a candidate corroborated by
  // "a house number OR a modifier", and the modifier half was the same mistake in new
  // clothes — `stora`, `nya`, `lilla`, `nedre`, `andra` are ordinary adjectives.
  describe("a modifier is not evidence of a street", () => {
    it.each([
      ["stora torget", "Vi tar stora torget idag"],
      ["lilla vägen", "Vi kör lilla vägen idag"],
      ["nya vägen", "Vi tar nya vägen idag"],
      ["nedre vägen", "Nedre vägen är avstängd"],
      ["andra platsen", "Vi står på andra platsen från vänster"],
    ])("rejects the ordinary phrase %s", (_phrase, caption) => {
      expect(extract(caption)).toBeNull();
    });

    it.each([
      ["an uncorroborated compound", "vi står vid hållplatsen på Kungsgatan 12"],
      ["a modifier phrase", "vi står vid stora torget på Kungsgatan 12"],
      ["a modifier phrase with a verb", "Vi kör lilla vägen till Kungsgatan 12"],
      ["a counting phrase", "Vi står på andra platsen från vänster, Kungsgatan 12"],
    ])("does not let %s mask a real address behind it", (_case, caption) => {
      // This is what made r0 and r1 worse than false positives: being leftmost, an
      // invented place DISCARDED an address the caption stated outright. `ADDRESS` is
      // global and the first CORROBORATED match wins, so a rejected candidate is
      // skipped rather than ending the search.
      expect(extract(caption)).toBe("Kungsgatan 12");
    });

    it("still captures a modifier that belongs to a corroborated street's name", () => {
      // The naming job the list is actually for. Dropping "Fjärde" would pin the
      // truck on one of three other Långgatan.
      expect(extract("Lunch på Fjärde Långgatan 3 idag")).toBe("Fjärde Långgatan 3");
      expect(extract("Vi står på Södra Vägen 12 idag")).toBe("Södra Vägen 12");
    });
  });

  // ⚠ THE LIMIT THAT CANNOT BE CLOSED HERE, asserted rather than described. A numbered
  // common noun is indistinguishable from a numbered street by morphology, so these
  // are what the module DOES, and a comment claiming otherwise is what produced both
  // earlier rounds. The defences are downstream: a bounded, re-validated Nominatim
  // query (#3) and the fallback confidence penalty.
  describe("KNOWN LIMIT: a numbered common noun still matches", () => {
    it.each([
      ["gågatan 5", "Vi står vid gågatan 5"],
      ["spårvägen 3", "Vi står vid spårvägen 3"],
      ["hållplatsen 5", "Vi står vid hållplatsen 5"],
    ])("%s", (expected, caption) => {
      expect(extract(caption)).toBe(expected);
    });

    it("STOP RULE: closing this needs real captions, not another condition", () => {
      // Recorded as an executable note. Every remaining candidate signal —
      // capitalisation, a preposition in front, a longer compound — is a heuristic
      // whose gaps produce WRONG pins, and there is no caption data to calibrate one
      // against before Phase 8. A third corroborator would be the r1 mistake again.
      //
      // The remedy for a named place that this module misses is to add it to the
      // dictionary, which is reviewed by a human. That direction moves coverage
      // toward evidence; another regex condition moves it away.
      expect(extract("Vi står vid gågatan 5")).not.toBeNull();
    });
  });

  describe("the house number", () => {
    it("is what licenses a candidate", () => {
      expect(extract("vi står på långgatan 12 idag")).toBe("långgatan 12");
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

  // ⚠ THE DIGITS AFTER A STREET NAME ARE CONTESTED between this module and `time.ts`.
  // "Kungsgatan 11-14" is a street and a time window, and whichever module takes those
  // digits, the other must not — so these assertions run BOTH extractors over the same
  // caption rather than asserting one in isolation.
  //
  // Sharing the guard has gone wrong twice, each time more subtly: r0 hand-wrote a
  // separator class that had already drifted (no em dash, no `till`); r1 imported
  // `RANGE_SEPARATOR` and reassembled the guard locally WITHOUT `REPEATED_MARKER`, so
  // "Kungsgatan 11 - kl 14" was claimed twice. `CLOCK_JOINER` is now the whole of what
  // may sit between two clocks, exported as one string and used verbatim by `RANGE` —
  // there is no assembly left here to get wrong.
  describe("a time range is not a house number", () => {
    it.each([
      ["a hyphen", "11-14"],
      ["an en dash", "11–14"],
      ["an em dash", "11—14"],
      ["the word till", "11 till 14"],
      ["a dotted clock", "11.30-13.00"],
      ["a colon clock", "11:00-14:00"],
      ["a repeated kl marker", "11 - kl 14"],
      ["a repeated klockan marker", "11 - klockan 14"],
      ["till with a repeated marker", "11 till kl 14"],
      ["an abbreviated marker with a full stop", "11-kl.14"],
    ])("%s", (_case, range) => {
      const caption = `Vi står på Kungsgatan ${range}`;
      const normalized = normalizeCaption(caption);

      // `extractTime` claims these digits...
      expect(extractTime(normalized, "2026-09-12")).not.toBeNull();

      // ...so `extractAddressCandidate` must not, and with no number left there is
      // nothing licensing "Kungsgatan" either.
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

  describe("what the rule costs", () => {
    it.each([
      ["a street with no number", "Vi står på Kungsgatan idag"],
      ["a two-word street with no number", "Vi står på Södra Vägen idag"],
      ["a named point that has no number to give", "Vi står på Ramberget 11-14"],
      ["a street in the genitive", "Vi ses vid Kungsgatans korsning"],
    ])("misses %s", (_case, caption) => {
      // Pinned rather than described, so relaxing the rule means deleting an
      // assertion that says what it buys. Every one of these is real and every one
      // degrades to no pin — visible and self-correcting — where the alternative
      // is a confident pin to somewhere the truck is not.
      //
      // The remedy for all four is the same: add the place to the dictionary.
      expect(extract(caption)).toBeNull();
    });
  });

  describe("two-word street names", () => {
    it("keeps the ordinal that disambiguates the street", () => {
      // "Långgatan 12" is ambiguous between Första, Andra, Tredje and Fjärde
      // Långgatan — four different streets. The geocoder answers anyway.
      expect(extract("Lunch på Fjärde Långgatan 3 idag")).toBe("Fjärde Långgatan 3");
    });

    it("never takes the preposition in front of the street", () => {
      expect(extract("Vi står på Kungsgatan 12 idag")).toBe("Kungsgatan 12");
    });

    it("collapses whitespace inside the candidate", () => {
      expect(extract("Vi står på Andra   Långgatan 12")).toBe("Andra Långgatan 12");
    });

    it("KNOWN LIMIT: loses a first word that is not on the modifier list", () => {
      // "Danska Vägen" is a real Gothenburg street and only "Vägen 12" survives.
      // Widening the list is safe now that it no longer licenses anything — it is
      // left narrow because a wrong first word is worse than a missing one, and
      // Phase 8 captions should decide which words to add.
      expect(extract("Vi står på Danska Vägen 12 idag")).toBe("Vägen 12");
    });
  });

  describe("returns null", () => {
    it.each([
      ["a caption with no address", "god lunch idag!"],
      ["an empty caption", ""],
      ["a place name with no street suffix", "Vi står på Backaplan 12 idag"],
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
