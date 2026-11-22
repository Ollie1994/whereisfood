import { SMALL_BUTTON as ACTION } from "@/components/Admin/styles";
import { UNKNOWN_PLACE, entryTimeText, updatedText } from "@/lib/admin-form";
import { hasEnded } from "@/lib/admin-list";
import type { AdminEntry } from "@/lib/services/locations";

// Today's and the next 13 days' entries (plan #24), each with "Ändra", "Stämmer fortfarande"
// and "Ställ in" while it hasn't ended: the routes refuse all three on one that has (Phase 7
// plan #33; Phase 9 plan #8), so an ended entry says so and shows none (`hasEnded`: `ends_at`
// at or before `now`, as the edit's check and the cancel and confirm write's filter have it).
// `now` is the list's clock, which moves each minute. A limit: that is the device's clock,
// and the routes judge by the server's, so a device ahead hides the buttons early and one
// behind shows them past the end, each press answered 400 until it catches up. Every button
// waits while the form saves (`locked`).
export default function TodayList({
  entries,
  now,
  busyIds,
  locked,
  onEdit,
  onConfirm,
  onCancel,
}: {
  entries: AdminEntry[];
  now: Date;
  busyIds: readonly string[];
  locked: boolean;
  onEdit: (entry: AdminEntry) => void;
  onConfirm: (entry: AdminEntry) => void;
  onCancel: (entry: AdminEntry) => void;
}) {
  if (entries.length === 0) {
    return <p className="text-sm text-foreground/70">Inga poster idag eller de närmaste två veckorna.</p>;
  }

  return (
    <ul className="flex flex-col gap-3">
      {entries.map((entry) => {
        const busy = busyIds.includes(entry.id);
        const ended = hasEnded(entry, now);
        return (
          <li key={entry.id} className="flex flex-col gap-2 rounded-md border border-foreground/20 p-3">
            <div className="flex flex-col">
              <span className="font-medium">{entry.truck_name}</span>
              <span className="text-sm">
                {entry.label ?? UNKNOWN_PLACE}, {entryTimeText(entry, now)}
                {ended && " · Har slutat"}
              </span>
              <span className="text-xs text-foreground/60">{updatedText(entry.updated_at, now)}</span>
            </div>
            {!ended && (
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => onEdit(entry)} disabled={busy || locked} className={ACTION}>
                  Ändra
                </button>
                <button type="button" onClick={() => onConfirm(entry)} disabled={busy || locked} className={ACTION}>
                  Stämmer fortfarande
                </button>
                <button type="button" onClick={() => onCancel(entry)} disabled={busy || locked} className={ACTION}>
                  Ställ in
                </button>
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
