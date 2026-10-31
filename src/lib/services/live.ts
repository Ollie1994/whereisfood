import { findLocationsOverlapping } from "@/lib/db/locations";
import { listActiveTrucks } from "@/lib/db/trucks";
import { isLiveEntry, type LiveEntry, type LiveResponse } from "@/lib/live";

// The public map's data, for `GET /api/live` (Phase 6 plan, "Functions and types").
// Business logic only: no HTTP, and the database only through the db layer.

// `[now, now + 26 h)`. The client keeps entries starting before the next Stockholm
// midnight, up to 25 h away on the fall-back day, and a response can be about 3 min old
// when it is last used (the CDN's 60 s plus 60 s stale, then up to 60 s to the next
// poll). So no time zone is needed here: `todaysEntries` in the browser does the cut
// (plan, the service). `api-live.test.ts` pins the fall-back case and both edges.
const WINDOW_MS = 26 * 3_600_000;

// The only clock read on the server (`CLAUDE.md`, "Time"); tests pass `now`. Errors
// propagate, so the route answers 500, which the CDN doesn't cache, never an empty map
// (`CLAUDE.md`, "`/api/live`").
export async function getLiveMap(now: Date = new Date()): Promise<LiveResponse> {
  const from = now.toISOString();
  const to = new Date(now.getTime() + WINDOW_MS).toISOString();
  const [trucks, locations] = await Promise.all([
    listActiveTrucks(),
    findLocationsOverlapping(from, to),
  ]);

  // `findLocationsOverlapping` doesn't filter on `is_active`; a row of a truck missing
  // here is an inactive truck's (plan #9).
  const activeTrucks = new Map(trucks.map((truck) => [truck.id, truck]));
  const entries: LiveEntry[] = [];

  for (const location of locations) {
    const truck = activeTrucks.get(location.truck_id);
    if (!truck) continue;

    // Field by field, never a spread row, so `cancelled_at`, `source`, `created_at`,
    // `description`, `is_active` and any future column stay here (plan #11).
    const entry: LiveEntry = {
      id: location.id,
      truck: {
        id: truck.id,
        name: truck.name,
        instagram_handle: truck.instagram_handle,
        cuisine_type: truck.cuisine_type,
      },
      latitude: location.latitude,
      longitude: location.longitude,
      label: location.label,
      starts_at: location.starts_at,
      ends_at: location.ends_at,
      updated_at: location.updated_at,
    };

    // The schema allows rows the client's `isLiveResponse` rejects (`ends_at =
    // 'infinity'`, a latitude of 95), and it rejects a whole body for one bad entry, so
    // such a row is left out here (plan #20).
    if (!isLiveEntry(entry)) {
      console.warn(`[live] left out location ${location.id}: it fails isLiveEntry`);
      continue;
    }
    entries.push(entry);
  }

  return { entries };
}
