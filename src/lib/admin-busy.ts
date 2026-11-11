// A list row's buttons stay off from the tap until a read sent after its request answered
// applies, or fails (IS #250). Until then the row shows the entry or truck as it was before
// the action, and a second tap acts on it again: a second "Ställ in" answered "Posten finns
// inte" for an entry just cancelled.
//
// Limits: a failed read frees the row while the list, under the read's error, still shows
// it as it was, so a second tap can act on it again then. And a read that never answers
// keeps the row's buttons off, and the edit form's save while that row is edited
// (`useAdminScreen`'s `waiting`), until a later read applies or the page opens again.
export type Busy = { id: string; after: number | null };

// Row `id`'s request answered while `latestRead` was the newest read sent.
export function answered(busy: readonly Busy[], id: string, latestRead: number): Busy[] {
  return busy.map((row) => (row.id === id && row.after === null ? { id, after: latestRead } : row));
}

// The rows still busy once read `readId` applies: those whose request hasn't answered, and
// those that answered after it was sent, since that read may predate their change.
export function stillBusy(busy: readonly Busy[], readId: number): Busy[] {
  return busy.filter(({ after }) => after === null || after >= readId);
}
