import dynamic from "next/dynamic";
import type { PickerMapProps } from "@/components/Admin/PickerMap";
import { ALERT, FIELD, LABEL, SMALL_BUTTON } from "@/components/Admin/styles";
import type { PlacePickerState } from "@/hooks/usePlacePicker";
import { PICKER_TEXTS, type Pin, pinText, placeText, spotAt } from "@/lib/admin-place";
import { SPOTS } from "@/lib/spots";

function MapFailed() {
  return (
    <p role="alert" className={ALERT}>
      {PICKER_TEXTS.mapFailed}
    </p>
  );
}

// Fetched when the map first opens, with MapLibre; a failed fetch shows `MapFailed`, not
// the error page.
const PickerMap = dynamic<PickerMapProps>(
  () => import("@/components/Admin/PickerMap").catch(() => ({ default: MapFailed })),
  { ssr: false, loading: () => <p className="text-sm text-foreground/70">Laddar kartan…</p> },
);

interface PlacePickerProps {
  picker: PlacePickerState;
  pin: Pin | null;
  label: string;
  onLabel: (label: string) => void;
}

// The form's place: a known spot, a recent place, a map tap or "Jag är här nu", and the
// place's name. What each pick fills is `usePlacePicker`'s.
export default function PlacePicker({ picker, pin, label, onLabel }: PlacePickerProps) {
  const { recentPlaces, recentLoading, recentError, message, mapOpen, locating } = picker;

  return (
    <div className="flex flex-col gap-3">
      <label className={LABEL}>
        Plats
        <select value={spotAt(pin, label)} onChange={(event) => picker.pickSpot(event.target.value)} className={FIELD}>
          <option value="">Välj känd plats</option>
          {SPOTS.map((spot) => (
            <option key={spot.name} value={spot.name}>
              {spot.name}
            </option>
          ))}
        </select>
      </label>

      {recentLoading && <p className="text-sm text-foreground/70">Hämtar senaste platser…</p>}
      {recentError && (
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm text-foreground/70">{recentError}</p>
          <button type="button" onClick={picker.retryRecent} className={SMALL_BUTTON}>
            Försök igen
          </button>
        </div>
      )}
      {recentPlaces && recentPlaces.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium">Senaste platser</p>
          <div className="flex flex-wrap gap-2">
            {recentPlaces.map((place) => (
              <button
                key={JSON.stringify([place.label, place.latitude, place.longitude])}
                type="button"
                onClick={() => picker.pickRecent(place)}
                className={SMALL_BUTTON}
              >
                {placeText(place)}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={picker.toggleMap} aria-expanded={mapOpen} className={SMALL_BUTTON}>
          {mapOpen ? "Klar" : "Välj på kartan"}
        </button>
        <button type="button" onClick={() => void picker.locate()} disabled={locating} className={SMALL_BUTTON}>
          {locating ? "Hämtar position…" : "Jag är här nu"}
        </button>
      </div>

      {message && (
        <p role="alert" className={ALERT}>
          {message}
        </p>
      )}
      {mapOpen && (
        <div className="flex flex-col gap-1">
          <p className="text-sm text-foreground/70">Tryck på kartan där bilen står.</p>
          <PickerMap pin={pin} onTap={picker.tapMap} />
        </div>
      )}
      <p className="text-sm text-foreground/70">{pin ? `Nål: ${pinText(pin)}` : "Ingen plats vald"}</p>

      <label className={LABEL}>
        Platsnamn (valfritt)
        <input
          type="text"
          value={label}
          onChange={(event) => onLabel(event.target.value)}
          placeholder="t.ex. Heden"
          className={FIELD}
        />
      </label>
    </div>
  );
}
