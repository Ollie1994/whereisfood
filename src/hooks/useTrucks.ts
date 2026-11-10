import { useCallback, useEffect, useRef, useState } from "react";
import { type Read, adminFetch, adminList } from "@/lib/admin-api";
import {
  TRUCK_TEXTS,
  type TruckFormValues,
  emptyTruckForm,
  truckCreateRequest,
  truckEditRequest,
  truckFormFrom,
} from "@/lib/admin-trucks";
import type { Truck } from "@/lib/types";

// The trucks screen's state (Phase 7 plan, step 10): every truck, read through the uncached
// admin route, the form for a new truck or an edit of `editing`, and "Sätt inaktiv" /
// "Aktivera" on each truck. No delete: setting inactive is an edit (`CLAUDE.md`,
// "Locations"). A list button reads the trucks again, on a refusal too; a save, when it
// succeeds or answers 404 or 409.
//
// A limit, as on the entries screen (`useLocationForm`): "Ändra" on another truck, or
// "Avbryt", replaces the form's values without asking, so unsaved changes are dropped.

const fetchTrucks = () => adminList<Truck>("/api/admin/trucks", "trucks");

export type TrucksState = {
  // Null until the trucks have been read once.
  trucks: Truck[] | null;
  listError: string | null;
  retry: () => Promise<void>;
  retrying: boolean;
  editing: Truck | null;
  startEdit: (truck: Truck) => void;
  stopEdit: () => void;
  values: TruckFormValues;
  setField: (field: keyof TruckFormValues, value: string) => void;
  saving: boolean;
  formError: string | null;
  // "Sparat." until a field or another truck changes.
  saved: string | null;
  submit: () => Promise<void>;
  // Every truck with a list request in flight, so one finishing doesn't free another's.
  busyIds: readonly string[];
  actionError: string | null;
  // Asks first when setting inactive: the truck leaves the map.
  setActive: (truck: Truck, active: boolean) => Promise<void>;
};

export function useTrucks(): TrucksState {
  const [trucks, setTrucks] = useState<Truck[] | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);
  const [editing, setEditing] = useState<Truck | null>(null);
  const [values, setValues] = useState(emptyTruckForm);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [busyIds, setBusyIds] = useState<readonly string[]>([]);
  const [actionError, setActionError] = useState<string | null>(null);
  // The newest read sent: reads can answer out of order, and only the newest is applied.
  const latestRead = useRef(0);

  const apply = useCallback((id: number, read: Read<Truck[]>) => {
    if (id !== latestRead.current) return;
    if (!read.ok) return setListError(read.error);
    setListError(null);
    setTrucks(read.data);
  }, []);

  const reload = useCallback(async () => {
    const id = ++latestRead.current;
    apply(id, await fetchTrucks());
  }, [apply]);

  // The first read, started here and applied in its callback (`adminList`'s comment).
  useEffect(() => {
    const id = ++latestRead.current;
    void fetchTrucks().then((read) => apply(id, read));
  }, [apply]);

  // "Försök igen": one read at a time, and the button says it's working.
  async function retry() {
    if (retrying) return;
    setRetrying(true);
    try {
      await reload();
    } finally {
      setRetrying(false);
    }
  }

  function open(truck: Truck | null) {
    setEditing(truck);
    setValues(truck ? truckFormFrom(truck) : emptyTruckForm());
    setFormError(null);
    setSaved(null);
  }

  async function submit() {
    if (saving) return;
    const target = editing;
    const request = target ? truckEditRequest(values, target) : truckCreateRequest(values);
    if (!request.ok) return setFormError(request.error);

    setSaving(true);
    setFormError(null);
    const result = await adminFetch<{ truck?: Truck }>(target ? `/api/admin/trucks/${target.id}` : "/api/admin/trucks", {
      method: target ? "PATCH" : "POST",
      body: request.body,
    });
    setSaving(false);
    if (!result.ok) {
      setFormError(result.error);
      // A 404 or 409 is about a truck this list may not show: gone, or holding the handle. The
      // list is read again, so it says so. The edit stays open with the error, as the entry
      // form's does; "Avbryt" closes it.
      if (result.status === 404 || result.status === 409) await reload();
      return;
    }

    // A new truck's form empties for the next; an edit closes.
    setEditing(null);
    setValues(emptyTruckForm());
    setSaved(TRUCK_TEXTS.saved);
    await reload();
  }

  async function setActive(truck: Truck, active: boolean) {
    if (!active && !window.confirm(TRUCK_TEXTS.deactivateQuestion)) return;
    setActionError(null);
    setSaved(null);
    setBusyIds((ids) => [...ids, truck.id]);
    const result = await adminFetch<{ truck?: Truck }>(`/api/admin/trucks/${truck.id}`, {
      method: "PATCH",
      body: { is_active: active },
    });
    setBusyIds((ids) => ids.filter((id) => id !== truck.id));
    if (!result.ok) setActionError(result.error);
    // Reloaded on a refusal too: a 404 means the truck is gone, and the list should say so.
    await reload();
  }

  return {
    trucks,
    listError,
    retry,
    retrying,
    editing,
    startEdit: (truck) => open(truck),
    stopEdit: () => open(null),
    values,
    setField: (field, value) => {
      setValues((current) => ({ ...current, [field]: value }));
      setSaved(null);
    },
    saving,
    formError,
    saved,
    submit,
    busyIds,
    actionError,
    setActive,
  };
}
