"use client";

import { useRef } from "react";
import MapView from "@/components/Map/MapView";
import { useLocations } from "@/hooks/useLocations";
import { useMapLibre } from "@/hooks/useMapLibre";
import { noticeText } from "@/lib/live";

export default function MapClient() {
  const containerRef = useRef<HTMLDivElement>(null);
  const { markers, now, fetchState } = useLocations();
  useMapLibre(containerRef, markers, now);
  const notice = noticeText(fetchState, markers.size);

  // The status region is in the first render and stays mounted; only its text changes.
  // MDN, "ARIA live regions": "Establish the live region before updating its content
  // ... The most reliable way to ensure that live regions are registered is to include
  // them in the initial markup." The region spans the map's width less a 1 rem margin a
  // side: at 360 px the longest notice is 310 px wide on one line, where centring with
  // `left-1/2 -translate-x-1/2` gave 180 px and 3 lines (probed in Chrome, PR #192).
  return (
    <div className="relative">
      <MapView ref={containerRef} />
      <div role="status" className="pointer-events-none absolute inset-x-4 top-4 z-10 flex justify-center">
        {notice && (
          <p className="pointer-events-auto rounded-md bg-white px-3 py-2 text-center text-sm text-gray-900 shadow">
            {notice}
          </p>
        )}
      </div>
    </div>
  );
}
