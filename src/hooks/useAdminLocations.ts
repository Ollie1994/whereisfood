import { useCallback, useEffect, useRef, useState } from "react";
import { adminFetch } from "@/lib/admin-api";
import type { AdminEntry } from "@/lib/services/locations";
import type { Location, Truck } from "@/lib/types";

// The admin screen's list: entries from today for 14 days and every truck, read through
// the uncached admin routes, so the admin sees their own change on the next read (plan
// #15, #24). Cancel and "Stämmer fortfarande" reload the entries; an edit is the form's.

export const CANCEL_QUESTION = "Ställa in den här posten? Den försvinner från kartan.";

// How often the list's clock moves, so "Har slutat" and "idag" follow the time.
const TICK_MS = 60_000;

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
  // One per source, so none hides another: the entries' read, the trucks' read, the last
  // list action.
  errors: { entries: string | null; trucks: string | null; action: string | null };
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
  const [now, setNow] = useState(() => new Date());
  const [entriesError, setEntriesError] = useState<string | null>(null);
  const [trucksError, setTrucksError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  // Every entry with a request in flight, so one finishing doesn't free another's buttons.
  const [busyIds, setBusyIds] = useState<readonly string[]>([]);
  const [editing, setEditing] = useState<AdminEntry | null>(null);
  // How many cancels and confirms have run, so the form can drop its "Sparat." after one.
  const [actions, setActions] = useState(0);
  // The newest entries read sent: reads can answer out of order when actions overlap, and
  // only the newest is applied.
  const latestRead = useRef(0);

  // Applies an entries read if it is still the newest one sent.
  const applyEntries = useCallback((id: number, read: Read<AdminEntry[]>) => {
    if (id !== latestRead.current) return;
    setNow(new Date());
    if (!read.ok) return setEntriesError(read.error);
    setEntriesError(null);
    setEntries(read.data);
  }, []);

  const applyTrucks = useCallback((read: Read<Truck[]>) => {
    if (!read.ok) return setTrucksError(read.error);
    setTrucksError(null);
    setTrucks(read.data);
  }, []);

  // The entries, and the trucks again only if their read failed: no list action changes a
  // truck.
  const reload = useCallback(async () => {
    const id = ++latestRead.current;
    const [entriesRead, trucksRead] = await Promise.all([
      fetchEntries(),
      trucksError ? fetchTrucks() : undefined,
    ]);
    applyEntries(id, entriesRead);
    if (trucksRead) applyTrucks(trucksRead);
  }, [applyEntries, applyTrucks, trucksError]);

  // The first reads, started here and applied in their callbacks (the lint rule above).
  useEffect(() => {
    const id = ++latestRead.current;
    void fetchEntries().then((read) => applyEntries(id, read));
    void fetchTrucks().then(applyTrucks);
    const tick = setInterval(() => setNow(new Date()), TICK_MS);
    return () => clearInterval(tick);
  }, [applyEntries, applyTrucks]);

  async function act(entry: AdminEntry, action: "confirm" | "cancel") {
    setActions((count) => count + 1);
    setActionError(null);
    setBusyIds((ids) => [...ids, entry.id]);
    const result = await adminFetch<{ entry: Location }>(`/api/admin/locations/${entry.id}/${action}`, {
      method: "POST",
    });
    setBusyIds((ids) => ids.filter((id) => id !== entry.id));
    if (!result.ok) setActionError(result.error);
    // A cancelled entry can't be edited any more; a confirm moves only `updated_at`, so an
    // edit of it stays open. Against the edit open now, not the one when the button was
    // pressed.
    if (result.ok && action === "cancel") {
      setEditing((open) => (open?.id === entry.id ? null : open));
    }
    // Reloaded on a refusal too: a 404 means the entry is gone, and the list should say so.
    await reload();
  }

  return {
    entries,
    trucks,
    now,
    errors: { entries: entriesError, trucks: trucksError, action: actionError },
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
