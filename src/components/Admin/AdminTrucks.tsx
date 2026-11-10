"use client";

import TruckForm from "@/components/Admin/TruckForm";
import TruckList from "@/components/Admin/TruckList";
import { ALERT, SMALL_BUTTON } from "@/components/Admin/styles";
import { useTrucks } from "@/hooks/useTrucks";

// The trucks screen's client part: the form above the list, from `useTrucks`.
export default function AdminTrucks() {
  const trucks = useTrucks();
  const { trucks: list, listError, retry, busyIds, actionError, saving, startEdit, setActive } = trucks;

  return (
    <>
      <TruckForm trucks={trucks} />

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Alla foodtrucks</h2>
        {listError && (
          <div className="flex flex-col gap-2">
            <p role="alert" className={ALERT}>
              {listError}
            </p>
            <button type="button" onClick={retry} className={`self-start ${SMALL_BUTTON}`}>
              Försök igen
            </button>
          </div>
        )}
        {actionError && (
          <p role="alert" className={ALERT}>
            {actionError}
          </p>
        )}
        {list === null ? (
          !listError && <p className="text-sm text-foreground/70">Hämtar…</p>
        ) : (
          <TruckList
            trucks={list}
            busyIds={busyIds}
            locked={saving}
            onEdit={startEdit}
            onSetActive={(truck, active) => void setActive(truck, active)}
          />
        )}
      </section>
    </>
  );
}
