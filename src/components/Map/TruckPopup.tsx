import { freshnessText, hoursText, statusText, type MarkerEntry } from "@/lib/live";

interface TruckPopupProps {
  marker: MarkerEntry;
  now: Date;
  onClose: () => void;
}

// Every time text comes from `live.ts`, which formats in Stockholm time: this file keeps
// no time zone or formatting of its own (PR #190).
export default function TruckPopup({ marker, now, onClose }: TruckPopupProps) {
  const { entry } = marker;
  const { truck } = entry;

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

      {/* Plan #13: a NULL label leaves the line out. */}
      {entry.label && <p className="mt-2 text-sm font-medium">{entry.label}</p>}

      <p className="mt-2 text-sm">
        <span className={marker.status === "open" ? "font-medium text-green-700" : "font-medium"}>
          {statusText(marker)}
        </span>
        {" · "}
        {hoursText(entry, now)}
      </p>

      <p className="mt-1 text-xs text-gray-500">{freshnessText(entry.updated_at, now)}</p>

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
