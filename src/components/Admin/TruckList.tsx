import { SMALL_BUTTON as ACTION } from "@/components/Admin/styles";
import type { Truck } from "@/lib/types";

interface TruckListProps {
  trucks: Truck[];
  busyIds: readonly string[];
  // Every button waits while the form saves.
  locked: boolean;
  onEdit: (truck: Truck) => void;
  onSetActive: (truck: Truck, active: boolean) => void;
}

// Every truck by name, inactive ones marked, each with "Ändra" and "Sätt inaktiv" or
// "Aktivera". No delete (`CLAUDE.md`, "Locations").
export default function TruckList({ trucks, busyIds, locked, onEdit, onSetActive }: TruckListProps) {
  if (trucks.length === 0) return <p className="text-sm text-foreground/70">Inga foodtrucks än.</p>;

  return (
    <ul className="flex flex-col gap-3">
      {trucks.map((truck) => {
        const busy = busyIds.includes(truck.id) || locked;
        const details = [truck.instagram_handle && `@${truck.instagram_handle}`, truck.cuisine_type].filter(Boolean);
        return (
          <li key={truck.id} className="flex flex-col gap-2 rounded-md border border-foreground/20 p-3">
            <div className="flex flex-col">
              <span className="font-medium">
                {truck.name}
                {!truck.is_active && <span className="font-normal text-foreground/60"> · Inaktiv</span>}
              </span>
              {details.length > 0 && <span className="text-sm text-foreground/70">{details.join(" · ")}</span>}
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => onEdit(truck)} disabled={busy} className={ACTION}>
                Ändra
              </button>
              <button type="button" onClick={() => onSetActive(truck, !truck.is_active)} disabled={busy} className={ACTION}>
                {truck.is_active ? "Sätt inaktiv" : "Aktivera"}
              </button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
