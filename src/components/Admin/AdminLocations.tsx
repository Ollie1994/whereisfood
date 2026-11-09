"use client";

import LocationForm from "@/components/Admin/LocationForm";
import TodayList from "@/components/Admin/TodayList";
import { ALERT, SMALL_BUTTON } from "@/components/Admin/styles";
import { useAdminLocations } from "@/hooks/useAdminLocations";
import { useLocationForm } from "@/hooks/useLocationForm";

// The admin screen's client part: the form and the list share the list's state, so a save
// reloads the list and "Ändra" fills the form. Both hooks are here, so the list can lock
// its buttons while the form saves.
export default function AdminLocations() {
  const list = useAdminLocations();
  const { entries, trucks, now, errors, busyIds, editing, actions } = list;
  const { reload, retry, retrying, startEdit, stopEdit, confirm, cancel } = list;
  const form = useLocationForm({
    editing,
    actions,
    onSaved: async (closeEdit) => {
      if (closeEdit) stopEdit();
      await reload();
    },
  });

  // A read that failed can be tried again: the trucks' (the form can't create without
  // them) or the first entries' (no list shows without it).
  const retryButton = (
    <button
      type="button"
      onClick={() => void retry()}
      disabled={retrying}
      className={`self-start ${SMALL_BUTTON}`}
    >
      {retrying ? "Hämtar…" : "Försök igen"}
    </button>
  );

  return (
    <>
      {errors.trucks && (
        <div className="flex flex-col gap-2">
          <p role="alert" className={ALERT}>
            {errors.trucks}
          </p>
          {retryButton}
        </div>
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
        {/* One slot each, not a list keyed by text: the two can hold the same message. */}
        {errors.entries && (
          <p role="alert" className={ALERT}>
            {errors.entries}
          </p>
        )}
        {errors.action && (
          <p role="alert" className={ALERT}>
            {errors.action}
          </p>
        )}
        {/* No list until it has been read once: an empty one would say there are no
            entries when they couldn't be read. */}
        {entries === null ? (
          errors.entries ? (
            retryButton
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
