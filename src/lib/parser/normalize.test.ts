import { describe, expect, it } from "vitest";
import { normalizeCaption } from "@/lib/parser/normalize";

describe("normalizeCaption", () => {
  it("handles the acceptance-criteria caption end to end", () => {
    expect(normalizeCaption("Idag lunch vid Järntorget 11-14 🌮 #gbg @truck")).toBe(
      "Idag lunch vid Järntorget 11-14",
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
      ["a hashtag", "Järntorget idag #gbg", "Järntorget idag"],
      ["several hashtags", "Lunch #gbg #foodtruck #tacos", "Lunch"],
      ["a mention", "Tack @foodtruckgbg", "Tack"],
      ["a hashtag with Swedish letters", "Vi står i #göteborg idag", "Vi står i idag"],
      ["a hashtag with digits", "Lunch #gbg2026", "Lunch"],
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
      ["run-together hashtags", "Lunch #gbg#foodtruck#lunch idag", "Lunch idag"],
      ["repeated sigils", "Lunch ##gbg idag", "Lunch idag"],
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
      expect(normalizeCaption("Lunch #food-truck idag")).toBe("Lunch idag");
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
        "Vi står i idag",
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
      expect(normalizeCaption("Järntorget 🌮 #gbg idag")).toBe("Järntorget idag");
    });
  });

  describe("what must survive", () => {
    it("preserves å, ä and ö in both cases", () => {
      expect(normalizeCaption("Vi står på Kungsportsplatsen — öppet, Åby, Ängen")).toBe(
        "Vi står på Kungsportsplatsen — öppet, Åby, Ängen",
      );
    });

    it("preserves the time range, which every later extractor depends on", () => {
      expect(normalizeCaption("🌮 Järntorget 11.30-13.00 #lunch")).toBe("Järntorget 11.30-13.00");
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
