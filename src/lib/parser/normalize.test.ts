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

  it("is idempotent — normalizing twice changes nothing", () => {
    const once = normalizeCaption("Idag lunch vid Järntorget 11-14 🌮 #gbg @truck");
    expect(normalizeCaption(once)).toBe(once);
  });
});
