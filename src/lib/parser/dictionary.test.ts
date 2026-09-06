import { describe, expect, it } from "vitest";
import { isInGothenburg } from "@/lib/geo";
import { DICTIONARY } from "./dictionary";

// The dictionary is DATA, so its tests are invariants rather than behaviour —
// there is no function here to exercise. What they defend against is a bad entry
// being added later, by hand, in a hurry, which is the realistic failure mode for
// a file whose whole content is typed-in constants.
//
// Purity is NOT asserted here. `purity.test.ts` globs this directory, so
// `dictionary.ts` is already covered by it — including the "imports nothing from
// @/lib/db, calls no fetch" half of this issue's acceptance criteria. Restating it
// per-file is what issue #75 exists to stop.

describe("DICTIONARY", () => {
  it("has entries to check", () => {
    // NOT redundant with the per-entry assertions. `it.each([])` registers zero
    // tests and reports green, so an empty or accidentally-cleared DICTIONARY
    // would silently satisfy every check below. This is the assertion that makes
    // the rest non-vacuous (process-log row 43).
    expect(DICTIONARY.length).toBeGreaterThan(0);
  });

  it("holds between 15 and 20 entries", () => {
    // The lower bound keeps the phase from shipping a dictionary too thin to prove
    // the matcher works. The UPPER bound is the one that matters and it is not
    // arbitrary tidiness: plan decision #4 caps the seed because past the obvious
    // spots every entry is an unverified guess, and this is what makes "do not
    // seed broadly" a rule rather than an intention. Raising it should mean
    // arguing with #4, which a failing test forces and a comment would not.
    expect(DICTIONARY.length).toBeGreaterThanOrEqual(15);
    expect(DICTIONARY.length).toBeLessThanOrEqual(20);
  });

  it("has a unique id for every entry", () => {
    const ids = DICTIONARY.map((entry) => entry.id);

    expect(new Set(ids).size).toBe(ids.length);
  });

  it("never uses the same match string for two places", () => {
    // COMPARED CASE-INSENSITIVELY, deliberately. `normalizeCaption` does not
    // lowercase — it leaves that to each consumer, because `address_raw` and the
    // Nominatim fallback are both better off with the original casing — so
    // `extractLocation` (#65) will fold case at its own comparison. That makes
    // "Heden" and "heden" in two different entries a genuine ambiguity even though
    // they are distinct strings, and a case-sensitive check here would wave it
    // through and leave #65 resolving a caption to whichever entry it happened to
    // scan first.
    // CONTAINMENT, not just equality. `extractLocation` will look for an alias
    // INSIDE a caption, so two entries collide whenever one alias contains
    // another — "Heden" in one entry and "Hedenplatsen" in a second means every
    // caption naming the second also matches the first, and which one wins comes
    // down to iteration order. Exact equality would call that pair distinct and
    // pass. No such pair exists today, which is precisely why this is the moment
    // to assert it: the check is free now and becomes a puzzling #65 bug later.
    //
    // Containment WITHIN one entry is fine and deliberately not flagged —
    // "Eriksberg" and "Eriksbergstorget" are two ways of naming one place, which
    // is what a `match` list is for. The failure only exists across entries.
    const aliases = DICTIONARY.flatMap((entry) =>
      entry.match.map((match) => ({ id: entry.id, match, key: match.toLowerCase() })),
    );
    const collisions: string[] = [];

    for (const a of aliases) {
      for (const b of aliases) {
        if (a.id === b.id) continue;
        if (a.key === b.key && a.id > b.id) continue; // report an exact pair once
        if (b.key.includes(a.key)) {
          collisions.push(
            `"${a.match}" (${a.id}) is contained in "${b.match}" (${b.id})`,
          );
        }
      }
    }

    expect(collisions).toEqual([]);
  });

  describe.each(DICTIONARY.map((entry) => [entry.id, entry] as const))("%s", (_id, entry) => {
    it("sits inside the Gothenburg bounding box", () => {
      // The single highest-value assertion in this file. It catches the two
      // failures that hand-entered coordinates actually produce and that reading
      // the file does not reveal: a transposed pair — Järntorget reversed is
      // 11.95 N / 57.70 E, in the Arabian Sea — and a stray 0/0 from an entry
      // added without coordinates. Both look entirely plausible in source.
      //
      // Asserted through the real `isInGothenburg` rather than open-coded
      // comparisons, so the box has one definition (#55) and cannot drift.
      expect(isInGothenburg(entry.lat, entry.lng)).toBe(true);
    });

    it("stores coordinates as numbers", () => {
      // Nominatim returns lat/lon as STRINGS and the seeding script converts them.
      // A stub pasted in without that conversion still type-checks nowhere but
      // would compare and format plausibly all the way into `locations.latitude`,
      // which is precisely why `isInGothenburg` carries its own Number.isFinite
      // guard — that guard means the bounding-box test above would NOT catch it.
      expect(typeof entry.lat).toBe("number");
      expect(typeof entry.lng).toBe("number");
    });

    it("has at least one match string, none of them blank or padded", () => {
      expect(entry.match.length).toBeGreaterThan(0);

      for (const match of entry.match) {
        // A blank or whitespace-padded alias is a substring-match landmine: an
        // empty string matches every caption, and " Heden" fails to match a
        // caption that says "Heden". Neither is visible when skimming the array.
        expect(match).not.toBe("");
        expect(match).toBe(match.trim());
      }
    });

    it("stores every match string in NFC", () => {
      // `normalizeCaption` NFC-composes every caption before any extractor sees it,
      // precisely because Apple devices send NFD and much of the Mailgun lane comes
      // from phones. So a caption's "å" is always one codepoint by the time
      // `extractLocation` runs.
      //
      // An alias pasted in NFD — "a" plus a combining ring, which renders
      // IDENTICALLY in every editor and in this file — could therefore never match
      // anything, and every other assertion in this suite would still pass: it is
      // non-empty, trimmed, unique, and inside the bounding box. Ten of the sixteen
      // entries have a diacritic in at least one alias, so the exposure is most of
      // the dictionary, and the symptom would be "Gårda just never matches" with
      // nothing in the source to look at.
      for (const match of entry.match) {
        expect(match).toBe(match.normalize("NFC"));
      }
    });

    it("does not repeat a match string within its own list", () => {
      const folded = entry.match.map((match) => match.toLowerCase());

      expect(new Set(folded).size).toBe(folded.length);
    });

    it("records where its coordinate came from", () => {
      expect(["manual", "nominatim"]).toContain(entry.source);
      expect(typeof entry.verified).toBe("boolean");
    });

    it("has a non-empty address", () => {
      expect(entry.address.trim()).not.toBe("");
    });
  });
});
