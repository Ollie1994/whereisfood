import { isValid, parseISO } from "date-fns";

// The timestamp check the map's reader (`live.ts`), the location validators and the place
// picker share. Its own module, so the admin screen doesn't load `live.ts` for it.

// A date, a time with optional fractional seconds, and an offset. PostgREST returns
// `…T09:00:00+00:00`, and `updated_at` (from `now()`) with microseconds,
// `…T06:50:08.606373+00:00` (local stack, 2026-10-25). The pattern comes first
// because `parseISO` alone accepts `"2026"`, and a string with no offset, which it
// reads in the browser's own time zone. The time's and the offset's hours are bounded
// here because `isValid(parseISO(…))` accepts `T24:00:00` and `+24:00`; it refuses
// `+01:60` itself (all pinned in `live.test.ts`).
const TIMESTAMP =
  /^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-](?:[01]\d|2[0-3]):\d{2})$/;

export function isTimestamp(value: unknown): value is string {
  return typeof value === "string" && TIMESTAMP.test(value) && isValid(parseISO(value));
}
