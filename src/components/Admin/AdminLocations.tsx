"use client";

import LocationForm from "@/components/Admin/LocationForm";
import TodayList from "@/components/Admin/TodayList";
import { useAdminLocations } from "@/hooks/useAdminLocations";
import { useLocationForm } from "@/hooks/useLocationForm";

const ALERT = "rounded-md bg-red-50 p-3 text-sm text-red-800";

// The admin screen's client part: the form and the list share the list's state, so a save
// reloads the list and "Ändra" fills the form. Both hooks are here, so the list can lock
// its buttons while the form saves.
export default function AdminLocations() {
  const list = useAdminLocations();
  const { entries, trucks, now, errors, busyIds, editing, actions } = list;
  const { reload, startEdit, stopEdit, confirm, cancel } = list;
  const form = useLocationForm({
    editing,
    actions,
    onSaved: async (closeEdit) => {
      if (closeEdit) stopEdit();
      await reload();
    },
  });

  return (
    <>
      {errors.trucks && (
        <p role="alert" className={ALERT}>
          {errors.trucks}
        </p>
      )}
      <LocationForm
        form={form}
        trucks={trucks}
        editing={editing}
        // A cancel or confirm of the entry being edited runs first: a cancel closes
        // the edit.
        waiting={editing !== null && busyIds.includes(editing.id)}
        onStopEdit={stopEdit}
      />

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Poster</h2>
        {[errors.entries, errors.action].map(
          (error) =>
            error && (
              <p key={error} role="alert" className={ALERT}>
                {error}
              </p>
            ),
        )}
        {/* No list until it has been read once: an empty one would say there are no
            entries when they couldn't be read. */}
        {entries === null ? (
          errors.entries ? (
            <button
              type="button"
              onClick={() => void reload()}
              className="self-start rounded-md border border-foreground/30 px-3 py-2 text-sm"
            >
              Försök igen
            </button>
          ) : (
            <p className="text-sm text-foreground/70">Hämtar…</p>
          )
        ) : (
          <TodayList
            entries={entries}
            now={now}
            busyIds={busyIds}
            locked={form.saving}
            onEdit={startEdit}
            onConfirm={(entry) => void confirm(entry)}
            onCancel={(entry) => void cancel(entry)}
          />
        )}
      </section>
    </>
  );
}
