import { formatInTimeZone } from "date-fns-tz";
import type { MarkerState } from "@/lib/types";

const TZ = "Europe/Stockholm";

// Human-language confidence — never raw numbers (CLAUDE.md UI rule).
const CONFIDENCE_LABEL: Record<MarkerState["color"], string> = {
  green: "Postad av trucken idag",
  yellow: "Baserat på morgonens inlägg",
  grey: "Ingen uppdatering idag",
};

interface TruckPopupProps {
  marker: MarkerState;
  onClose: () => void;
}

export default function TruckPopup({ marker, onClose }: TruckPopupProps) {
  const { truck, location, color } = marker;

  const hours = location
    ? location.ends_at
      ? `${formatInTimeZone(location.starts_at, TZ, "HH:mm")}–${formatInTimeZone(location.ends_at, TZ, "HH:mm")}`
      : `Från ${formatInTimeZone(location.starts_at, TZ, "HH:mm")}`
    : null;

  // Normalise handle — strip a leading @ so the URL and display are always clean.
  const handle = truck.instagram_handle?.replace(/^@/, "");

  return (
    <div className="relative w-64 rounded-lg bg-white p-4 text-gray-900 shadow-lg">
      <button
        onClick={onClose}
        aria-label="Stäng"
        className="absolute right-2 top-2 text-gray-400 hover:text-gray-600"
      >
        ×
      </button>

      <h2 className="text-lg font-semibold">{truck.name}</h2>

      {truck.cuisine_type && (
        <p className="text-sm text-gray-500">{truck.cuisine_type}</p>
      )}

      {hours && <p className="mt-2 text-sm">{hours}</p>}

      <p className="mt-1 text-sm text-gray-600">{CONFIDENCE_LABEL[color]}</p>

      {handle && (
        <a
          href={`https://instagram.com/${handle}`}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-2 inline-block text-sm text-blue-600 hover:underline"
        >
          @{handle}
        </a>
      )}
    </div>
  );
}