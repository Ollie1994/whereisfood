import { useCallback, useEffect, useState } from "react";
import { adminFetch } from "@/lib/admin-api";
import type { AdminEntry } from "@/lib/services/locations";
import type { Location, Truck } from "@/lib/types";

// The admin screen's list: entries from today for 14 days and every truck, read through
// the uncached admin routes, so the admin sees their own change on the next read (plan
// #15, #24). Cancel and "Stämmer fortfarande" reload the entries; an edit is the form's.

export const CANCEL_QUESTION = "Ställa in den här posten? Den försvinner från kartan.";

type Read<T> = { ok: true; data: T } | { ok: false; error: string };

// Module-level, so the effect below only starts them and sets state in their callback, not
// in the effect's body (`react-hooks/set-state-in-effect`).
async function fetchEntries(): Promise<Read<AdminEntry[]>> {
  const result = await adminFetch<{ entries: AdminEntry[] }>("/api/admin/locations");
  return result.ok ? { ok: true, data: result.data.entries } : result;
}

async function fetchTrucks(): Promise<Read<Truck[]>> {
  const result = await adminFetch<{ trucks: Truck[] }>("/api/admin/trucks");
  return result.ok ? { ok: true, data: result.data.trucks } : result;
}

export function useAdminLocations(): {
  // Null until the entries have been read once, so a failed first read shows no "no
  // entries" text under its error.
  entries: AdminEntry[] | null;
  trucks: Truck[];
  now: Date;
  error: string | null;
  busyIds: readonly string[];
  editing: AdminEntry | null;
  actions: number;
  reload: () => Promise<void>;
  startEdit: (entry: AdminEntry) => void;
  stopEdit: () => void;
  confirm: (entry: AdminEntry) => Promise<void>;
  cancel: (entry: AdminEntry) => Promise<void>;
} {
  const [entries, setEntries] = useState<AdminEntry[] | null>(null);
  const [trucks, setTrucks] = useState<Truck[]>([]);
  // The time the entries were read at, for the list's "idag" and "Uppdaterad" texts.
  const [now, setNow] = useState(() => new Date());
  const [error, setError] = useState<string | null>(null);
  // Every entry with a request in flight, so one finishing doesn't free another's buttons.
  const [busyIds, setBusyIds] = useState<readonly string[]>([]);
  const [editing, setEditing] = useState<AdminEntry | null>(null);
  // How many cancels and confirms have run, so the form can drop its "Sparat." after one.
  const [actions, setActions] = useState(0);

  // A failed read keeps the entries already shown, and says why.
  const applyEntries = useCallback((read: Read<AdminEntry[]>) => {
    setNow(new Date());
    if (!read.ok) return setError(read.error);
    setError(null);
    setEntries(read.data);
  }, []);

  // The entries only: no list action changes a truck, so the trucks are read once.
  const reload = useCallback(async () => applyEntries(await fetchEntries()), [applyEntries]);

  useEffect(() => {
    let current = true;
    void fetchEntries().then((read) => {
      if (current) applyEntries(read);
    });
    void fetchTrucks().then((read) => {
      if (!current) return;
      if (read.ok) setTrucks(read.data);
      else setError(read.error);
    });
    return () => {
      current = false;
    };
  }, [applyEntries]);

  async function act(entry: AdminEntry, action: "confirm" | "cancel") {
    setActions((count) => count + 1);
    setBusyIds((ids) => [...ids, entry.id]);
    const result = await adminFetch<{ entry: Location }>(`/api/admin/locations/${entry.id}/${action}`, {
      method: "POST",
    });
    setBusyIds((ids) => ids.filter((id) => id !== entry.id));
    // A cancelled entry can't be edited any more; a confirm moves only `updated_at`, so an
    // edit of it stays open. Against the edit open now, not the one when the button was
    // pressed.
    if (result.ok && action === "cancel") {
      setEditing((open) => (open?.id === entry.id ? null : open));
    }
    // Reloaded on a refusal too: a 404 means the entry is gone, and the list should say so.
    await reload();
    if (!result.ok) setError(result.error);
  }

  return {
    entries,
    trucks,
    now,
    error,
    busyIds,
    editing,
    actions,
    reload,
    startEdit: setEditing,
    stopEdit: () => setEditing(null),
    confirm: (entry) => act(entry, "confirm"),
    // A cancelled entry leaves the map and can't be brought back from here, so it asks.
    cancel: async (entry) => {
      if (window.confirm(CANCEL_QUESTION)) await act(entry, "cancel");
    },
  };
}
