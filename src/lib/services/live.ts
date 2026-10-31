import { findLocationsOverlapping } from "@/lib/db/locations";
import { listActiveTrucks } from "@/lib/db/trucks";
import { isLiveEntry, type LiveEntry, type LiveResponse } from "@/lib/live";

// The public map's data, for `GET /api/live` (Phase 6 plan, "Functions and types").
// Business logic only: no HTTP, and the database only through the db layer.

// `[now, now + 26 h)`, and no time zone: `todaysEntries` in the browser does the
// Stockholm cut. Why 26 h, and the condition it holds under (while polls succeed): the
// plan's "Functions and types", the service. `api-live.test.ts` pins both edges and the
// fall-back day, whose case a 24-hour window turns red.
const WINDOW_MS = 26 * 3_600_000;

// The clock is read here, in the service, not in the route or the db layer (`CLAUDE.md`,
// "Time"); tests pass `now`. Errors propagate, so the route answers 500, never an empty
// map (`CLAUDE.md`, "`/api/live`").
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
