import { useState } from "react";
import { adminFetch, mayHaveChanged } from "@/lib/admin-api";
import {
  type FormValues,
  SAVED,
  createRequest,
  editRequest,
  emptyForm,
  endsNextDay,
  formFromEntry,
  savedText,
  timesEditable,
} from "@/lib/admin-form";
import type { AdminEntry } from "@/lib/services/locations";
import type { Location } from "@/lib/types";

// The location form: a new entry, or an edit of `editing`. The route holds the rules (#33,
// overlaps); a refusal's `{ error }`, the overlap text included, is shown as it comes.
// While a save is in flight the screen locks "Avbryt" and the list's buttons (`saving`), so
// the entry being saved is still the one open when its answer comes.

export type LocationFormState = {
  values: FormValues;
  setField: <K extends keyof FormValues>(field: K, value: FormValues[K]) => void;
  // Several fields at once: a known spot's or recent place's pin, name and times.
  fill: (fields: Partial<FormValues>) => void;
  // Changes each time the values are refilled: another entry opens, an edit closes, or a
  // new entry is saved. The place picker drops a GPS fix asked for before the change.
  generation: number;
  // Counts saves, created or edited: the place picker reads the truck's places again.
  saves: number;
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
  onStale,
}: {
  editing: AdminEntry | null;
  // When a save starts.
  onSaving: () => void;
  // After a save: reload the list, and close the edit when `closeEdit`.
  onSaved: (closeEdit: boolean) => Promise<void>;
  // After a refusal that may have left the list behind (`mayHaveChanged`, IS #275): a 404 or
  // 409, about an entry it may not show (gone, or the one it overlaps), or an answer lost
  // after the write may have committed, or a 5xx. The list is read again, so it says so.
  onStale: () => Promise<void>;
}): LocationFormState {
  const [values, setValues] = useState(() => (editing ? formFromEntry(editing) : emptyForm(new Date())));
  // The entry the values were filled from, so a new `editing` refills them during render
  // (React's "storing information from previous renders"), with no effect.
  const [filledFrom, setFilledFrom] = useState(editing);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [generation, setGeneration] = useState(0);
  const [saves, setSaves] = useState(0);

  // "Sparat." stays when a saved edit closes, and goes when another entry opens.
  if (editing !== filledFrom) {
    setFilledFrom(editing);
    setGeneration((count) => count + 1);
    setValues(editing ? formFromEntry(editing) : emptyForm(new Date()));
    setError(null);
    if (editing) setSaved(null);
  }

  function setField<K extends keyof FormValues>(field: K, value: FormValues[K]) {
    setValues((current) => ({ ...current, [field]: value }));
    setSaved(null);
  }

  function fill(fields: Partial<FormValues>) {
    setValues((current) => ({ ...current, ...fields }));
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
      if (mayHaveChanged(result)) await onStale();
      return;
    }

    // A new entry keeps its truck and date for the next one; an edit closes. The saved
    // entry decides the text; with no readable start in the answer, the plain one.
    if (!target) {
      setValues((current) => ({ ...emptyForm(new Date()), truckId: current.truckId, date: current.date }));
      setGeneration((count) => count + 1);
    }
    setSaves((count) => count + 1);
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
    fill,
    generation,
    saves,
    nextDay,
    timesLocked,
    saving,
    error,
    saved,
    clearSaved: () => setSaved(null),
    submit,
  };
}
