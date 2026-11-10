"use client";

import Checklist from "@/components/Admin/Checklist";
import LocationForm from "@/components/Admin/LocationForm";
import TodayList from "@/components/Admin/TodayList";
import { ALERT, SMALL_BUTTON } from "@/components/Admin/styles";
import { useAdminScreen } from "@/hooks/useAdminScreen";

// The admin screen's client part: the morning checklist, then the form above the list, from
// `useAdminScreen`, which joins their state.
export default function AdminLocations() {
  const { list, form, picker, checklist, confirm, cancel, waiting } = useAdminScreen();
  const { entries, trucks, now, errors, busyIds, editing, retry, retrying, startEdit, stopEdit } = list;

  // "Försök igen" under a failed read: the trucks' (the form can't create without them) or
  // the entries' (a list that couldn't be read again may be out of date).
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
      <Checklist checklist={checklist} now={now} />
      <LocationForm form={form} picker={picker} trucks={trucks} editing={editing} waiting={waiting} onStopEdit={stopEdit} />

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Poster</h2>
        {/* One slot each, not a list keyed by text: the two can hold the same message. */}
        {errors.entries && (
          <div className="flex flex-col gap-2">
            <p role="alert" className={ALERT}>
              {errors.entries}
            </p>
            {!errors.trucks && retryButton}
          </div>
        )}
        {errors.action && (
          <p role="alert" className={ALERT}>
            {errors.action}
          </p>
        )}
        {/* No list until it has been read once: an empty one would say there are no
            entries when they couldn't be read. */}
        {entries === null ? (
          !errors.entries && <p className="text-sm text-foreground/70">Hämtar…</p>
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
