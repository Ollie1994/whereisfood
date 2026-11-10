import { useEffect, useRef, useState, type RefObject } from "react";
// Namespace import: MapLibre 6 is ESM-only and has no default export.
import * as maplibregl from "maplibre-gl";
import { createBaseMap } from "@/hooks/useMapLibre";
import type { Pin } from "@/lib/admin-place";

// Close enough to see which side of a square the pin is on.
const PIN_ZOOM = 16;
const PIN_COLOR = "#dc2626";

// The place picker's map: the basemap on `containerRef`, a tap handed to `onTap` as
// latitude and longitude, and one marker at `pin`, moved when it changes, never the map
// rebuilt (`CLAUDE.md`, "UI Rules"). Opens on the pin it is given, or on Gothenburg.
export function usePickerMap(
  containerRef: RefObject<HTMLDivElement | null>,
  pin: Pin | null,
  onTap: (latitude: number, longitude: number) => void,
) {
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markerRef = useRef<maplibregl.Marker | null>(null);
  // The latest of each, for the map's click handler and its first view, which are set once.
  const onTapRef = useRef(onTap);
  const pinRef = useRef(pin);
  // Counts maps built, so the pin effect re-runs after a build, as `useMapLibre`'s does.
  const [builds, setBuilds] = useState(0);

  useEffect(() => {
    onTapRef.current = onTap;
    pinRef.current = pin;
  });

  useEffect(() => {
    if (!containerRef.current) return;
    const start = pinRef.current;
    const created = createBaseMap(
      containerRef.current,
      start ? { center: [start.longitude, start.latitude], zoom: PIN_ZOOM } : undefined,
    );
    if (!created) return;
    // Latitude first, the app's order (`geo.ts`); MapLibre's `[lng, lat]` stays here.
    created.on("click", (event) => onTapRef.current(event.lngLat.lat, event.lngLat.lng));
    mapRef.current = created;
    setBuilds((count) => count + 1);

    return () => {
      markerRef.current?.remove();
      markerRef.current = null;
      mapRef.current = null;
      created.remove();
    };
  }, [containerRef]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (!pin) {
      markerRef.current?.remove();
      markerRef.current = null;
      return;
    }
    const lngLat: [number, number] = [pin.longitude, pin.latitude];
    if (markerRef.current) markerRef.current.setLngLat(lngLat);
    else markerRef.current = new maplibregl.Marker({ color: PIN_COLOR }).setLngLat(lngLat).addTo(map);
    // A spot or recent place picked while the map is open may be out of view.
    if (!map.getBounds().contains(lngLat)) map.easeTo({ center: lngLat });
  }, [builds, pin]);
}
