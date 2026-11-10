import { useAdminLocations } from "@/hooks/useAdminLocations";
import { useLocationForm } from "@/hooks/useLocationForm";
import { usePlacePicker } from "@/hooks/usePlacePicker";
import type { AdminEntry } from "@/lib/services/locations";

// The admin screen's hooks, joined: a save closes its edit and reloads the list, a save
// starting clears a list action's older error, and a list button clears the form's
// "Sparat.". Here, not in a component (`CLAUDE.md`, "UI Rules": components only render).
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
  });
  // The place picker fills the form's pin and name, and reads the form's truck's places.
  const picker = usePlacePicker({
    truckId: form.values.truckId,
    onPin: (pin) => form.setField("pin", pin),
    onPlace: form.setPlace,
  });

  return {
    list,
    form,
    picker,
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
