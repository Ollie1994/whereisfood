import { useAdminLocations } from "@/hooks/useAdminLocations";
import { useChecklist } from "@/hooks/useChecklist";
import { useLocationForm } from "@/hooks/useLocationForm";
import { usePlacePicker } from "@/hooks/usePlacePicker";
import type { AdminEntry } from "@/lib/services/locations";

// The admin screen's hooks, joined: the checklist's ✓ reloads the list, and a save or cancel
// reloads the checklist; a save closes its edit and reloads the list, a save
// starting clears a list action's older error, a save answered 404 or 409 reloads the list
// (`onGone`), and a list button clears the form's "Sparat.". Here, not in a component
// (`CLAUDE.md`, "UI Rules": components only render).
export function useAdminScreen() {
  const list = useAdminLocations();
  const { editing, stopEdit, reload, clearActionError } = list;
  const form = useLocationForm({
    editing,
    onSaving: clearActionError,
    onSaved: async (closeEdit) => {
      if (closeEdit) stopEdit();
      await reload();
    },
    onGone: reload,
  });
  // The checklist reads again after a save or a cancel, which change what the trucks have
  // today; its ✓ reloads the list.
  const checklist = useChecklist({ revision: form.saves + list.cancels, onCreated: reload });
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
    checklist,
    confirm: (entry: AdminEntry) => {
      form.clearSaved();
      return list.confirm(entry);
    },
    // "Sparat." goes once the cancel is confirmed, not when its question is turned down.
    cancel: (entry: AdminEntry) => list.cancel(entry, form.clearSaved),
    // A cancel or confirm of the entry being edited runs first: a cancel closes the edit.
    waiting: editing !== null && list.busyIds.includes(editing.id),
  };
}
