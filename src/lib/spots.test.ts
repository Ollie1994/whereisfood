import { describe, expect, it } from "vitest";
import { isInGothenburg } from "@/lib/geo";
import { SPOTS } from "@/lib/spots";

describe("SPOTS", () => {
  it("is not empty", () => {
    expect(SPOTS.length).toBeGreaterThan(0);
  });

  it.each(SPOTS.map((spot) => [spot.name, spot] as const))(
    "%s has a name and coordinates inside Gothenburg",
    (_name, spot) => {
      expect(spot.name.trim()).not.toBe("");
      expect(isInGothenburg(spot.latitude, spot.longitude)).toBe(true);
    },
  );

  // The name becomes the location's label, and a label is compared as a string. A
  // padded name, or one in decomposed Unicode (an NFD "Gårda" looks identical in the
  // editor), would never equal the same place typed by the admin.
  it.each(SPOTS.map((spot) => [spot.name] as const))(
    "%s is trimmed and stored in NFC",
    (name) => {
      expect(name).toBe(name.trim());
      expect(name).toBe(name.normalize("NFC"));
    },
  );

  // The admin picks a spot by name, so two spots whose names differ only in case
  // would be indistinguishable.
  it("has names that are unique, ignoring case", () => {
    const names = SPOTS.map((spot) => spot.name.toLowerCase());
    expect(new Set(names).size).toBe(names.length);
  });
});
