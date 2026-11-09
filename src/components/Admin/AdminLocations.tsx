"use client";

import LocationForm from "@/components/Admin/LocationForm";
import TodayList from "@/components/Admin/TodayList";
import { useAdminLocations } from "@/hooks/useAdminLocations";

// The admin screen's client part: the form and the list share the list's state, so a save
// reloads the list and "Ändra" fills the form.
export default function AdminLocations() {
  const list = useAdminLocations();
  const { entries, trucks, now, error, busyIds, editing, actions } = list;
  const { reload, startEdit, stopEdit, confirm, cancel } = list;

  return (
    <>
      <LocationForm
        trucks={trucks}
        editing={editing}
        actions={actions}
        onStopEdit={stopEdit}
        onSaved={async (closeEdit) => {
          if (closeEdit) stopEdit();
          await reload();
        }}
      />

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Poster</h2>
        {error && (
          <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-800">
            {error}
          </p>
        )}
        {/* No list until it has been read once: an empty one would say there are no
            entries when they couldn't be read. */}
        {entries === null ? (
          !error && <p className="text-sm text-foreground/70">Hämtar…</p>
        ) : (
          <TodayList
            entries={entries}
            now={now}
            busyIds={busyIds}
            onEdit={startEdit}
            onConfirm={(entry) => void confirm(entry)}
            onCancel={(entry) => void cancel(entry)}
          />
        )}
      </section>
    </>
  );
}
