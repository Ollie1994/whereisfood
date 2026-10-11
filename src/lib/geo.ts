// The Gothenburg bounding box — ONE definition, for two consumers:
//
//   1. `spots.test.ts` asserts every known spot falls inside it, which catches
//      typos and the lat/lng transposition that would otherwise land a pin in the
//      Indian Ocean — transposed Järntorget is 11.95 N / 57.70 E, in the Arabian
//      Sea. (Null island, 0/0, is a different failure and has its own test.)
//   2. The admin location entry (Phase 7) will validate map taps and GPS fixes
//      against it before a location is written.
//
// Two copies would drift, and a drifted box fails silently in the direction that
// matters least visibly: it accepts a wrong pin rather than rejecting a right one.
//
// Pure module — no DB, no HTTP, no clock.

// Approximately 11.6–12.2 E / 57.5–57.85 N. Deliberately generous: it spans from
// Mölndal in the south to Hisingen in the north, which covers every known spot plus
// room for new places the admin pins.
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
// The `Number.isFinite` prefix is a RUNTIME guard, not a restatement of the type
// signature. A JSON body can carry `lat` and `lng` as **strings**, and `request.json()`
// is `any` — so `isInGothenburg(body.lat, body.lng)` type-checks in a route handler
// and, through relational coercion, `"57.6997" >= 57.5` is `true`. Without
// this the box would wave a string coordinate through into `locations.latitude`,
// which is the exact class of wrong-but-plausible value it exists to stop. The
// caller should still convert; this makes forgetting to a miss rather than a pin.
//
// It also subsumes NaN and Infinity, which previously fell out of the comparisons
// on their own. That behaviour is unchanged and still pinned by tests — the guard
// makes it explicit rather than incidental.
export function isInGothenburg(lat: number, lng: number): boolean {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= GOTHENBURG_BBOX.south &&
    lat <= GOTHENBURG_BBOX.north &&
    lng >= GOTHENBURG_BBOX.west &&
    lng <= GOTHENBURG_BBOX.east
  );
}
