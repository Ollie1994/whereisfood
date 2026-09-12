import { describe, expect, it } from "vitest";
import { DICTIONARY } from "./dictionary";
import { extractLocation } from "./location";
import { normalizeCaption } from "./normalize";

// Purity is NOT asserted here — `purity.test.ts` globs this directory and already
// covers `location.ts`, including the "no DB, no fetch, no clock" half of this
// issue's acceptance criteria. Restating it per file is what issue #75 exists to
// stop.

// Captions go through `normalizeCaption` rather than being hand-written in their
// normalized form. `extractLocation` is only ever called on step 0's output, so a
// test that skips it asserts against an input the code never receives — and the
// hashtag and emoji cases below are precisely about the seam between the two.
const extract = (caption: string) => extractLocation(normalizeCaption(caption));

const idOf = (caption: string) => extract(caption)?.entry.id ?? null;

describe("extractLocation", () => {
  it("has a dictionary to match against", () => {
    // NOT redundant with the cases below. An empty `DICTIONARY` builds an empty
    // alternation, which is a regex that matches the empty string at position 0 —
    // so every assertion expecting `null` would still pass while the matcher was
    // comprehensively broken. This is what makes the negative cases non-vacuous
    // (process-log row 43).
    expect(DICTIONARY.length).toBeGreaterThan(0);
  });

  describe("finds a place the dictionary knows", () => {
    it.each([
      ["exact name", "Idag står vi på Järntorget 11-14", "jarntorget"],
      ["lowercased by the caption", "lunch vid järntorget", "jarntorget"],
      ["shouted", "LUNCH VID JÄRNTORGET IDAG", "jarntorget"],
      ["an ASCII alias for a seeded misspelling", "lunch vid jarntorget", "jarntorget"],
      ["a nickname alias", "Vi ses vid Kopparmärra 12-15", "kungsportsplatsen"],
      ["a multi-word alias", "Vi står på Gustaf Adolfs torg idag", "gustaf-adolfs-torg"],
      ["a spelling variant of a multi-word alias", "Gustav Adolfs torg 11-14", "gustaf-adolfs-torg"],
      ["a second alias for the same entry", "Lunch på Lindholmspiren", "lindholmen"],
      ["mid-sentence with punctuation around it", "Tacos, Heden, 11-14!", "heden"],
      ["at the very start of the caption", "Heden idag 11-14", "heden"],
      ["at the very end of the caption", "Vi kör lunch idag på Heden", "heden"],
    ])("%s", (_case, caption, expected) => {
      expect(idOf(caption)).toBe(expected);
    });

    it("survives an emoji used as a separator", () => {
      // `normalizeCaption` turns an emoji into a space precisely so this works —
      // "Järntorget🌮11-14" is one unmatchable token if the emoji is deleted.
      expect(idOf("Järntorget🌮11-14")).toBe("jarntorget");
    });

    it("reads a place named only in a hashtag", () => {
      // The reason #78 stopped stripping hashtag text. Before it, this caption
      // normalized to "Idag står vi på 11-14" and a truck that said exactly where
      // it was rendered as a grey marker.
      expect(idOf("Idag står vi på #Järntorget 11-14")).toBe("jarntorget");
    });

    it("reads a place out of a segmented multi-word hashtag", () => {
      expect(idOf("Lunch idag #LunchPåJärntorget")).toBe("jarntorget");
    });

    it("matches decomposed Swedish letters once step 0 has composed them", () => {
      // Text from Apple devices arrives NFD: "ä" as "a" plus a combining diaeresis.
      // `normalizeCaption` composes to NFC, which is why this test goes through it
      // — passing the decomposed form straight to `extractLocation` would not match,
      // and that is the documented contract rather than a bug.
      const decomposed = "lunch vid Järntorget";

      expect(decomposed.normalize("NFC")).not.toBe(decomposed);
      expect(idOf(decomposed)).toBe("jarntorget");
    });
  });

  describe("returns null when no known place is named", () => {
    it.each([
      ["no place at all", "God lunch idag allihopa!"],
      ["a Gothenburg place not in the dictionary", "Vi står på Olskrokstorget idag"],
      ["an address rather than a named place", "Vi står på Andra Långgatan 12"],
      ["an empty caption", ""],
      ["only punctuation and emoji", "🌮🌮🌮 !!!"],
    ])("%s", (_case, caption) => {
      expect(extract(caption)).toBeNull();
    });

    it("never matches an alias sitting inside a longer word", () => {
      // `\b` would match here and this is not hypothetical — it is why the boundary
      // lookarounds exist. "sedan hedenhös" is an ordinary Swedish idiom meaning
      // "since time immemorial", and matching "Heden" in it pins a truck to a
      // sports field over a figure of speech.
      expect(extract("Vi har kört tacos sedan hedenhös")).toBeNull();
    });

    it.each([
      ["a letter in front", "Vi står på XHeden idag"],
      ["a Swedish vowel in front — where \\b would wrongly see a boundary", "snöheden"],
      ["letters after, beyond a genitive s", "Vi står vid Hedenplatsen"],
      ["a digit in front", "spår 3heden"],
    ])("rejects an alias with %s", (_case, caption) => {
      expect(extract(caption)).toBeNull();
    });
  });

  describe("the Swedish genitive", () => {
    it.each([
      ["Vi står vid Nordstans entré", "nordstan", "Nordstans"],
      ["Järntorgets hållplats, 11-14", "jarntorget", "Järntorgets"],
      ["Lunch vid Lindholmens pir", "lindholmen", "Lindholmens"],
    ])("%s", (caption, expectedId, expectedMatched) => {
      // A miss here is not a coarser pin, it is no pin: `extractAddressCandidate`
      // finds no street suffix in "Nordstans" either, so the caption would resolve
      // to no location at all.
      expect(extract(caption)).toEqual({
        entry: DICTIONARY.find((entry) => entry.id === expectedId),
        matched: expectedMatched,
      });
    });

    it("does not treat any other letter as a case ending", () => {
      expect(extract("Vi står vid Nordstanx")).toBeNull();
    });
  });

  describe("leftmost-longest decides between candidates", () => {
    it("takes the longer alias when two overlap at the same position", () => {
      // "Eriksbergstorget" contains "Eriksberg". Both are aliases of one entry, so
      // the id is the same either way — `matched` is what proves which one won, and
      // `matched` is what reaches `address_raw`.
      expect(extract("Lunch på Eriksbergstorget idag")).toMatchObject({
        matched: "Eriksbergstorget",
      });
    });

    it("takes the first place named when a caption names two", () => {
      // Longest-wins would answer "jarntorget" here and pin the truck at tomorrow's
      // spot. A caption leads with its subject.
      expect(idOf("Lunch på Heden idag, imorgon Järntorget")).toBe("heden");
    });

    it("is decided by position, not by dictionary order", () => {
      // The same two places, reversed. If the answer were coming from iteration
      // order over DICTIONARY rather than from position in the caption, one of
      // these two assertions would fail.
      expect(idOf("Lunch på Järntorget idag, imorgon Heden")).toBe("jarntorget");
    });
  });

  describe("what it returns", () => {
    it("carries the entry's coordinates, so a hit needs no geocoding", () => {
      const found = extract("Idag lunch vid Järntorget 11-14 🌮 #gbg");

      expect(found?.entry).toMatchObject({
        id: "jarntorget",
        lat: expect.any(Number),
        lng: expect.any(Number),
      });
    });

    it("reports the caption's own spelling in `matched`, not the canonical alias", () => {
      // The whole reason the return is `LocationMatch` and not `DictionaryEntry`:
      // `address_raw` is defined as the text the location was resolved FROM.
      const found = extract("lunch vid jarntorget");

      expect(found?.matched).toBe("jarntorget");
      expect(found?.entry.match[0]).toBe("Järntorget");
    });

    it("returns a `matched` span that is a substring of the normalized caption", () => {
      const caption = "Vi ses vid KOPPARMÄRRA idag";
      const found = extractLocation(normalizeCaption(caption));

      expect(found).not.toBeNull();
      expect(normalizeCaption(caption)).toContain(found?.matched);
    });
  });

  it("resolves every alias in the dictionary when it stands alone in a caption", () => {
    // The table-driven cases above cover the interesting shapes; this covers the
    // DATA. An entry added later with a stray leading space, an unescaped
    // metacharacter or a decomposed "ä" would match nothing, and nothing else in
    // this suite would notice — the failure is invisible from the outside, which is
    // exactly the kind `dictionary.test.ts` cannot catch either because it never
    // runs the matcher.
    const unresolved = DICTIONARY.flatMap((entry) =>
      entry.match
        .filter((alias) => extractLocation(normalizeCaption(`Vi står på ${alias} idag`)) === null)
        .map((alias) => `${entry.id}: ${alias}`),
    );

    expect(unresolved).toEqual([]);
  });

  it("is stable across repeated calls on the same caption", () => {
    // The regression a stray `g` flag produces: a shared global regex carries
    // `lastIndex` between calls, so the second call starts scanning mid-caption and
    // a matcher that passes every single-call test above returns null on every
    // other request in production.
    const caption = "Idag står vi på Järntorget 11-14";

    expect(extract(caption)).toEqual(extract(caption));
    expect(extract(caption)).toEqual(extract(caption));
  });
});
