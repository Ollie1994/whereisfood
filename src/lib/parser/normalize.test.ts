import { describe, expect, it } from "vitest";
import { normalizeCaption } from "@/lib/parser/normalize";

describe("normalizeCaption", () => {
  it("handles the acceptance-criteria caption end to end", () => {
    // ⚠ SUPERSEDES #56's criterion, which expected "#gbg" to leave nothing behind.
    // That was wrong (#78): a tag can carry the location, the date or the time, so
    // the sigil goes and the word stays. Generic tags like "gbg" become harmless
    // words — the dictionary holds specific squares, which they do not match.
    expect(normalizeCaption("Idag lunch vid Järntorget 11-14 🌮 #gbg @truck")).toBe(
      "Idag lunch vid Järntorget 11-14 gbg",
    );
  });

  it("leaves an already-clean caption untouched", () => {
    expect(normalizeCaption("Vi står vid Järntorget 11-14")).toBe("Vi står vid Järntorget 11-14");
  });

  it("returns an empty string for empty or whitespace-only input", () => {
    expect(normalizeCaption("")).toBe("");
    expect(normalizeCaption("   \n\t  ")).toBe("");
  });

  describe("emoji", () => {
    it.each([
      ["a plain pictograph", "Tacos 🌮 idag", "Tacos idag"],
      ["several in a row", "Lunch 🌮🌯🥙 idag", "Lunch idag"],
      ["a skin-tone modifier", "Vi ses 👋🏽 idag", "Vi ses idag"],
      ["a ZWJ sequence", "Kocken 👩‍🍳 står här", "Kocken står här"],
      ["a flag (regional indicators)", "Svensk mat 🇸🇪 idag", "Svensk mat idag"],
      ["a variation selector", "Sol ☀️ idag", "Sol idag"],
      ["a symbol pictograph", "Kom förbi ‼️", "Kom förbi"],
    ])("strips %s", (_label, input, expected) => {
      expect(normalizeCaption(input)).toBe(expected);
    });

    it("becomes a space, so an emoji used as a separator does not glue words", () => {
      // Deleting the emoji outright yields "Järntorget11-14" — one token that
      // neither the dictionary match nor the time extractor can see anything in,
      // so a perfectly good caption scores zero.
      expect(normalizeCaption("Vi står vid Järntorget🌮11-14")).toBe("Vi står vid Järntorget 11-14");
    });

    it("leaves no stray joiner or selector behind", () => {
      // The failure this guards: stripping the pictograph but not the invisible
      // characters that assembled it leaves codepoints that are invisible in a
      // diff and break equality comparisons downstream.
      const result = normalizeCaption("Kocken 👩🏽‍🍳 står vid Järntorget");
      expect(result).toBe("Kocken står vid Järntorget");
      expect(result).not.toMatch(/[\u{FE0F}\u{200D}]/u);
    });
  });

  describe("hashtags and mentions", () => {
    it.each([
      ["a hashtag", "Järntorget idag #gbg", "Järntorget idag gbg"],
      ["several hashtags", "Lunch #gbg #foodtruck #tacos", "Lunch gbg foodtruck tacos"],
      ["a mention", "Tack @foodtruckgbg", "Tack"],
      ["a hashtag with Swedish letters", "Vi står i #göteborg idag", "Vi står i göteborg idag"],
      ["a hashtag with digits", "Lunch #gbg2026", "Lunch gbg 2026"],
      ["an underscore handle", "Tack @food_truck_gbg", "Tack"],
    ])("strips %s", (_label, input, expected) => {
      expect(normalizeCaption(input)).toBe(expected);
    });

    it("does not mistake an email address for a mention", () => {
      // Without the lookbehind this yields "Boka: info.se" — a silent corruption
      // of the one line in a caption someone might actually act on.
      expect(normalizeCaption("Boka: info@foodtruck.se")).toBe("Boka: info@foodtruck.se");
    });

    it("strips a mention at the start of a caption", () => {
      // The lookbehind must not require a preceding character; start-of-string is
      // a valid boundary.
      expect(normalizeCaption("@foodtruckgbg står vid Heden")).toBe("står vid Heden");
    });

    it.each([
      ["run-together hashtags", "Lunch #gbg#foodtruck#lunch idag", "Lunch gbg foodtruck lunch idag"],
      ["repeated sigils", "Lunch ##gbg idag", "Lunch gbg idag"],
      ["run-together mentions", "Tack @a@b", "Tack"],
    ])("strips %s", (_label, input, expected) => {
      // `String.replace` scans the ORIGINAL string, so a lookbehind still sees the
      // characters an earlier match removed — leaving the second tag behind. These
      // are the fixpoint cases. `#gbg#foodtruck#lunch` is a normal way to write
      // Instagram tags, not an edge case.
      expect(normalizeCaption(input)).toBe(expected);
    });

    it("handles the dots and hyphens that appear inside real handles and tags", () => {
      // Instagram handles routinely contain dots.
      expect(normalizeCaption("Idag med @gbg.foodtruck vid Heden 11-14")).toBe(
        "Idag med vid Heden 11-14",
      );
      expect(normalizeCaption("Lunch #food-truck idag")).toBe("Lunch food-truck idag");
    });

    it("does not let a hashtag swallow the word after a full stop", () => {
      // A hashtag terminates at a dot — Instagram's own rule — so "#gbg.Heden" is
      // the tag `#gbg` plus the word "Heden". Allowing `.` in the hashtag body
      // deleted the location the caption was about.
      //
      // The orphaned "." is left behind, and left deliberately: consuming it means
      // letting the tag reach past the dot again, which is the swallow. A leading
      // dot is cosmetic — the word is still a separate token to any boundary-aware
      // matcher — whereas a deleted location name is not recoverable.
      expect(normalizeCaption("#gbg.Heden idag 11-14")).toBe("gbg.Heden idag 11-14");
      expect(normalizeCaption("Lunch #foodtruck.Järntorget 11-14")).toBe(
        "Lunch foodtruck.Järntorget 11-14",
      );
    });

    it("keeps a location written as a tag — the reason tag text is preserved", () => {
      // The failure this whole behaviour exists to prevent: extractLocation had
      // nothing to match, the post scored 0.2, and a truck that told us exactly
      // where it was rendered as a grey marker.
      expect(normalizeCaption("Idag står vi på #Järntorget 11-14")).toBe(
        "Idag står vi på Järntorget 11-14",
      );
    });

    describe("tag text is segmented, not merely unwrapped", () => {
      // A multi-word tag is written without spaces, so removing the sigil alone
      // leaves one token no extractor can read. These recover the boundaries the
      // tag's own formatting marks.
      it.each([
        ["lowercase to uppercase", "#LunchJärntorget", "Lunch Järntorget"],
        ["letter to digit", "#lunch11-14", "lunch 11-14"],
        ["digit to letter", "#11-14Heden", "11-14 Heden"],
        ["all three at once", "#Lunch11-14Heden", "Lunch 11-14 Heden"],
        ["a date as a tag", "#Imorgon", "Imorgon"],
        ["a time word as a tag", "#lunchtid", "lunchtid"],
      ])("splits %s", (_label, input, expected) => {
        expect(normalizeCaption(input)).toBe(expected);
      });

      it("does not shred an uppercase run", () => {
        // Splitting before every capital would give "G B G". The rule is
        // lowercase→uppercase specifically, so acronyms survive.
        expect(normalizeCaption("#GBG")).toBe("GBG");
        expect(normalizeCaption("#FoodTruckGBG")).toBe("Food Truck GBG");
      });

      it("does not break a time range while exposing it", () => {
        // The hyphen sits between two digits, which no rule touches. Getting this
        // wrong would mean the fix meant to expose a time is what destroys it.
        expect(normalizeCaption("#11-14")).toBe("11-14");
        expect(normalizeCaption("#11.30-13.00")).toBe("11.30-13.00");
      });

      it("splits on an underscore, which the tag body allows", () => {
        // The one boundary a tag can state outright. Unlike the all-lowercase case
        // below, it needs no wordlist — leaving it glued would be the same
        // grey-marker failure this behaviour exists to prevent.
        expect(normalizeCaption("Idag står vi på #lunch_järntorget 11-14")).toBe(
          "Idag står vi på lunch järntorget 11-14",
        );
      });

      it("does not detach a Swedish street entrance letter", () => {
        // "Nordostpassagen 61B" is an address. Splitting the trailing letter gives
        // "61 B", so the same address would parse differently written as a tag than
        // written as prose. A digit is followed by a WORD, not by a suffix.
        expect(normalizeCaption("Nordostpassagen 61B, #Nordostpassagen61B")).toBe(
          "Nordostpassagen 61B, Nordostpassagen 61B",
        );
        // ...while a real word after digits still splits.
        expect(normalizeCaption("#5Heden")).toBe("5 Heden");
      });

      it("splits an uppercase run from a following word", () => {
        // "#GBGJärntorget" has no lowercase letter at the boundary, so the
        // lowercase→uppercase rule cannot see it. Without a rule for an acronym
        // followed by a word, the documented limit was wider than stated: not just
        // all-lowercase tags, but any acronym glued to a word.
        expect(normalizeCaption("#GBGJärntorget")).toBe("GBG Järntorget");
        expect(normalizeCaption("#GBGLunch")).toBe("GBG Lunch");
        // ...and an acronym at the END must still not be split.
        expect(normalizeCaption("#FoodTruckGBG")).toBe("Food Truck GBG");
      });

      it("leaves an all-lowercase run-together tag glued — a known limit", () => {
        // No marked boundary to find. Recovering this needs a wordlist, and step 0
        // must not depend on the dictionary; #65 is where it could be matched as a
        // substring instead. Pinned so the limit is documented behaviour.
        expect(normalizeCaption("#järntorgetidag")).toBe("järntorgetidag");
      });

      it("preserves Swedish letters through segmentation", () => {
        expect(normalizeCaption("#MatPåHeden")).toBe("Mat På Heden");
        expect(normalizeCaption("#göteborg")).toBe("göteborg");
      });
    });

    it("keeps the location name when a caption writes it after a tag", () => {
      // The property that matters, stated independently of the stray punctuation:
      // the word survives.
      expect(normalizeCaption("#gbg.Heden idag 11-14")).toContain("Heden");
      expect(normalizeCaption("Lunch #foodtruck.Järntorget 11-14")).toContain("Järntorget");
    });

    it("still strips a mention that runs directly on from a hashtag", () => {
      // Ordinary Instagram style. Preserving the tag's text puts a letter directly
      // before the `@`, where the email lookbehind refuses to match — so the handle
      // survived into the caption. The fixpoint cannot recover it, because the
      // blocking character is real text rather than something a later pass removes.
      expect(normalizeCaption("Lunch #gbg@foodtruckgbg")).toBe("Lunch gbg");
    });

    it("does not treat a mid-word sigil as a tag", () => {
      // Neither sigil starts a token mid-word. Without the lookbehind on `#`,
      // "info#1@foodtruck.se" was read as a tag, and the trailing space emitted
      // before the `@` then let the mention rule eat the domain, leaving "info 1".
      expect(normalizeCaption("Boka: info#1@foodtruck.se")).toBe("Boka: info#1@foodtruck.se");
      expect(normalizeCaption("Boka: info#hash")).toBe("Boka: info#hash");
    });

    it("still separates run-together tags despite that lookbehind", () => {
      // The lookbehind blocks the second `#` in "#gbg#foodtruck", so the trailing
      // space is what lets a later pass reach it. The fixpoint alone does NOT
      // recover this: without the space the replaced text leaves a letter in front
      // of the next `#`, and the string is already at a fixpoint — a wrong one.
      expect(normalizeCaption("Lunch #gbg#foodtruck#lunch idag")).toBe(
        "Lunch gbg foodtruck lunch idag",
      );
    });

    it("does not split a dotted time range while separating a mention", () => {
      // The fix for the case above must be conditional. A hashtag body stops at a
      // dot, so "#11.30-13.00" is `#11` plus ".30-13.00"; an unconditional trailing
      // space yields "11 .30-13.00" and cuts a time range in half. A leftover
      // handle is noise; a destroyed time is data loss.
      expect(normalizeCaption("#11.30-13.00")).toBe("11.30-13.00");
      expect(normalizeCaption("Lunch 11.30-13.00 #gbg")).toBe("Lunch 11.30-13.00 gbg");
    });

    it("does not eat a sentence-ending full stop after a mention", () => {
      // The separator must be followed by a word character to count as part of the
      // handle, or "Tack @truck." loses its punctuation too.
      expect(normalizeCaption("Tack @truck.")).toBe("Tack .");
    });
  });

  describe("Unicode normalisation", () => {
    // "ä" has two encodings: one codepoint (NFC) or "a" plus a combining diaeresis
    // (NFD). Apple devices emit NFD, so much of the Mailgun lane arrives that way,
    // and every regex in the pipeline fails on it. This is the one place to fix it.
    it("composes NFD input so the tag class can see Swedish letters", () => {
      // Without NFC the combining mark is `\p{M}` — outside the tag body — so the
      // tag strips to a stray diaeresis plus "teborg".
      expect(normalizeCaption("Vi står i #göteborg idag".normalize("NFD"))).toBe(
        "Vi står i göteborg idag",
      );
    });

    it("produces NFC output regardless of input form", () => {
      const fromNfd = normalizeCaption("Järntorget".normalize("NFD"));
      expect(fromNfd).toBe("Järntorget");
      expect(fromNfd).toBe(fromNfd.normalize("NFC"));
    });
  });

  describe("whitespace", () => {
    it.each([
      ["runs of spaces", "Lunch    idag", "Lunch idag"],
      ["newlines", "Lunch\nidag", "Lunch idag"],
      ["several newlines", "Lunch\n\n\nidag", "Lunch idag"],
      ["tabs", "Lunch\tidag", "Lunch idag"],
      ["a non-breaking space", "Lunch idag", "Lunch idag"],
      ["leading and trailing space", "  Lunch idag  ", "Lunch idag"],
    ])("collapses %s", (_label, input, expected) => {
      expect(normalizeCaption(input)).toBe(expected);
    });

    it("closes the gaps left by stripping, rather than leaving a run of spaces", () => {
      // Order dependency: strip first, collapse second. Reversing them leaves
      // "Järntorget   idag".
      expect(normalizeCaption("Järntorget 🌮 #gbg idag")).toBe("Järntorget gbg idag");
    });
  });

  describe("what must survive", () => {
    it("preserves å, ä and ö in both cases", () => {
      expect(normalizeCaption("Vi står på Kungsportsplatsen — öppet, Åby, Ängen")).toBe(
        "Vi står på Kungsportsplatsen — öppet, Åby, Ängen",
      );
    });

    it("preserves the time range, which every later extractor depends on", () => {
      expect(normalizeCaption("🌮 Järntorget 11.30-13.00 #lunch")).toBe("Järntorget 11.30-13.00 lunch");
    });

    it("preserves ordinary punctuation", () => {
      expect(normalizeCaption("Järntorget, 11-14. Välkomna!")).toBe("Järntorget, 11-14. Välkomna!");
    });

    it("does not lowercase", () => {
      // A deliberate boundary: address_raw and the Nominatim candidate both read
      // better with original casing, and matching is each consumer's own concern.
      // Lowercasing here could not be undone downstream; not lowercasing can.
      expect(normalizeCaption("Järntorget")).toBe("Järntorget");
    });
  });

  it.each([
    ["the acceptance-criteria caption", "Idag lunch vid Järntorget 11-14 🌮 #gbg @truck"],
    ["run-together tags and mentions", "Tack @a@b #x#y 🌮  idag"],
    ["NFD input", "Vi står vid Järntorget 11-14 #göteborg".normalize("NFD")],
  ])("is idempotent for %s", (_label, input) => {
    // Now true by construction rather than by luck: before the fixpoint, a second
    // pass stripped tags the first pass had left behind.
    const once = normalizeCaption(input);
    expect(normalizeCaption(once)).toBe(once);
  });
});
