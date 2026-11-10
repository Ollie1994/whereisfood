import { ALERT, FIELD, FIELDSET, LABEL, PRIMARY_BUTTON, SECONDARY_BUTTON } from "@/components/Admin/styles";
import type { TrucksState } from "@/hooks/useTrucks";

interface TruckFormProps {
  trucks: TrucksState;
}

// A new truck, or an edit of `trucks.editing`. Its state is `useTrucks`'.
export default function TruckForm({ trucks }: TruckFormProps) {
  const { editing, values, setField, saving, formError, saved, submit, stopEdit } = trucks;

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <h2 className="text-lg font-semibold">{editing ? "Ändra foodtruck" : "Ny foodtruck"}</h2>

      {/* Locked while a save runs: its answer empties or closes the form, which would drop
          anything typed meanwhile. */}
      <fieldset disabled={saving} className={FIELDSET}>
        <label className={LABEL}>
          Namn
          <input
            type="text"
            value={values.name}
            onChange={(event) => setField("name", event.target.value)}
            className={FIELD}
            required
          />
        </label>
        <label className={LABEL}>
          Instagram (valfritt)
          <input
            type="text"
            value={values.instagram}
            onChange={(event) => setField("instagram", event.target.value)}
            placeholder="@konto"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            className={FIELD}
          />
        </label>
        <label className={LABEL}>
          Typ av mat (valfritt)
          <input
            type="text"
            value={values.cuisine}
            onChange={(event) => setField("cuisine", event.target.value)}
            placeholder="t.ex. Tacos"
            className={FIELD}
          />
        </label>
        <label className={LABEL}>
          Beskrivning (valfritt)
          <textarea
            value={values.description}
            onChange={(event) => setField("description", event.target.value)}
            rows={3}
            className={FIELD}
          />
        </label>
      </fieldset>

      {formError && (
        <p role="alert" className={ALERT}>
          {formError}
        </p>
      )}
      {saved && !formError && (
        <p role="status" className="text-sm text-foreground/70">
          {saved}
        </p>
      )}

      <div className="flex gap-3">
        <button
          type="submit"
          disabled={saving}
          className={PRIMARY_BUTTON}
        >
          {saving ? "Sparar…" : "Spara"}
        </button>
        {editing && (
          <button
            type="button"
            onClick={stopEdit}
            disabled={saving}
            className={SECONDARY_BUTTON}
          >
            Avbryt
          </button>
        )}
      </div>
    </form>
  );
}
