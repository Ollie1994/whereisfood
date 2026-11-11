// A row's buttons (an entry's, a truck's; a checklist suggestion's ✓) stay off from the tap
// until a read sent after its request answered applies, or fails (IS #250, #269). Until that
// read, the row shows as it was before the action, and with its buttons on, a second "Ställ
// in" answers "Posten finns inte" for an entry just cancelled, and a second ✓ on a
// suggestion refused for an overlap or a time already passed is refused again.
//
// Limits: a failed read frees the row while the list, under the read's error, still shows
// it as it was, so a second tap can act on it again then. A read that never answers keeps
// the row's buttons off until a later read applies or the page opens again.
export type Busy = { id: string; after: number | null };

// Row `id`'s request answered while `latestRead` was the newest read sent. It marks every
// unanswered row with that id, so callers start one request per id at a time: the hooks
// only start one from a row's buttons, which are off while the row is busy.
export function answered(busy: readonly Busy[], id: string, latestRead: number): Busy[] {
  return busy.map((row) => (row.id === id && row.after === null ? { id, after: latestRead } : row));
}

// The rows still busy once read `readId` applies: those whose request hasn't answered, and
// those that answered after it was sent, since that read may predate their change.
export function stillBusy(busy: readonly Busy[], readId: number): Busy[] {
  return busy.filter(({ after }) => after === null || after >= readId);
}
