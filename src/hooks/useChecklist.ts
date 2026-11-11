import { useEffect, useRef, useState } from "react";
import {
  type Confirmed,
  checklistOf,
  confirmBody,
  isBehind,
  listMayHaveChanged,
  readDismissed,
  stillHidden,
  writeDismissed,
} from "@/lib/admin-checklist";
import { API_ERRORS, adminFetch } from "@/lib/admin-api";
import { type Busy, answered, stillBusy } from "@/lib/admin-busy";
import type { Checklist, Suggestion } from "@/lib/services/checklist";
import { stockholmDay } from "@/lib/stockholm";

// The morning checklist (Phase 7 plan, #20, #22): read through the uncached admin route, on
// opening, on each `revision` (a save or cancel elsewhere on the screen changes what the
// trucks have today), when the Stockholm day of the screen's clock `now` turns, after each
// ✓, and on `reload`. ✓ posts the ordinary create, so an overlap answers 409 like the
// form's; ✗ hides the suggestion on this device for the checklist's day.
//
// The checklist's day is the server's. While it is behind the screen's (the read crossed
// midnight, or one clock is off), nothing is shown, so no ✓ or ✗ acts on yesterday's
// suggestions, and it is read again each time `now` is set until they agree, then once more,
// as `turn` goes back from a time to the day.
//
// Limits: the server leaves out what has ended when it reads, so a suggestion ending while
// the screen is open stays until the next read, and its ✓ is refused ("Tiden har redan
// passerat"), after which it is read again and gone. And a device whose clock is a day or
// more ahead shows no suggestions, reading again each time `now` is set.

// A getter: reading `window.localStorage` throws when site data is blocked (`readDismissed`).
const storage = () => window.localStorage;

export type ChecklistState = {
  // Null until read once, so a failed first read shows no "no suggestions" under its error,
  // and while its day is behind the screen's.
  checklist: Checklist | null;
  // The suggestions not hidden by ✗, nor by a ✓ that created them.
  shown: Suggestion[];
  errors: { read: string | null; action: string | null };
  // The suggestions whose ✓ is in flight, or answered and waiting for the read after it:
  // their ✓ is off.
  busyIds: readonly string[];
  // The suggestions whose ✓ hasn't answered: "Sparar…", and ✗ off, for these only. ✗ off
  // keeps a ✗ from hiding a suggestion whose ✓'s refusal is still to come, which would show
  // that error for a suggestion no longer listed. After the answer ✗ is on: it sends no
  // request.
  savingIds: readonly string[];
  // Counts ✓s known to have created an entry (answered 2xx and read): the place picker's
  // recent places can change.
  creates: number;
  // When a save starts elsewhere on the screen: a ✓'s error from before it goes.
  clearActionError: () => void;
  // Reads again: "Försök igen", and a save elsewhere answered 404 or 409.
  reload: () => void;
  confirm: (suggestion: Suggestion) => Promise<void>;
  dismiss: (suggestion: Suggestion) => void;
};

export function useChecklist({
  revision,
  now,
  reloadList,
}: {
  revision: number;
  // The screen's clock, set each minute and on each list read (`useAdminLocations`).
  now: Date;
  // Reads the entry list again after a ✓, when its answer may have changed what the list
  // should show (`listMayHaveChanged`, IS #272). Limits: after an answer with no status (a
  // failed request, or a 2xx `adminFetch` couldn't read) whose insert committed, the place
  // picker's recent places aren't read again (`creates`). And `withAdmin`'s own 503 (Auth
  // unreachable, before any insert) reads the list too, which shows that error twice.
  reloadList: () => Promise<void>;
}): ChecklistState {
  const [checklist, setChecklist] = useState<Checklist | null>(null);
  const [readError, setReadError] = useState<string | null>(null);
  // A ✓'s error, with the suggestion it is about: a ✗ of that one clears it, and so does any
  // ✗ once that suggestion has left the list (a 409's re-read leaves it out), and a read of a
  // new day.
  const [actionError, setActionError] = useState<{ id: string; text: string } | null>(null);
  // By `from_id`, every suggestion with a ✓ in flight, or answered and waiting for the read
  // after it (`admin-busy.ts`, IS #269): until that read, a ✓ refused for an overlap or a
  // time already passed leaves its suggestion showing, and a second ✓ would be refused again.
  const [busy, setBusy] = useState<readonly Busy[]>([]);
  // The ids hidden on `day`: kept here too, so a ✗ holds for this screen when storage fails.
  const [dismissed, setDismissed] = useState<{ day: string; ids: readonly string[] }>({ day: "", ids: [] });
  const [creates, setCreates] = useState(0);
  // Suggestions a ✓ created, hidden until a read sent after it applies: until then the
  // checklist shown was read before the entry existed, and a second ✓ would answer 409. `after`
  // is the newest read sent when the ✓ succeeded.
  const [confirmed, setConfirmed] = useState<readonly Confirmed[]>([]);
  // Bumped to read again after a ✓, refused or not, and on `reload`.
  const [reads, setReads] = useState(0);
  // The newest read sent: reads can answer out of order, and only the newest is applied.
  const latestRead = useRef(0);
  // The day of the read applied last.
  const appliedDay = useRef<string | null>(null);

  const behind = isBehind(checklist, now);
  // Today's day number, or the time each time `now` is set while the checklist's day is behind.
  const turn = behind ? now.getTime() : stockholmDay(now);
  const current = behind ? null : checklist;

  useEffect(() => {
    const id = ++latestRead.current;
    void adminFetch<unknown>("/api/admin/checklist").then((result) => {
      if (id !== latestRead.current) return;
      setBusy((rows) => stillBusy(rows, id));
      const read = result.ok ? checklistOf(result.data) : null;
      // A failed read keeps the last good checklist under its error, and what ✓ hid.
      if (!read) return setReadError(result.ok ? API_ERRORS.unknown : result.error);
      setReadError(null);
      if (appliedDay.current !== null && appliedDay.current !== read.day) setActionError(null);
      appliedDay.current = read.day;
      setChecklist(read);
      setConfirmed((list) => stillHidden(list, id));
      // Read here, not in the updater, which React may run twice.
      const stored = readDismissed(storage, read.day);
      setDismissed((last) => ({
        day: read.day,
        ids: [...new Set([...(last.day === read.day ? last.ids : []), ...stored])],
      }));
    });
  }, [revision, turn, reads]);

  async function confirm(suggestion: Suggestion) {
    setActionError(null);
    setBusy((rows) => [...rows, { id: suggestion.from_id, after: null }]);
    const result = await adminFetch("/api/admin/locations", { method: "POST", body: confirmBody(suggestion) });
    // The newest read sent when the ✓ answered, for `confirmed` and the busy row both; this
    // ✓'s own read, sent by the effect after `setReads` below, has a higher id.
    const sent = latestRead.current;
    if (result.ok) {
      setConfirmed((list) => [...list, { id: suggestion.from_id, after: sent }]);
      setCreates((count) => count + 1);
    } else {
      setActionError({ id: suggestion.from_id, text: `${suggestion.truck_name}: ${result.error}` });
    }
    setBusy((rows) => answered(rows, suggestion.from_id, sent));
    // Read again either way, before the list's reload rather than after it: a created entry,
    // a 409's, or one an answer lost may have created, now overlaps the suggestion.
    setReads((count) => count + 1);
    if (listMayHaveChanged(result)) await reloadList();
  }

  const hidden = [
    ...(current && dismissed.day === current.day ? dismissed.ids : []),
    ...confirmed.map(({ id }) => id),
  ];
  const shown = current ? current.suggestions.filter((s) => !hidden.includes(s.from_id)) : [];

  function dismiss(suggestion: Suggestion) {
    if (!current) return;
    const listed = shown.map((s) => s.from_id);
    setActionError((error) => (error && (error.id === suggestion.from_id || !listed.includes(error.id)) ? null : error));
    const { day } = current;
    // With what another tab hid on this device since.
    const ids = [
      ...new Set([...(dismissed.day === day ? dismissed.ids : []), ...readDismissed(storage, day), suggestion.from_id]),
    ];
    setDismissed({ day, ids });
    writeDismissed(storage, day, ids);
  }

  return {
    // Null while behind, too: the screen says "Hämtar…", not yesterday's list.
    checklist: current,
    shown,
    errors: { read: readError, action: actionError?.text ?? null },
    busyIds: busy.map(({ id }) => id),
    savingIds: busy.filter(({ after }) => after === null).map(({ id }) => id),
    creates,
    clearActionError: () => setActionError(null),
    reload: () => setReads((count) => count + 1),
    confirm,
    dismiss,
  };
}
