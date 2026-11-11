import { useAdminLocations } from "@/hooks/useAdminLocations";
import { useChecklist } from "@/hooks/useChecklist";
import { useLocationForm } from "@/hooks/useLocationForm";
import { usePlacePicker } from "@/hooks/usePlacePicker";
import type { Suggestion } from "@/lib/services/checklist";
import type { AdminEntry } from "@/lib/services/locations";

// The admin screen's hooks, joined: a save closes its edit and reloads the list, a save
// starting (the form's or a checklist ✓) clears the list's and the checklist's older action
// errors, a save answered 404 or 409 reloads the list and the checklist (`onGone`), and a
// list button or a ✓ clears the form's "Sparat."; "Stämmer fortfarande" and a confirmed
// "Ställ in" clear the checklist's error too. A ✓ also reloads the list, and a save or
// cancel reloads the checklist. Here, not in a component (`CLAUDE.md`, "UI Rules":
// components only render).
export function useAdminScreen() {
  const list = useAdminLocations();
  const { editing, stopEdit, reload, clearActionError } = list;
  const form = useLocationForm({
    editing,
    // Called on a save, after this render has defined `checklist`.
    onSaving: () => {
      clearActionError();
      checklist.clearActionError();
    },
    onSaved: async (closeEdit) => {
      if (closeEdit) stopEdit();
      await reload();
    },
    // The 404 or 409 is about an entry the screen didn't know of, which the checklist may
    // overlap too. Called on a save, after this render has defined `checklist`.
    onGone: async () => {
      checklist.reload();
      await reload();
    },
  });
  // A limit: a refused "Stämmer fortfarande" or "Ställ in" reloads the list alone. Its 404 is
  // an entry cancelled elsewhere, which the checklist sees on its next read: a save, a
  // cancel, a ✓ or the day turning.
  const checklist = useChecklist({
    revision: form.saves + list.cancels,
    now: list.now,
    reloadList: reload,
  });
  // The place picker fills the form's place, and reads the form's truck's places.
  const picker = usePlacePicker({
    truckId: form.values.truckId,
    generation: form.generation,
    revision: form.saves + list.cancels + checklist.creates,
    timesLocked: form.timesLocked,
    onFill: form.fill,
  });

  return {
    list,
    form,
    picker,
    checklist: {
      ...checklist,
      confirm: (suggestion: Suggestion) => {
        form.clearSaved();
        clearActionError();
        return checklist.confirm(suggestion);
      },
    },
    confirm: (entry: AdminEntry) => {
      form.clearSaved();
      checklist.clearActionError();
      return list.confirm(entry);
    },
    // "Sparat." and a ✓'s error go once the cancel is confirmed, not when its question is
    // turned down. A cancel re-reads the checklist, under which an older ✓ error would stay.
    cancel: (entry: AdminEntry) =>
      list.cancel(entry, () => {
        form.clearSaved();
        checklist.clearActionError();
      }),
    // A cancel or confirm of the entry being edited runs first: a cancel closes the edit.
    waiting: editing !== null && list.actingIds.includes(editing.id),
  };
}
