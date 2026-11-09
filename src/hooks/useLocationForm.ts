import { useState } from "react";
import { adminFetch } from "@/lib/admin-api";
import {
  type FormValues,
  createRequest,
  editRequest,
  emptyForm,
  endsNextDay,
  formFromEntry,
  savedText,
} from "@/lib/admin-form";
import type { AdminEntry } from "@/lib/services/locations";
import type { Location } from "@/lib/types";

// The location form: a new entry, or an edit of `editing`. The route holds the rules (#33,
// overlaps); a refusal's `{ error }`, the overlap text included, is shown as it comes.

export function useLocationForm({
  editing,
  actions,
  onSaved,
}: {
  editing: AdminEntry | null;
  // The list's count of cancels and confirms: "Sparat." goes when it moves, so it isn't
  // read as the list button's result (the owner's browser check, PR for IS #227).
  actions: number;
  onSaved: () => Promise<void>;
}): {
  values: FormValues;
  setField: (field: keyof FormValues, value: string) => void;
  nextDay: boolean;
  saving: boolean;
  error: string | null;
  // "Sparat." or `SAVED_LATER`, until a field, another entry or a list button changes.
  saved: string | null;
  submit: () => Promise<void>;
} {
  const [values, setValues] = useState(() => (editing ? formFromEntry(editing) : emptyForm(new Date())));
  // The entry the values were filled from, so a new `editing` refills them during render
  // (React's "storing information from previous renders"), with no effect.
  const [filledFrom, setFilledFrom] = useState(editing);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  const [seenActions, setSeenActions] = useState(actions);

  // "Sparat." stays when a saved edit closes, and goes when another entry opens.
  if (editing !== filledFrom) {
    setFilledFrom(editing);
    setValues(editing ? formFromEntry(editing) : emptyForm(new Date()));
    setError(null);
    if (editing) setSaved(null);
  }
  if (actions !== seenActions) {
    setSeenActions(actions);
    setSaved(null);
  }

  function setField(field: keyof FormValues, value: string) {
    setValues((current) => ({ ...current, [field]: value }));
    setSaved(null);
  }

  async function submit() {
    if (saving) return;
    const request = editing ? editRequest(values, editing) : createRequest(values);
    if (!request.ok) {
      setError(request.error);
      return;
    }

    setSaving(true);
    setError(null);
    const result = await adminFetch<{ entry: Location }>(
      editing ? `/api/admin/locations/${editing.id}` : "/api/admin/locations",
      { method: editing ? "PATCH" : "POST", body: request.body },
    );
    setSaving(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }

    // A new entry keeps its truck and date for the next one; an edit closes (`onSaved`).
    if (!editing) setValues((current) => ({ ...emptyForm(new Date()), truckId: current.truckId, date: current.date }));
    setSaved(savedText(result.data.entry, new Date()));
    await onSaved();
  }

  return { values, setField, nextDay: endsNextDay(values.start, values.end), saving, error, saved, submit };
}
