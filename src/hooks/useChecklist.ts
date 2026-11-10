import { useEffect, useRef, useState } from "react";
import { checklistOf, confirmBody, readDismissed, writeDismissed } from "@/lib/admin-checklist";
import { API_ERRORS, adminFetch } from "@/lib/admin-api";
import type { Checklist, Suggestion } from "@/lib/services/checklist";

// The morning checklist (Phase 7 plan, #20, #22): read through the uncached admin route, on
// opening, on each `revision` (a save or cancel elsewhere on the screen changes what the
// trucks have today) and after each ✓. ✓ posts the ordinary create, so an overlap answers
// 409 like the form's; ✗ hides the suggestion on this device for the checklist's day.
//
// A limit: the server leaves out what has ended when it reads, so a suggestion ending while
// the screen is open stays until the next read, and its ✓ is refused ("Tiden har redan
// passerat"), after which it is read again and gone.

// A getter: reading `window.localStorage` throws when site data is blocked (`readDismissed`).
const storage = () => window.localStorage;

export type ChecklistState = {
  // Null until read once, so a failed first read shows no "no suggestions" under its error.
  checklist: Checklist | null;
  // The suggestions not hidden by ✗.
  shown: Suggestion[];
  errors: { read: string | null; action: string | null };
  busyIds: readonly string[];
  // Counts ✓s that created an entry: the place picker's recent places can change.
  creates: number;
  retry: () => void;
  confirm: (suggestion: Suggestion) => Promise<void>;
  dismiss: (suggestion: Suggestion) => void;
};

export function useChecklist({
  revision,
  onCreated,
}: {
  revision: number;
  onCreated: () => Promise<void>;
}): ChecklistState {
  const [checklist, setChecklist] = useState<Checklist | null>(null);
  const [readError, setReadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  // By `from_id`, every suggestion with a ✓ in flight.
  const [busyIds, setBusyIds] = useState<readonly string[]>([]);
  // The ids hidden on `day`: kept here too, so a ✗ holds for this screen when storage fails.
  const [dismissed, setDismissed] = useState<{ day: string; ids: readonly string[] }>({ day: "", ids: [] });
  const [creates, setCreates] = useState(0);
  // Bumped to read again after a ✓, refused or not, and on "Försök igen".
  const [reads, setReads] = useState(0);
  // The newest read sent: reads can answer out of order, and only the newest is applied.
  const latestRead = useRef(0);

  useEffect(() => {
    const id = ++latestRead.current;
    void adminFetch<unknown>("/api/admin/checklist").then((result) => {
      if (id !== latestRead.current) return;
      const read = result.ok ? checklistOf(result.data) : null;
      // A failed read keeps the last good checklist under its error.
      if (!read) return setReadError(result.ok ? API_ERRORS.unknown : result.error);
      setReadError(null);
      setChecklist(read);
      setDismissed((last) => ({
        day: read.day,
        ids: [...new Set([...(last.day === read.day ? last.ids : []), ...readDismissed(storage, read.day)])],
      }));
    });
  }, [revision, reads]);

  async function confirm(suggestion: Suggestion) {
    setActionError(null);
    setBusyIds((ids) => [...ids, suggestion.from_id]);
    const result = await adminFetch("/api/admin/locations", { method: "POST", body: confirmBody(suggestion) });
    setBusyIds((ids) => ids.filter((id) => id !== suggestion.from_id));
    if (result.ok) {
      setCreates((count) => count + 1);
      await onCreated();
    } else {
      setActionError(`${suggestion.truck_name}: ${result.error}`);
    }
    // Read again either way: a created entry, or a 409's, now overlaps the suggestion.
    setReads((count) => count + 1);
  }

  function dismiss(suggestion: Suggestion) {
    if (!checklist) return;
    const { day } = checklist;
    // With what another tab hid on this device since.
    const ids = [
      ...new Set([...(dismissed.day === day ? dismissed.ids : []), ...readDismissed(storage, day), suggestion.from_id]),
    ];
    setDismissed({ day, ids });
    writeDismissed(storage, day, ids);
  }

  const hidden = checklist && dismissed.day === checklist.day ? dismissed.ids : [];
  return {
    checklist,
    shown: checklist ? checklist.suggestions.filter((s) => !hidden.includes(s.from_id)) : [],
    errors: { read: readError, action: actionError },
    busyIds,
    creates,
    retry: () => setReads((count) => count + 1),
    confirm,
    dismiss,
  };
}
