import { describe, expect, it } from "vitest";
import { GEO_ERRORS, geoError, pinFrom, pinText, placeList, placeText, spotAt } from "@/lib/admin-place";
import { GOTHENBURG_BBOX } from "@/lib/geo";
import { SPOTS } from "@/lib/spots";
import { LOCATION_ERRORS } from "@/lib/validators/location";

describe("pinFrom", () => {
  it("gives a pin inside the Gothenburg box, its edges included", () => {
    expect(pinFrom(57.7, 11.95)).toEqual({ ok: true, pin: { latitude: 57.7, longitude: 11.95 } });
    expect(pinFrom(GOTHENBURG_BBOX.north, GOTHENBURG_BBOX.east).ok).toBe(true);
  });

  // A map tap panned away, or a GPS fix elsewhere: the form isn't filled.
  it.each([
    ["Stockholm", 59.3293, 18.0686],
    ["just north of the box", GOTHENBURG_BBOX.north + 0.001, 11.95],
    ["a transposed pair", 11.95, 57.7],
  ])("refuses %s with the route's own text", (_, latitude, longitude) => {
    expect(pinFrom(latitude, longitude)).toEqual({ ok: false, error: LOCATION_ERRORS.outside });
  });
});

describe("spotAt", () => {
  it("names the known spot standing at the pin, and none elsewhere", () => {
    const spot = SPOTS[0];
    expect(spotAt({ latitude: spot.latitude, longitude: spot.longitude })).toBe(spot.name);
    expect(spotAt({ latitude: spot.latitude + 0.0001, longitude: spot.longitude })).toBe("");
    expect(spotAt(null)).toBe("");
  });
});

describe("placeText and pinText", () => {
  it("shows a place by its name, or its pin to five decimals", () => {
    expect(placeText({ latitude: 57.7, longitude: 11.95, label: "Heden" })).toBe("Heden");
    expect(placeText({ latitude: 57.701234567, longitude: 11.9, label: null })).toBe("Kartnål 57.70123, 11.90000");
    expect(pinText({ latitude: 57.7, longitude: 11.95 })).toBe("57.70000, 11.95000");
  });
});

describe("geoError", () => {
  it("names a refused permission, and asks to retry otherwise", () => {
    // GeolocationPositionError: 1 PERMISSION_DENIED, 2 POSITION_UNAVAILABLE, 3 TIMEOUT.
    expect(geoError(1)).toBe(GEO_ERRORS.denied);
    expect(geoError(2)).toBe(GEO_ERRORS.failed);
    expect(geoError(3)).toBe(GEO_ERRORS.failed);
  });
});

describe("placeList", () => {
  it("takes a list of places, unnamed ones included", () => {
    const places = [
      { latitude: 57.7, longitude: 11.95, label: "Heden" },
      { latitude: 57.71, longitude: 11.96, label: null },
    ];
    expect(placeList(places)).toEqual(places);
    expect(placeList([])).toEqual([]);
  });

  it.each([
    ["no list", { places: [] }],
    ["a missing label", [{ latitude: 57.7, longitude: 11.95 }]],
    ["a string coordinate", [{ latitude: "57.7", longitude: 11.95, label: null }]],
    ["a null item", [null]],
  ])("refuses %s", (_, value) => {
    expect(placeList(value)).toBeNull();
  });
});
