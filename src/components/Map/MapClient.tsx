"use client";

import { useRef } from "react";
import MapView from "@/components/Map/MapView";
import { useMapLibre } from "@/hooks/useMapLibre";

export default function MapClient() {
  const containerRef = useRef<HTMLDivElement>(null);
  useMapLibre(containerRef);
  return <MapView ref={containerRef} />;
}
