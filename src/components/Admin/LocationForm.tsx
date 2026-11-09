"use client";

import type { LocationFormState } from "@/hooks/useLocationForm";
import type { AdminEntry } from "@/lib/services/locations";
import { SPOTS } from "@/lib/spots";
import type { Truck } from "@/lib/types";

const FIELD = "rounded-md border border-foreground/30 bg-background px-3 py-3 text-base";
const LABEL = "flex flex-col gap-1 text-sm font-medium";

// A new entry, or an edit of `editing`. Creating lists active trucks only; an edit shows
// the entry's own truck read-only, an inactive one too, since a patch can't change it
// (Phase 7 plan, step 7). Its state is `useLocationForm`'s, held by `AdminLocations`.
export default function LocationForm({
  form,
  trucks,
  editing,
  waiting,
  onStopEdit,
}: {
  form: LocationFormState;
  trucks: Truck[];
  editing: AdminEntry | null;
  waiting: boolean;
  onStopEdit: () => void;
}) {
  const { values, setField, nextDay, saving, error, saved, submit } = form;
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

      <label className={LABEL}>
        Plats
        <select value={values.place} onChange={(event) => setField("place", event.target.value)} className={FIELD}>
          <option value="">{editing ? `Behåll ${editing.label ?? "platsen"}` : "Välj plats"}</option>
          {SPOTS.map((spot) => (
            <option key={spot.name} value={spot.name}>
              {spot.name}
            </option>
          ))}
        </select>
      </label>

      <label className={LABEL}>
        Datum
        <input
          type="date"
          value={values.date}
          onChange={(event) => setField("date", event.target.value)}
          className={FIELD}
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
            required
          />
        </label>
      </div>
      {nextDay && <p className="text-sm text-foreground/70">Slutar imorgon</p>}

      {error && (
        <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-800">
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
