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

  // Keep the status region mounted and change only its text (PR #192's round 1).
  return (
    <div className="relative">
      <MapView ref={containerRef} />
      <div role="status" className="absolute left-1/2 top-4 z-10 -translate-x-1/2">
        {notice && (
          <p className="rounded-md bg-white px-3 py-2 text-sm text-gray-900 shadow">{notice}</p>
        )}
      </div>
    </div>
  );
}
