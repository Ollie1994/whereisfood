// The Gothenburg bounding box — ONE definition, two unrelated consumers:
//
//   1. `dictionary.test.ts` asserts every hand-entered entry falls inside it,
//      which catches typos and the lat/lng transposition that would otherwise
//      land a pin in the Gulf of Guinea.
//   2. `geocoding.ts` re-validates Nominatim responses against it. `bounded=1`
//      is a request parameter, not a guarantee worth trusting blindly, so the
//      returned coordinates are checked before they are accepted.
//
// Two copies would drift, and a drifted box fails silently in the direction that
// matters least visibly: it accepts a wrong pin rather than rejecting a right one.
//
// Pure module — no DB, no HTTP, no clock.

// Approximately 11.6–12.2 E / 57.5–57.85 N. Deliberately generous: it spans from
// Mölndal in the south to Hisingen in the north, which covers every location the
// dictionary seeds (#4) plus room for novel addresses the geocode fallback finds.
//
// This is a coarse sanity check, NOT a service-area definition. Its job is to
// catch coordinates that are obviously wrong — a transposed pair, a Stockholm
// result, an OSM match in the wrong country — not to decide whether a truck is
// somewhere useful. Tightening it toward the true municipal border would start
// rejecting legitimate edge locations for no gain.
export const GOTHENBURG_BBOX = {
  west: 11.6,
  south: 57.5,
  east: 12.2,
  north: 57.85,
} as const;

// Coordinates are `(latitude, longitude)` throughout the app and the database.
// MapLibre's `[lng, lat]` ordering is a rendering concern, converted at the map
// boundary and never here.
//
// BOUNDARY SEMANTICS: inclusive on all four edges. The box is an approximation
// with no real-world referent at its edges, so a point sitting exactly on one is
// no less plausible than a point just inside it — and rejecting it would make the
// outcome depend on float representation rather than on anything meaningful.
//
// NaN and Infinity return false, falling out of the comparisons rather than being
// special-cased: every comparison against NaN is false, and an infinite ordinate
// is outside any finite box. Both are covered by tests so the behaviour is pinned
// rather than incidental.
export function isInGothenburg(lat: number, lng: number): boolean {
  return (
    lat >= GOTHENBURG_BBOX.south &&
    lat <= GOTHENBURG_BBOX.north &&
    lng >= GOTHENBURG_BBOX.west &&
    lng <= GOTHENBURG_BBOX.east
  );
}
