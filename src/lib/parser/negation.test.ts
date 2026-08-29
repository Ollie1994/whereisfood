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
      // "Glöm inte att vi står" has the particle and an operating verb three tokens
      // apart, negating different things; a proximity window would fire on it.
      expect(detectNegation("Glöm inte att vi står på Heden")).toBe(false);
      // Adjacency alone is still not sufficient — see the block below — but it
      // remains necessary: with a time directly after it, the collocation cancels.
      expect(detectNegation("Vi står inte idag")).toBe(true);
      // The time must be directly after. "Vi står inte där idag" is missed, because
      // nothing lexical separates the intervening "där" from the "pizza" in
      // "Vi kör inte pizza idag" — and that one must not fire. Fail-safe direction.
      expect(detectNegation("Vi står inte där idag")).toBe(false);
    });
  });

  describe("adjacency alone is not sufficient — each rule constrains its other side", () => {
    // #81. These fired on adjacency alone, and each describes a truck that is OPEN,
    // so each deleted its location. The fix is an allowlist of the contexts a real
    // cancellation appears in, NOT a denylist of imperatives: a context nobody
    // listed leaves the guard quiet, whereas an imperative nobody listed would make
    // it delete. Only one of those directions is safe to leave incomplete.
    it.each([
      ["an imperative invitation", "Glöm inte öppet idag"],
      ["another imperative invitation", "Missa inte öppet hus på Heden"],
      ["an invitation after a location", "Lunch på Heden 11-14, glöm inte öppet till 15"],
      ["a negated menu item", "Vi kör inte pizza idag men tacos"],
      ["a negated menu item, other order", "Vi serverar inte tacos idag, bara burgare"],
    ])("stays quiet for %s", (_label, caption) => {
      expect(detectNegation(normalizeCaption(caption))).toBe(false);
    });

    it.each([
      ["a particle after a copula", "Vi har inte öppet idag"],
      ["a particle after 'är'", "Vi är inte öppna idag"],
      ["a particle opening the caption", "Ej öppet idag"],
      ["a particle after the date it applies to", "Idag ej öppet"],
      ["a particle after a clause break", "Lunch imorgon, ej öppet idag"],
      ["a verb, particle and time", "Vi kör inte idag"],
      ["a verb and particle ending the clause", "Vi kör inte."],
      ["a weekday with a preposition", "Vi kör inte på måndag"],
    ])("still cancels for %s", (_label, caption) => {
      expect(detectNegation(normalizeCaption(caption))).toBe(true);
    });

    it.each([
      ["är", "Vi är inte öppna förrän 12"],
      ["har, with a following time", "Vi har inte öppet förrän 13 idag, då kör vi"],
      ["kommer", "Vi kommer inte öppna förrän 12 idag"],
      ["innan", "Vi har inte öppet innan 12"],
    ])("does not fire on a delayed opening via %s", (_label, caption) => {
      // "Inte öppet FÖRRÄN 12" says they open at 12. The verb form of this is
      // already excluded by keeping `stänger` out of OPERATING_VERBS; the copula
      // form needed its own guard, because `är` and `har` belong in AUXILIARIES.
      // This is the one wrong-direction failure the allowlist did not cover.
      expect(detectNegation(normalizeCaption(caption))).toBe(false);
    });

    it.each([
      ["a fronted time inverting the subject", "Idag är vi inte öppna"],
      ["the same with 'har'", "Idag har vi inte öppet"],
      ["a fronted 'imorgon'", "Imorgon har vi inte öppet"],
      ["a sentence adverb before the particle", "Vi är dessvärre inte öppna idag"],
    ])("still cancels with V2 inversion — %s", (_label, caption) => {
      // Swedish is a V2 language: fronting the time inverts the subject, so the
      // auxiliary no longer touches the particle. Requiring adjacency there missed
      // the most idiomatic phrasing of a cancellation entirely.
      expect(detectNegation(normalizeCaption(caption))).toBe(true);
    });

    it.each([
      ["a leading dash", "- Ej öppet idag"],
      ["a leading bullet", "• Ej öppet idag"],
      ["parentheses", "(Ej öppet idag)"],
    ])("treats %s as a clause boundary", (_label, caption) => {
      // Captions are punctuated loosely and often written one clause per line with
      // a leading marker. Only `.` and `,` would miss the dominant shape.
      expect(detectNegation(normalizeCaption(caption))).toBe(true);
    });

    it.each([
      ["alls", "Vi kör inte alls idag"],
      ["hela", "Vi kör inte hela veckan"],
      ["nästa", "Vi kör inte nästa vecka"],
    ])("allows the quantifier %s between the particle and the time", (_label, caption) => {
      expect(detectNegation(normalizeCaption(caption))).toBe(true);
    });

    it.each([
      ["a full stop", "Vi kör inte."],
      ["an exclamation mark", "Vi kör inte!"],
      ["the end of the caption", "Vi kör inte"],
    ])("treats %s as the end of the clause", (_label, caption) => {
      expect(detectNegation(normalizeCaption(caption))).toBe(true);
    });

    it.each([
      ["a dash", "Vi kör inte - pizza idag men tacos"],
      ["an en dash", "Vi kör inte – tacos istället"],
      ["a comma", "Vi kör inte, pizza idag"],
    ])("does NOT treat %s as the end of the clause", (_label, caption) => {
      // Ending a clause is not symmetric with starting one. A comma or dash
      // CONTINUES the sentence, so what follows may be the object the particle
      // actually negated — which is the bug this whole issue exists to fix,
      // reintroduced through different punctuation. Only a strong terminator proves
      // the verb took no object.
      expect(detectNegation(normalizeCaption(caption))).toBe(false);
    });

    it("accepts the cost of that: a weak terminator before a real clause is missed", () => {
      // "Vi kör inte - vi vilar idag" is a genuine cancellation and is now quiet.
      // Nothing lexical separates "vi vilar" from "pizza", and a missed cancellation
      // expires within hours where a false one deletes a truck standing there.
      expect(detectNegation(normalizeCaption("Vi kör inte - vi vilar idag"))).toBe(false);
    });

    it.each([
      ["open to children", "Vi har inte öppet för barn"],
      ["open to groups", "Vi är inte öppna för grupper"],
    ])("does not fire on a restriction — %s", (_label, caption) => {
      // The particle negates whom the truck is open TO, not whether it is open.
      // Same class as "Vi tar ej kort": the state must land on a time or end the
      // clause, symmetrically with the verb rule.
      expect(detectNegation(normalizeCaption(caption))).toBe(false);
    });

    it("misses a bare line break as a clause boundary — a known limit", () => {
      // normalizeCaption collapses newlines to spaces, so nothing marks where the
      // clause ended. Fixing it means step 0 preserving a clause marker, which
      // changes its contract. Pinned so the limit is documented behaviour.
      expect(detectNegation(normalizeCaption("Vi hörs snart\nEj öppet idag"))).toBe(false);
    });

    it("resolves the relocation ambiguity toward NOT cancelling", () => {
      // This was a documented limit and is now settled, because what follows the
      // particle is a PLACE rather than a time. It fell out of the constraint added
      // for "kör inte pizza" rather than being aimed at — which is the sign the rule
      // is about the grammar and not about the reported cases.
      expect(detectNegation("Vi står inte vid Järntorget utan på Heden")).toBe(false);
      // The accepted cost, pinned so it is a decision rather than a surprise: a
      // genuine "we are not at X today" is missed. Both readings are live, and a
      // missed cancellation expires within hours while a false one deletes a truck
      // standing somewhere else.
      expect(detectNegation("Vi står inte på Heden idag")).toBe(false);
    });

    it("behaves identically whether the words came from prose or from a tag", () => {
      // #78 preserved hashtag text, which erased `#` as a syntactic boundary and let
      // a prose particle bind to a tag-supplied word. Fixing the prose rule closes
      // the tag form too — that it needed no separate handling is the point.
      const pairs: ReadonlyArray<[prose: string, tagged: string]> = [
        ["Glöm inte öppet idag", "Glöm inte #ÖppetIdag"],
        ["Missa inte öppet hus, vi står på Heden", "Missa inte #ÖppetHus vi står på Heden"],
        ["Vi kör inte pizza idag men tacos", "Vi kör #IntePizzaIdag men tacos"],
      ];
      for (const [prose, tagged] of pairs) {
        expect(detectNegation(normalizeCaption(tagged))).toBe(
          detectNegation(normalizeCaption(prose)),
        );
        expect(detectNegation(normalizeCaption(tagged))).toBe(false);
      }
    });
  });

  describe("a delayed opening is checked over the clause, not at one offset", () => {
    // The first guard looked only at the token directly after the open-state, so any
    // word in between walked around it — and the verb rule had no guard at all. Two
    // rules, two ways around one lookahead. Asking the question of the CLAUSE covers
    // every word order without listing what may sit between.
    it.each([
      ["a time between state and förrän", "Vi har inte öppet idag förrän 13"],
      ["the same with 'är'", "Vi är inte öppna idag förrän 12"],
      ["förrän directly after the state", "Vi är inte öppna förrän 12"],
      ["via the verb rule with öppnar", "Vi öppnar inte idag förrän 13"],
      ["via the verb rule with kommer", "Vi kommer inte imorgon förrän 13"],
      ["innan instead of förrän", "Vi har inte öppet innan 12"],
    ])("does not cancel — %s", (_label, caption) => {
      expect(detectNegation(normalizeCaption(caption))).toBe(false);
    });

    it("does not suppress across a sentence boundary", () => {
      // The clause check must stop at a strong terminator, or an unrelated later
      // sentence mentioning "förrän" would silence a real cancellation.
      expect(detectNegation(normalizeCaption("Ej öppet idag. Vi ses inte förrän imorgon"))).toBe(
        true,
      );
    });
  });

  describe("recall the trailing constraint had cost", () => {
    // Requiring a time or terminator after the open-state killed this entire family.
    // They are ordinary cancellations, and the left-hand allowlist already rejects
    // the imperative cases on its own — so the broad constraint was paying for
    // something it was not needed for.
    it.each([
      ["a reason", "Ej öppet pga sjukdom"],
      ["a bare 'tyvärr'", "Ej öppet tyvärr"],
      ["a following clause", "Ej öppet, vi ses imorgon"],
      ["a dash and a reason", "Ej öppet - vi är sjuka"],
      ["a place before the time", "Ej öppet på Heden idag"],
      ["a reason after a copula", "Vi är inte öppna pga sjukdom"],
    ])("still cancels with %s", (_label, caption) => {
      expect(detectNegation(normalizeCaption(caption))).toBe(true);
    });

    it("keeps the restriction guard the constraint was there for", () => {
      // `för` names whom the truck is open TO, not when — except when it introduces
      // a time, which is why "för dagen" is exempt.
      expect(detectNegation(normalizeCaption("Vi har inte öppet för barn"))).toBe(false);
      expect(detectNegation(normalizeCaption("Vi är inte öppna för grupper"))).toBe(false);
      expect(detectNegation(normalizeCaption("Ej öppet för dagen"))).toBe(true);
    });
  });

  describe("word forms and slots", () => {
    it("accepts an adverb between the particle and the state", () => {
      // `längre` follows the particle in Swedish. Listing it in the PRE-particle slot
      // licensed only word orders the language does not use, while the real one
      // stayed missed — a list in the wrong slot looks like coverage and gives none.
      expect(detectNegation(normalizeCaption("Vi har inte längre öppet på söndagar"))).toBe(true);
    });

    it("accepts a bare emphatic quantifier with no time after it", () => {
      expect(detectNegation(normalizeCaption("Vi kör inte alls"))).toBe(true);
      expect(detectNegation(normalizeCaption("Vi kör inte alls."))).toBe(true);
    });

    it.each([
      ["indefinite", "Vi kör inte på söndag"],
      ["definite", "Vi kör inte på söndagen"],
      ["plural", "Vi kör inte på söndagar"],
      ["definite plural", "Vi kör inte på söndagarna"],
      ["another weekday, definite", "Vi kör inte på fredagen"],
    ])("accepts a weekday in its %s form", (_label, caption) => {
      // Listing only the stem made "på söndag" match while "på söndagen" did not —
      // an inconsistency inside one list rather than a considered boundary.
      expect(detectNegation(normalizeCaption(caption))).toBe(true);
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
