import { stockholmDay } from "@/lib/stockholm";
import type { Location } from "@/lib/types";

// What the service and the admin screen share, in a module the browser can import (the
// service can't be, `supabase.ts`): how far ahead the admin's list reads, from the start of
// today (Phase 7 plan, #24; `listAdminEntries`, the form's `savedText`), the 409's advice,
// when an entry has ended, and whether the list is from an earlier day.
export const LIST_DAYS = 14;

// The 409's advice, when #33 would refuse editing the other entry, to change this entry's
// time instead (the owner's wording). Here, with `OVERLAP_ADVICE`, so the service builds the
// 409 from it and the checklist finds it in a ✓'s refusal (`checklistRefusal`, IS #274).
export const CHANGE_THIS_ENTRY = " Ändra tiden på den här posten.";

// What the 409 tells the admin after "Överlappar med <the other entry's times>": edit that
// entry, or, when #33 would refuse that edit, change this one (the owner's wording).
export const OVERLAP_ADVICE = {
  edit: " — redigera den istället",
  ended: `, som redan har slutat.${CHANGE_THIS_ENTRY}`,
  running: `, som pågår nu.${CHANGE_THIS_ENTRY}`,
} as const;

// An entry has ended at or after its `ends_at`: the rule #33 refuses edits by, in one copy
// for the service and the list's "Har slutat".
export function hasEnded(entry: Pick<Location, "ends_at">, now: Date): boolean {
  return Date.parse(entry.ends_at) <= now.getTime();
}

// Whether the admin's list is from a Stockholm day before `now`'s (IS #251). `listedDay` is
// the day `useAdminLocations` counts its last read for (its `sentDay`), or null for none.
export function listBehind(listedDay: number | null, now: Date): boolean {
  return listedDay !== null && listedDay < stockholmDay(now);
}
