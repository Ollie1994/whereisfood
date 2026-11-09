import type { Location } from "@/lib/types";

// How far ahead the admin's list reads, from the start of today (Phase 7 plan, #24). Its own
// module, so the service (`listAdminEntries`) and the browser's form (`savedText`) both read
// it without either depending on the other.
export const LIST_DAYS = 14;

// An entry has ended at or after its `ends_at`: the rule #33 refuses edits by, in one copy
// for the service and the list's "Har slutat".
export function hasEnded(entry: Pick<Location, "ends_at">, now: Date): boolean {
  return Date.parse(entry.ends_at) <= now.getTime();
}
