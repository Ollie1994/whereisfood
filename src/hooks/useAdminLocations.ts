import { useCallback, useEffect, useRef, useState } from "react";
import { type ApiResult, adminFetch, adminList, fetchTrucks } from "@/lib/admin-api";
import { type Busy, answered, stillBusy } from "@/lib/admin-busy";
import { listBehind } from "@/lib/admin-list";
import { stockholmDay } from "@/lib/stockholm";
import type { AdminEntry } from "@/lib/services/locations";
import type { Location, Truck } from "@/lib/types";

// The admin screen's list: entries from today for 14 days and every truck, read through
// the uncached admin routes, so the admin sees their own change on the next read (plan
// #15, #24). The entries are read on opening, after a cancel or "Stämmer fortfarande", after
// a save or a checklist ✓ that may have changed them (`reload`, which `useAdminScreen` calls;
// for a ✓, `listMayHaveChanged`), on "Försök igen", and at a minute's tick on a new day.
//
// A limit: an open edit holds the entry as it was when "Ändra" was pressed. If another tab
// moves one of its times, an edit here that changes the other time writes back the one it
// read (`editRequest` sends both). And an edit of an entry cancelled elsewhere stays open,
// its save answering "Posten finns inte" and the list read again (`onGone`), until
// "Avbryt": closing it on a reload could happen mid-save, and would erase that error. Also,
// the trucks are read when the screen opens and after a failed read only, so a truck set
// inactive in another tab stays offered, its save refused with 400, until the screen opens
// again; the admin links (`AdminNav`) open it afresh.

export const CANCEL_QUESTION = "Ställa in den här posten? Den försvinner från kartan.";

const MINUTE_MS = 60_000;

// The Stockholm day an entries read sent now counts for (`listedDay`): the day a minute ago,
// so a read sent in the first minute of a day is followed by another at the next tick. The
// server picks the window by its own clock, and a device clock ahead of it gets the old
// day's window at midnight. The minute is the tick's period: a shorter margin covers less
// of that skew, and a longer one has several ticks each read again.
const sentDay = () => stockholmDay(new Date(Date.now() - MINUTE_MS));

const fetchEntries = () => adminList<AdminEntry>("/api/admin/locations", "entries");

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
  // The entries whose action's request hasn't answered: the edit form's save waits for these
  // only. The read after an answer doesn't touch what the save sends: `editing` is set only
  // by `startEdit`, `stopEdit` and a cancel's answer, and `useLocationForm` saves from it.
  actingIds: readonly string[];
  editing: AdminEntry | null;
  // After a save, or a checklist ✓ that may have changed them (`listMayHaveChanged`): the
  // entries again (and the trucks, while their read has failed).
  reload: () => Promise<void>;
  // When a save starts: a list action's error from before it goes.
  clearActionError: () => void;
  // "Försök igen": the reads whose error shows, with `retrying` while they run.
  retry: () => Promise<void>;
  retrying: boolean;
  startEdit: (entry: AdminEntry) => void;
  stopEdit: () => void;
  confirm: (entry: AdminEntry) => Promise<void>;
  // Counts cancels that succeeded: a truck's recent places leave cancelled entries out.
  cancels: number;
  // Asks first; `onConfirmed` runs once the admin has said yes.
  cancel: (entry: AdminEntry, onConfirmed?: () => void) => Promise<void>;
} {
  const [entries, setEntries] = useState<AdminEntry[] | null>(null);
  const [trucks, setTrucks] = useState<Truck[]>([]);
  const [now, setNow] = useState(() => new Date());
  const [entriesError, setEntriesError] = useState<string | null>(null);
  const [trucksError, setTrucksError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  // Every entry with a request in flight, or answered and waiting for the read after it
  // (`admin-busy.ts`), so one finishing doesn't free another's buttons.
  const [busy, setBusy] = useState<readonly Busy[]>([]);
  const [editing, setEditing] = useState<AdminEntry | null>(null);
  const [retrying, setRetrying] = useState(false);
  const [cancels, setCancels] = useState(0);
  // The newest reads sent: reads can answer out of order when actions overlap, and only the
  // newest of each is applied.
  const latestRead = useRef(0);
  const latestTrucksRead = useRef(0);
  // Whether the trucks' read failed, read when a reload runs rather than from the render
  // the reload was made in: a read failing during an action is then still retried.
  const trucksFailed = useRef(false);
  // The Stockholm day the list was last read for (`listBehind`), as `sentDay` counts it: the
  // newest entries read that succeeded, or the screen's opening until one has.
  const listedDay = useRef<number | null>(null);
  // Whether a read the tick sent hasn't answered, so the next tick doesn't send another and
  // make it stale (`latestRead`).
  const tickReading = useRef(false);

  // Applies an entries read, sent on Stockholm day `day`, if it is still the newest one sent.
  const applyEntries = useCallback((id: number, day: number, read: ApiResult<AdminEntry[]>) => {
    if (id !== latestRead.current) return;
    setNow(new Date());
    setBusy((rows) => stillBusy(rows, id));
    if (!read.ok) return setEntriesError(read.error);
    listedDay.current = day;
    setEntriesError(null);
    setEntries(read.data);
  }, []);

  // Applies a trucks read if it is still the newest one sent.
  const applyTrucks = useCallback((id: number, read: ApiResult<Truck[]>) => {
    if (id !== latestTrucksRead.current) return;
    trucksFailed.current = !read.ok;
    if (!read.ok) return setTrucksError(read.error);
    setTrucksError(null);
    setTrucks(read.data);
  }, []);

  const readAgain = useCallback(
    async (withTrucks: boolean) => {
      const id = ++latestRead.current;
      const day = sentDay();
      const trucksId = withTrucks ? ++latestTrucksRead.current : 0;
      const [entriesRead, trucksRead] = await Promise.all([
        fetchEntries(),
        withTrucks ? fetchTrucks() : undefined,
      ]);
      applyEntries(id, day, entriesRead);
      if (trucksRead) applyTrucks(trucksId, trucksRead);
    },
    [applyEntries, applyTrucks],
  );

  const reload = useCallback(() => readAgain(trucksFailed.current), [readAgain]);

  async function retry() {
    if (retrying) return;
    setRetrying(true);
    try {
      await readAgain(trucksFailed.current);
    } finally {
      setRetrying(false);
    }
  }

  // The first reads, started here and applied in their callbacks (`adminList`'s comment);
  // then the list's clock, set again at each minute's turn so "Har slutat" isn't up to a
  // minute late. Each tick aims at the next turn afresh, so a late one doesn't carry over.
  //
  // A tick on a Stockholm day after the list's (`listBehind`) reads the entries again (IS
  // #251), so a screen open past midnight, or asleep through it, asks for the new day's 14
  // days, and a day-turn read that fails is sent again at a later tick. Checked with the
  // browser's clock alone moved to 23:59 (#251's comment, PR #270): entries reads at 00:00
  // and 00:01 (`sentDay`), and with the network offline at the turn, one more once back
  // online. Limits: a device clock more than a minute ahead of the server's gets the old
  // day's window until the next read. A read refused for the session (401, 403) is sent
  // again each minute, under its error, until the screen is opened again. And a tick's read
  // that never settles holds back the tick's next reads until it does (`tickReading`).
  useEffect(() => {
    const id = ++latestRead.current;
    const day = sentDay();
    listedDay.current = day;
    const trucksId = ++latestTrucksRead.current;
    void fetchEntries().then((read) => applyEntries(id, day, read));
    void fetchTrucks().then((read) => applyTrucks(trucksId, read));
    let tick: ReturnType<typeof setTimeout>;
    const arm = () => {
      tick = setTimeout(() => {
        const at = new Date();
        setNow(at);
        if (!tickReading.current && listBehind(listedDay.current, at)) {
          tickReading.current = true;
          void readAgain(trucksFailed.current).finally(() => {
            tickReading.current = false;
          });
        }
        arm();
      }, MINUTE_MS - (Date.now() % MINUTE_MS));
    };
    arm();
    return () => clearTimeout(tick);
  }, [applyEntries, applyTrucks, readAgain]);

  async function act(entry: AdminEntry, action: "confirm" | "cancel") {
    setActionError(null);
    setBusy((rows) => [...rows, { id: entry.id, after: null }]);
    const result = await adminFetch<{ entry: Location }>(`/api/admin/locations/${entry.id}/${action}`, {
      method: "POST",
    });
    // Read now, not in the updater, before `readAgain` below: `useTrucks`' `setActive` says why.
    const sent = latestRead.current;
    setBusy((rows) => answered(rows, entry.id, sent));
    if (!result.ok) setActionError(result.error);
    // A cancelled entry can't be edited any more; a confirm moves only `updated_at`, so an
    // edit of it stays open. Against the edit open now, not the one when the button was
    // pressed.
    if (result.ok && action === "cancel") {
      setEditing((open) => (open?.id === entry.id ? null : open));
      setCancels((count) => count + 1);
    }
    // Reloaded on a refusal too: a 404 means the entry is gone, and the list should say so.
    await readAgain(trucksFailed.current);
  }

  return {
    entries,
    trucks,
    now,
    errors: { entries: entriesError, trucks: trucksError, action: actionError },
    busyIds: busy.map(({ id }) => id),
    actingIds: busy.filter(({ after }) => after === null).map(({ id }) => id),
    editing,
    reload,
    clearActionError: () => setActionError(null),
    retry,
    retrying,
    cancels,
    startEdit: setEditing,
    stopEdit: () => setEditing(null),
    confirm: (entry) => act(entry, "confirm"),
    // A cancelled entry leaves the map and can't be brought back from here, so it asks.
    cancel: async (entry, onConfirmed) => {
      if (!window.confirm(CANCEL_QUESTION)) return;
      onConfirmed?.();
      await act(entry, "cancel");
    },
  };
}
