import { entryTimeText, updatedText } from "@/lib/admin-form";
import type { AdminEntry } from "@/lib/services/locations";

const ACTION = "rounded-md border border-foreground/30 px-3 py-2 text-sm disabled:opacity-60";

// Today's and the next 13 days' entries (plan #24), each with "Stämmer fortfarande" and
// "Ställ in", and "Ändra" while it hasn't ended: #33 refuses an edit of one that has, so an
// ended entry says so instead. `now` is when the list was read.
export default function TodayList({
  entries,
  now,
  busyIds,
  onEdit,
  onConfirm,
  onCancel,
}: {
  entries: AdminEntry[];
  now: Date;
  busyIds: readonly string[];
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
        const ended = Date.parse(entry.ends_at) <= now.getTime();
        return (
          <li key={entry.id} className="flex flex-col gap-2 rounded-md border border-foreground/20 p-3">
            <div className="flex flex-col">
              <span className="font-medium">{entry.truck_name}</span>
              <span className="text-sm">
                {entry.label ?? "Okänd plats"}, {entryTimeText(entry, now)}
                {ended && " · Har slutat"}
              </span>
              <span className="text-xs text-foreground/60">{updatedText(entry.updated_at, now)}</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {!ended && (
                <button type="button" onClick={() => onEdit(entry)} disabled={busy} className={ACTION}>
                  Ändra
                </button>
              )}
              <button type="button" onClick={() => onConfirm(entry)} disabled={busy} className={ACTION}>
                Stämmer fortfarande
              </button>
              <button type="button" onClick={() => onCancel(entry)} disabled={busy} className={ACTION}>
                Ställ in
              </button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
