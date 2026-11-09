import { useCallback, useEffect, useState } from "react";
import { adminFetch } from "@/lib/admin-api";
import type { AdminEntry } from "@/lib/services/locations";
import type { Location, Truck } from "@/lib/types";

// The admin screen's list: entries from today for 14 days and every truck, read through
// the uncached admin routes, so the admin sees their own change on the next read (plan
// #15, #24). Cancel and "Stämmer fortfarande" reload the list; an edit is the form's.

export const CANCEL_QUESTION = "Ställa in den här posten? Den försvinner från kartan.";

type Lists = { entries: AdminEntry[]; trucks: Truck[] } | { error: string };

// Both lists, or the first refusal. Module-level, so the effect below only starts it and
// sets state in its callback, not in the effect's body (`react-hooks/set-state-in-effect`).
async function fetchLists(): Promise<Lists> {
  const [list, all] = await Promise.all([
    adminFetch<{ entries: AdminEntry[] }>("/api/admin/locations"),
    adminFetch<{ trucks: Truck[] }>("/api/admin/trucks"),
  ]);
  if (!list.ok) return { error: list.error };
  if (!all.ok) return { error: all.error };
  return { entries: list.data.entries, trucks: all.data.trucks };
}

export function useAdminLocations(): {
  entries: AdminEntry[];
  trucks: Truck[];
  now: Date;
  loading: boolean;
  error: string | null;
  busyId: string | null;
  editing: AdminEntry | null;
  actions: number;
  reload: () => Promise<void>;
  startEdit: (entry: AdminEntry) => void;
  stopEdit: () => void;
  confirm: (entry: AdminEntry) => Promise<void>;
  cancel: (entry: AdminEntry) => Promise<void>;
} {
  const [entries, setEntries] = useState<AdminEntry[]>([]);
  const [trucks, setTrucks] = useState<Truck[]>([]);
  // The time the list was read at, for its "idag" and "Uppdaterad" texts.
  const [now, setNow] = useState(() => new Date());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editing, setEditing] = useState<AdminEntry | null>(null);
  // How many cancels and confirms have run, so the form can drop its "Sparat." after one.
  const [actions, setActions] = useState(0);

  const apply = useCallback((lists: Lists) => {
    setNow(new Date());
    setLoading(false);
    if ("error" in lists) return setError(lists.error);
    setError(null);
    setEntries(lists.entries);
    setTrucks(lists.trucks);
  }, []);

  const reload = useCallback(async () => apply(await fetchLists()), [apply]);

  useEffect(() => {
    let current = true;
    void fetchLists().then((lists) => {
      if (current) apply(lists);
    });
    return () => {
      current = false;
    };
  }, [apply]);

  async function act(entry: AdminEntry, action: "confirm" | "cancel") {
    setActions((count) => count + 1);
    setBusyId(entry.id);
    const result = await adminFetch<{ entry: Location }>(`/api/admin/locations/${entry.id}/${action}`, {
      method: "POST",
    });
    setBusyId(null);
    if (!result.ok) return setError(result.error);
    if (editing?.id === entry.id) setEditing(null);
    await reload();
  }

  return {
    entries,
    trucks,
    now,
    loading,
    error,
    busyId,
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
