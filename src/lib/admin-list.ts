import { stockholmDay } from "@/lib/stockholm";
import type { Location } from "@/lib/types";

// How far ahead the admin's list reads, from the start of today (Phase 7 plan, #24). Its own
// module, so the service (`listAdminEntries`) and the browser's form (`savedText`) both read
// it without either depending on the other.
export const LIST_DAYS = 14;

// The 409's advice, when #33 would refuse editing the other entry, to change this entry's
// time instead (`OVERLAP_ADVICE`, the owner's wording). Here so the checklist can find it in
// a ✓'s refusal and show its own (`checklistRefusal`, IS #274).
export const CHANGE_THIS_ENTRY = " Ändra tiden på den här posten.";

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
