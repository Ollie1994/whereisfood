import { isInGothenburg } from "@/lib/geo";
import { isTimestamp } from "@/lib/live";
import type { Place, RecentPlace } from "@/lib/services/locations";
import { SPOTS } from "@/lib/spots";
import { LOCATION_ERRORS } from "@/lib/validators/location";

// The place picker's pure parts (Phase 7 plan, step 9): the pin a map tap or a GPS fix
// gives, the texts the picker shows, and the check of `/api/admin/places`'s answer.
// `usePlacePicker` and `useGeolocation` hold the state.

// Where an entry stands, with no name: a known spot or a recent place brings its own.
export type Pin = Pick<Place, "latitude" | "longitude">;

export type PinResult = { ok: true; pin: Pin } | { ok: false; error: string };

// A tapped or GPS position as a pin, refused outside the Gothenburg box with the same check
// and text as the route's (`isInGothenburg`), so a tap or fix the route would refuse as
// outside the box doesn't fill the form.
export function pinFrom(latitude: number, longitude: number): PinResult {
  if (!isInGothenburg(latitude, longitude)) return { ok: false, error: LOCATION_ERRORS.outside };
  return { ok: true, pin: { latitude, longitude } };
}

export const samePin = (a: Pin, b: Pin) => a.latitude === b.latitude && a.longitude === b.longitude;

// The known spot the form holds, pin and name both, for the spot list's shown choice, or ""
// for none: once the name is changed, choosing the spot again fills its name back.
export function spotAt(pin: Pin | null, label: string): string {
  return (pin && SPOTS.find((spot) => samePin(spot, pin) && spot.name === label)?.name) ?? "";
}

// "57.70123, 11.95345": five decimals, about a metre.
export function pinText(pin: Pin): string {
  return `${pin.latitude.toFixed(5)}, ${pin.longitude.toFixed(5)}`;
}

// A recent place's button: its name, or its pin for one dropped with none.
export function placeText(place: Place): string {
  return place.label ?? `Kartnål ${pinText(place)}`;
}

export const PICKER_TEXTS = {
  recentFailed: "Senaste platserna kunde inte hämtas.",
  mapFailed: "Kartan kunde inte laddas. Ladda om sidan och försök igen.",
} as const;

// `navigator.geolocation`'s refusals (`GeolocationPositionError`'s codes), in Swedish.
export const GEO_ERRORS = {
  unsupported: "Den här webbläsaren kan inte ge din position.",
  denied: "Positionen är blockerad. Tillåt plats för sidan i webbläsarens inställningar.",
  failed: "Positionen kunde inte hämtas. Försök igen.",
} as const;

export function geoError(code: number): string {
  return code === 1 ? GEO_ERRORS.denied : GEO_ERRORS.failed;
}

// `/api/admin/places`'s `places`, or null when it isn't a list of recent places.
export function recentPlaceList(value: unknown): RecentPlace[] | null {
  if (!Array.isArray(value)) return null;
  const valid = value.every((item: unknown) => {
    if (typeof item !== "object" || item === null) return false;
    const place = item as RecentPlace;
    return (
      Number.isFinite(place.latitude) &&
      Number.isFinite(place.longitude) &&
      (place.label === null || typeof place.label === "string") &&
      isTimestamp(place.starts_at) &&
      isTimestamp(place.ends_at)
    );
  });
  return valid ? (value as RecentPlace[]) : null;
}
