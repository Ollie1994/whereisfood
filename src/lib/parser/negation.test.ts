import { describe, expect, it } from "vitest";
import {
  CANCELLATION_MARKERS,
  CANCELLATION_PHRASES,
  detectNegation,
  NEGATORS,
  OPEN_STATES,
  OPERATING_VERBS,
} from "@/lib/parser/negation";
import { normalizeCaption } from "@/lib/parser/normalize";

describe("detectNegation", () => {
  describe("fires on a cancellation", () => {
    it.each([
      ["inte", "Vi kör inte idag"],
      ["ej", "Ej öppet idag"],
      ["inställt", "Inställt idag tyvärr"],
      ["inställd", "Dagens lunch är inställd"],
      ["inställda", "Alla pass är inställda idag"],
      ["inställs", "Lunchen inställs idag"],
      ["stängt", "Vi har stängt idag"],
      ["stängd", "Vagnen är stängd idag"],
      ["stängda", "Vi är stängda hela veckan"],
      ["ställer in", "Vi ställer in idag"],
      ["ställs in", "Dagens lunch ställs in"],
    ])("detects %s in context", (_token, caption) => {
      expect(detectNegation(caption)).toBe(true);
    });

    it("is case-insensitive, since normalizeCaption does not lowercase", () => {
      expect(detectNegation("INSTÄLLT IDAG")).toBe(true);
      expect(detectNegation("Inställt idag")).toBe(true);
      expect(detectNegation("inställt idag")).toBe(true);
    });

    it("fires at the very start and the very end of a caption", () => {
      // Boundary lookarounds must accept start-of-string and end-of-string.
      expect(detectNegation("Inställt")).toBe(true);
      expect(detectNegation("Idag är det inställt")).toBe(true);
    });

    it("fires when the token is against punctuation", () => {
      expect(detectNegation("Inställt!")).toBe(true);
      expect(detectNegation("(inställt)")).toBe(true);
      expect(detectNegation("Tyvärr: inställt.")).toBe(true);
    });

    it("covers every self-sufficient marker in the exported vocabulary", () => {
      // Ties the list to the tests: a marker added to negation.ts without a case
      // here still has to pass this, and a marker removed makes it fail.
      for (const token of [...CANCELLATION_MARKERS, ...CANCELLATION_PHRASES]) {
        expect(detectNegation(`Idag ${token} tyvärr`)).toBe(true);
      }
    });

    it("covers every negator paired with every operating verb", () => {
      // The particle FOLLOWS the finite verb in Swedish: "Vi kör inte idag".
      for (const verb of OPERATING_VERBS) {
        for (const negator of NEGATORS) {
          expect(detectNegation(`Vi ${verb} ${negator} idag`)).toBe(true);
        }
      }
    });

    it("covers every negator paired with every open state", () => {
      // Here the particle PRECEDES: "Ej öppet idag".
      for (const state of OPEN_STATES) {
        for (const negator of NEGATORS) {
          expect(detectNegation(`Idag ${negator} ${state}`)).toBe(true);
        }
      }
    });
  });

  describe("does not fire on an ordinary caption", () => {
    it.each([
      ["a plain location post", "Vi står vid Järntorget 11-14"],
      ["an opening announcement", "Öppet idag 11-14 på Heden"],
      ["a menu post", "Dagens rätt: tacos och burritos"],
      ["an empty caption", ""],
    ])("stays quiet for %s", (_label, caption) => {
      expect(detectNegation(caption)).toBe(false);
    });
  });

  describe("word boundaries — the substring false positives", () => {
    // `\b` is ASCII-only: it treats å, ä and ö as non-word characters and so
    // manufactures boundaries inside Swedish compounds. These are the cases that
    // separate a Unicode-aware boundary from `\b`.
    it.each([
      ["vinter contains 'inte'", "Vi kör vinterlunch idag"],
      ["internet contains 'inte' at the start", "Vi har internet i vagnen"],
      ["intensiv contains 'inte'", "Intensiv dag på Heden"],
      ["mejeri contains 'ej'", "Vi använder mejeriprodukter"],
      ["grejer contains 'ej'", "Massa goda grejer idag"],
      ["nej contains 'ej'", "Nej till plast, ja till pizza"],
    ])("does not fire when %s", (_label, caption) => {
      expect(detectNegation(caption)).toBe(false);
    });

    it("does not fire on a compound whose preceding letter is å, ä or ö", () => {
      // The specific case `\b` gets wrong: "ö" reads as a non-word character, so
      // /\bstängt\b/ finds a boundary inside the word and matches.
      expect(detectNegation("Vi har snöstängt")).toBe(false);
      expect(detectNegation("Vi kör påstängt")).toBe(false);
    });

    it("does not fire on a phrase run together", () => {
      expect(detectNegation("ställerin")).toBe(false);
    });
  });

  describe("deliberate exclusions", () => {
    // Each of these looks like a negation and is left out on purpose. Re-adding
    // one means deleting an assertion that records why it was excluded.
    it("does not fire on 'stänger' — that is a closing TIME, not a cancellation", () => {
      // The most ordinary thing a truck posts. Treating it as a cancellation would
      // delete the location of every truck that announces its closing hour.
      expect(detectNegation("Vi stänger 14 idag")).toBe(false);
      expect(detectNegation("Vi stänger tidigt idag")).toBe(false);
    });

    it("does not fire on 'ingen' / 'inget' / 'inga' — as often positive as not", () => {
      // "No queue today" is an invitation, not a cancellation, and the two cannot
      // be told apart without reading the object.
      expect(detectNegation("Ingen kö idag!")).toBe(false);
      expect(detectNegation("Inget slut på tacos")).toBe(false);
      expect(detectNegation("Inga köer på Heden")).toBe(false);
    });

    it("does not fire on 'tyvärr' alone", () => {
      // Modifies anything — including a caption that means they are present.
      expect(detectNegation("Tyvärr slut på tacos, men vi står kvar")).toBe(false);
    });
  });

  describe("a bare particle is not a cancellation", () => {
    // `inte` and `ej` negate whatever they attach to. Matching them lexically says
    // nothing about whether the truck is operating, and every caption below
    // describes a truck that is OPEN — each one would have deleted its pin.
    it.each([
      ["ej negating a payment method", "Vi tar ej kort, endast Swish. Heden 11-14"],
      ["ej negating booking", "Ej bokning, först till kvarn! Järntorget 11-14"],
      ["ej negating a menu item", "Ej vegetariskt idag tyvärr, Heden 11-14"],
      ["inte in an imperative invitation", "Glöm inte att vi står på Heden 11-14!"],
      ["inte in a call to action", "Missa inte dagens lunch, Järntorget 11-14"],
      ["inte negating a closing time", "Vi stänger inte förrän 15 idag"],
      ["inte negating a queue", "Det är inte långa köer idag"],
    ])("stays quiet for %s", (_label, caption) => {
      expect(detectNegation(normalizeCaption(caption))).toBe(false);
    });

    it("requires adjacency, not mere proximity", () => {
      // The distinction the whole design rests on. "Glöm inte att vi står" has the
      // particle and an operating verb three tokens apart, negating different
      // things; a proximity window would fire on it. Neighbours only.
      expect(detectNegation("Glöm inte att vi står på Heden")).toBe(false);
      expect(detectNegation("Vi står inte på Heden")).toBe(true);
    });
  });

  describe("double negatives", () => {
    // The one construction that means the opposite of the word it contains. A
    // marker with a particle immediately in front of it is suppressed entirely.
    it.each([
      ["inte stängt", "Vi har inte stängt, vi står på Heden 11-14"],
      ["ej stängt", "Ej stängt idag, välkomna!"],
      ["inte inställt", "Det är inte inställt, vi kör som vanligt"],
    ])("does not fire on %s", (_label, caption) => {
      expect(detectNegation(normalizeCaption(caption))).toBe(false);
    });

    it("still fires on the marker when no particle precedes it", () => {
      // The suppression must not swallow the ordinary case.
      expect(detectNegation("Vi har stängt idag")).toBe(true);
      expect(detectNegation("Det är inställt idag")).toBe(true);
    });
  });

  describe("composed with normalizeCaption, as the pipeline runs it", () => {
    // detectNegation's precondition is normalized (therefore NFC) text. These
    // assert the composition, because the failure they guard is invisible in
    // either module alone: nine of the eleven tokens contain "ä", so NFD input
    // silently returns false for a genuine cancellation — a truck's pin would
    // never be removed, with nothing anywhere reporting a problem.
    it.each([
      ["Inställt idag", true],
      ["Vi har stängt idag", true],
      ["Vi står vid Järntorget 11-14", false],
    ])("agrees between NFC and NFD input for %s", (caption, expected) => {
      expect(detectNegation(normalizeCaption(caption))).toBe(expected);
      expect(detectNegation(normalizeCaption(caption.normalize("NFD")))).toBe(expected);
    });

    it("still fires when the caption is dressed up the way a real post is", () => {
      expect(detectNegation(normalizeCaption("😢 INSTÄLLT idag! #gbg @foodtruckgbg"))).toBe(true);
    });
  });

  it("returns the same answer when called repeatedly", () => {
    // Pins the absence of the `g` flag. A global regex carries `lastIndex` across
    // `.test()` calls, so a shared instance alternates true/false on the same
    // input — a bug that passes any single-call test.
    const caption = "Inställt idag";
    expect(detectNegation(caption)).toBe(true);
    expect(detectNegation(caption)).toBe(true);
    expect(detectNegation(caption)).toBe(true);
  });
});
