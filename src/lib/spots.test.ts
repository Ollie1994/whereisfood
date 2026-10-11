import { describe, expect, it } from "vitest";
import { isInGothenburg } from "@/lib/geo";
import { SPOTS } from "@/lib/spots";

// Case and diacritics removed: "Gårda", "garda" and "GARDA" all fold to "garda".
const fold = (name: string) =>
  name.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

describe("SPOTS", () => {
  it("is not empty", () => {
    expect(SPOTS.length).toBeGreaterThan(0);
  });

  // The name becomes the location's label, and a label is compared as a string. A
  // padded name, or one in decomposed Unicode (an NFD "Gårda" looks identical in the
  // editor), would never equal the same place typed by the admin.
  it.each(SPOTS.map((spot) => [spot.name, spot] as const))(
    "%s has a trimmed, NFC name and coordinates inside Gothenburg",
    (_name, { name, latitude, longitude }) => {
      expect(name.trim()).not.toBe("");
      expect(name).toBe(name.trim());
      expect(name).toBe(name.normalize("NFC"));
      expect(isInGothenburg(latitude, longitude)).toBe(true);
    },
  );

  // The admin picks a spot by name, and Swedes routinely type without the diacritic,
  // so "Gårda" next to "Garda" (or "Heden" next to "heden") would be two labels for
  // one place.
  it("has names that are unique, ignoring case and diacritics", () => {
    const folded = SPOTS.map((spot) => fold(spot.name));
    expect(new Set(folded).size).toBe(folded.length);
  });
});
