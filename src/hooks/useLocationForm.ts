import { useState } from "react";
import { adminFetch } from "@/lib/admin-api";
import {
  type FormValues,
  SAVED,
  createRequest,
  editRequest,
  emptyForm,
  placeValues,
  endsNextDay,
  formFromEntry,
  savedText,
  timesEditable,
} from "@/lib/admin-form";
import type { AdminEntry, Place } from "@/lib/services/locations";
import type { Location } from "@/lib/types";

// The location form: a new entry, or an edit of `editing`. The route holds the rules (#33,
// overlaps); a refusal's `{ error }`, the overlap text included, is shown as it comes.
// While a save is in flight the screen locks "Avbryt" and the list's buttons (`saving`), so
// the entry being saved is still the one open when its answer comes.

export type LocationFormState = {
  values: FormValues;
  setField: <K extends keyof FormValues>(field: K, value: FormValues[K]) => void;
  // A known spot or a recent place: its pin and its name together.
  setPlace: (place: Place) => void;
  nextDay: boolean;
  // An edit of an entry the form can't show exactly: its date and times are read-only.
  timesLocked: boolean;
  saving: boolean;
  error: string | null;
  // "Sparat." or `SAVED_LATER`, until a field, another entry or a list button changes.
  saved: string | null;
  // For the list's buttons: their result isn't this form's, so "Sparat." goes.
  clearSaved: () => void;
  submit: () => Promise<void>;
};

export function useLocationForm({
  editing,
  onSaving,
  onSaved,
}: {
  editing: AdminEntry | null;
  // When a save starts.
  onSaving: () => void;
  // After a save: reload the list, and close the edit when `closeEdit`.
  onSaved: (closeEdit: boolean) => Promise<void>;
}): LocationFormState {
  const [values, setValues] = useState(() => (editing ? formFromEntry(editing) : emptyForm(new Date())));
  // The entry the values were filled from, so a new `editing` refills them during render
  // (React's "storing information from previous renders"), with no effect.
  const [filledFrom, setFilledFrom] = useState(editing);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  // "Sparat." stays when a saved edit closes, and goes when another entry opens.
  if (editing !== filledFrom) {
    setFilledFrom(editing);
    setValues(editing ? formFromEntry(editing) : emptyForm(new Date()));
    setError(null);
    if (editing) setSaved(null);
  }

  function setField<K extends keyof FormValues>(field: K, value: FormValues[K]) {
    setValues((current) => ({ ...current, [field]: value }));
    setSaved(null);
  }

  function setPlace(place: Place) {
    setValues((current) => ({ ...current, ...placeValues(place) }));
    setSaved(null);
  }

  async function submit() {
    if (saving) return;
    const target = editing;
    const request = target ? editRequest(values, target) : createRequest(values);
    if (!request.ok) {
      setError(request.error);
      return;
    }

    setSaving(true);
    setError(null);
    onSaving();
    const result = await adminFetch<{ entry?: Location }>(
      target ? `/api/admin/locations/${target.id}` : "/api/admin/locations",
      { method: target ? "PATCH" : "POST", body: request.body },
    );
    setSaving(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }

    // A new entry keeps its truck and date for the next one; an edit closes. The saved
    // entry decides the text; with no readable start in the answer, the plain one.
    if (!target) setValues((current) => ({ ...emptyForm(new Date()), truckId: current.truckId, date: current.date }));
    const startsAt = result.data.entry?.starts_at;
    const readable = typeof startsAt === "string" && !Number.isNaN(Date.parse(startsAt));
    setSaved(readable ? savedText({ starts_at: startsAt }, new Date()) : SAVED);
    await onSaved(target !== null);
  }

  const timesLocked = editing !== null && !timesEditable(editing);
  const nextDay = endsNextDay(values.start, values.end);
  return {
    values,
    setField,
    setPlace,
    nextDay,
    timesLocked,
    saving,
    error,
    saved,
    clearSaved: () => setSaved(null),
    submit,
  };
}
