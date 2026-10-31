"use client";

import { useRef } from "react";
import MapView from "@/components/Map/MapView";
import { useLocations, type FetchState } from "@/hooks/useLocations";
import { useMapLibre } from "@/hooks/useMapLibre";

// Plan, open decisions 6 and 7. Nothing before the first response: an empty map then
// isn't "no trucks". While polls fail the markers stay (plan #16), so with none showing
// the notice says nothing could be fetched, and with some it says they may be old.
function noticeText(fetchState: FetchState, markerCount: number): string | null {
  if (fetchState === "failing") {
    return markerCount === 0 ? "Kunde inte hämta foodtrucks. Försöker igen…" : "Kunde inte uppdatera";
  }
  if (fetchState === "ok" && markerCount === 0) return "Inga foodtrucks idag";
  return null;
}

export default function MapClient() {
  const containerRef = useRef<HTMLDivElement>(null);
  const { markers, now, fetchState } = useLocations();
  useMapLibre(containerRef, markers, now);
  const notice = noticeText(fetchState, markers.size);

  return (
    <div className="relative">
      <MapView ref={containerRef} />
      {notice && (
        <p
          role="status"
          className="absolute left-1/2 top-4 z-10 -translate-x-1/2 rounded-md bg-white px-3 py-2 text-sm text-gray-900 shadow"
        >
          {notice}
        </p>
      )}
    </div>
  );
}
