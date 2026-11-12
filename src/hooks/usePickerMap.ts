import { useEffect, useRef, useState, type RefObject } from "react";
// Namespace import, for the reason `map-setup.ts` gives.
import * as maplibregl from "maplibre-gl";
import type { Pin } from "@/lib/admin-place";
import { NO_WEBGL2, createBaseMap } from "@/lib/map-setup";

// Close enough to see which side of a square the pin is on.
const PIN_ZOOM = 16;
const PIN_COLOR = "#dc2626";

// The place picker's map: the basemap on `containerRef`, a tap handed to `onTap` as
// latitude and longitude, and one marker at `pin`, moved when it changes, never the map
// rebuilt (`CLAUDE.md`, "UI Rules"). Opens on the pin it is given, or on Gothenburg.
// True when the map couldn't be built here, for `PickerMap` to say so.
export function usePickerMap(
  containerRef: RefObject<HTMLDivElement | null>,
  pin: Pin | null,
  onTap: (latitude: number, longitude: number) => void,
): boolean {
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markerRef = useRef<maplibregl.Marker | null>(null);
  // The latest of each, for the map's click handler and its first view, which are set once.
  const onTapRef = useRef(onTap);
  const pinRef = useRef(pin);
  // Counts maps built, so the pin effect re-runs after a build, as `useMapLibre`'s does.
  const [builds, setBuilds] = useState(0);
  const [failed, setFailed] = useState(false);

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
    // Each run's own outcome, so a later run that builds a map clears an earlier failure;
    // `PickerMap` says so while it holds. Set from a callback, not the effect's body
    // (`react-hooks/set-state-in-effect`).
    const unsupported = created === NO_WEBGL2;
    queueMicrotask(() => setFailed(unsupported));
    if (created === NO_WEBGL2) return;
    // A limit: with no tiles URL the box stays empty, with no message, as `/map` does.
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
    // A new pin may be out of view, or the map zoomed out past where a pin can be judged;
    // a tap at a wide zoom then zooms in on it too.
    if (!map.getBounds().contains(lngLat) || map.getZoom() < PIN_ZOOM) {
      map.easeTo({ center: lngLat, zoom: Math.max(map.getZoom(), PIN_ZOOM) });
    }
  }, [builds, pin]);

  return failed;
}
