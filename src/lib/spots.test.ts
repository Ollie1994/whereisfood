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

  // The name becomes the location's label and the admin picks a spot by it, so two
  // spots with one name would be indistinguishable.
  it("has unique names", () => {
    const names = SPOTS.map((spot) => spot.name);
    expect(new Set(names).size).toBe(names.length);
  });
});
