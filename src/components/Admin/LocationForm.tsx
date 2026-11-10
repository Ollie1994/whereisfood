"use client";

import PlacePicker from "@/components/Admin/PlacePicker";
import { ALERT, FIELD, FIELDSET, LABEL } from "@/components/Admin/styles";
import type { LocationFormState } from "@/hooks/useLocationForm";
import type { PlacePickerState } from "@/hooks/usePlacePicker";
import type { AdminEntry } from "@/lib/services/locations";
import { TIMES_READ_ONLY } from "@/lib/admin-form";
import type { Truck } from "@/lib/types";

// A new entry, or an edit of `editing`. Creating lists active trucks only; an edit shows
// the entry's own truck read-only, an inactive one too, since a patch can't change it
// (Phase 7 plan, step 7). Its state is `useLocationForm`'s and the place picker's
// `usePlacePicker`'s, held by `AdminLocations`.
export default function LocationForm({
  form,
  picker,
  trucks,
  editing,
  waiting,
  onStopEdit,
}: {
  form: LocationFormState;
  picker: PlacePickerState;
  trucks: Truck[];
  editing: AdminEntry | null;
  waiting: boolean;
  onStopEdit: () => void;
}) {
  const { values, setField, nextDay, timesLocked, saving, error, saved, submit } = form;
  const active = trucks.filter((truck) => truck.is_active);

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <h2 className="text-lg font-semibold">{editing ? "Ändra post" : "Ny post"}</h2>

      {/* Locked while a save runs: its answer empties or closes the form, which would drop
          anything typed meanwhile. A limit: only form controls lock, so a tap on the picker's
          map or a GPS fix during the save still moves the pin, which the answer replaces. */}
      <fieldset disabled={saving} className={FIELDSET}>
        {editing ? (
          <p className="text-sm">
            <span className="font-medium">Foodtruck:</span> {editing.truck_name}
          </p>
        ) : (
          <label className={LABEL}>
            Foodtruck
            <select value={values.truckId} onChange={(event) => setField("truckId", event.target.value)} className={FIELD}>
              <option value="">Välj foodtruck</option>
              {active.map((truck) => (
                <option key={truck.id} value={truck.id}>
                  {truck.name}
                </option>
              ))}
            </select>
          </label>
        )}

        <PlacePicker
          picker={picker}
          pin={values.pin}
          label={values.label}
          onLabel={(label) => setField("label", label)}
        />

        <label className={LABEL}>
          Datum
          <input
            type="date"
            value={values.date}
            onChange={(event) => setField("date", event.target.value)}
            className={FIELD}
            disabled={timesLocked}
            required
          />
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className={LABEL}>
            Från
            <input
              type="time"
              value={values.start}
              onChange={(event) => setField("start", event.target.value)}
              className={FIELD}
              disabled={timesLocked}
              required
            />
          </label>
          <label className={LABEL}>
            Till
            <input
              type="time"
              value={values.end}
              onChange={(event) => setField("end", event.target.value)}
              className={FIELD}
              disabled={timesLocked}
              required
            />
          </label>
        </div>
      </fieldset>
      {timesLocked && <p className="text-sm text-foreground/70">{TIMES_READ_ONLY}</p>}
      {nextDay && !timesLocked && <p className="text-sm text-foreground/70">Slutar imorgon</p>}

      {error && (
        <p role="alert" className={ALERT}>
          {error}
        </p>
      )}
      {saved && !error && (
        <p role="status" className="text-sm text-foreground/70">
          {saved}
        </p>
      )}

      <div className="flex gap-3">
        <button
          type="submit"
          disabled={saving || waiting}
          className="flex-1 rounded-md bg-foreground px-4 py-3 text-base font-medium text-background disabled:opacity-60"
        >
          {saving ? "Sparar…" : "Spara"}
        </button>
        {editing && (
          <button
            type="button"
            onClick={onStopEdit}
            disabled={saving}
            className="rounded-md border border-foreground/30 px-4 py-3 text-base disabled:opacity-60"
          >
            Avbryt
          </button>
        )}
      </div>
    </form>
  );
}
