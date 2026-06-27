"use client";

import { useEffect, useRef } from "react";
import { createRoot } from "react-dom/client";
import maplibregl from "maplibre-gl";
import { Protocol } from "pmtiles";
import layers from "protomaps-themes-base";
import MapView from "@/components/Map/MapView";
import TruckPopup from "@/components/Map/TruckPopup";
import { FAKE_TRUCKS, FAKE_LOCATIONS } from "@/lib/fake-data";
import type { Location, MarkerColor, MarkerState, Truck } from "@/lib/types";

const GOTHENBURG: [number, number] = [11.9746, 57.7089];
const PMTILES_URL = process.env.NEXT_PUBLIC_PMTILES_URL;

// Display threshold — sub-0.45 locations count as "no update" (grey), per CLAUDE.md.
const DISPLAY_THRESHOLD = 0.45;

const MARKER_COLORS: Record<MarkerColor, string> = {
  green: "#22c55e",
  yellow: "#eab308",
  grey: "#6b7280",
};

// Registered once on the client, lazily inside the effect (never on the server).
let pmtilesRegistered = false;

function deriveColor(location: Location | null): MarkerColor {
  if (!location) return "grey";
  return location.confidence >= 0.9 ? "green" : "yellow";
}

// Merge trucks + locations into one MarkerState per truck (the Phase 4 hook's job).
function buildMarkerStates(trucks: Truck[], locations: Location[]): MarkerState[] {
  return trucks.flatMap((truck) => {
    const location =
      locations.find(
        (l) =>
          l.truck_id === truck.id &&
          !l.is_negation &&
          l.confidence >= DISPLAY_THRESHOLD,
      ) ?? null;

    const latitude = location?.latitude ?? truck.last_known_latitude;
    const longitude = location?.longitude ?? truck.last_known_longitude;
    if (latitude == null || longitude == null) return []; // never posted → no marker

    return [{ truck, location, color: deriveColor(location), latitude, longitude }];
  });
}

function createMarkerElement(color: MarkerColor): HTMLDivElement {
  const el = document.createElement("div");
  el.style.width = "18px";
  el.style.height = "18px";
  el.style.borderRadius = "50%";
  el.style.background = MARKER_COLORS[color];
  el.style.border = "2px solid #ffffff";
  el.style.boxShadow = "0 1px 4px rgba(0, 0, 0, 0.4)";
  el.style.cursor = "pointer";
  return el;
}

export default function MapClient() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current || !PMTILES_URL) return;

    if (!pmtilesRegistered) {
      maplibregl.addProtocol("pmtiles", new Protocol().tile);
      pmtilesRegistered = true;
    }

    const map = new maplibregl.Map({
      container: containerRef.current,
      center: GOTHENBURG,
      zoom: 13,
      style: {
        version: 8,
        glyphs:
          "https://protomaps.github.io/basemaps-assets/fonts/{fontstack}/{range}.pbf",
        sprite: "https://protomaps.github.io/basemaps-assets/sprites/v4/light",
        sources: {
          protomaps: {
            type: "vector",
            url: `pmtiles://${PMTILES_URL}`,
            attribution:
              '<a href="https://protomaps.com">Protomaps</a> © <a href="https://openstreetmap.org">OpenStreetMap</a>',
          },
        },
        layers: layers("protomaps", "light", "en"),
      },
    });

    const markers: maplibregl.Marker[] = [];
    let activePopup: maplibregl.Popup | null = null;

    const closeActive = () => {
      activePopup?.remove(); // fires "close" → unmounts its React root
      activePopup = null;
    };

    for (const markerState of buildMarkerStates(FAKE_TRUCKS, FAKE_LOCATIONS)) {
      const el = createMarkerElement(markerState.color);
      const lngLat: [number, number] = [
        markerState.longitude,
        markerState.latitude,
      ];

      const marker = new maplibregl.Marker({ element: el })
        .setLngLat(lngLat)
        .addTo(map);

      el.addEventListener("click", (event) => {
        event.stopPropagation(); // keep closeOnClick from closing the new popup
        closeActive();

        const content = document.createElement("div");
        const root = createRoot(content);
        const popup = new maplibregl.Popup({
          closeButton: false,
          closeOnClick: true,
        })
          .setLngLat(lngLat)
          .setDOMContent(content)
          .addTo(map);

        root.render(
          <TruckPopup marker={markerState} onClose={() => popup.remove()} />,
        );
        popup.on("close", () => root.unmount());
        activePopup = popup;
      });

      markers.push(marker);
    }

    return () => {
      closeActive();
      markers.forEach((marker) => marker.remove());
      map.remove();
    };
  }, []);

  return <MapView ref={containerRef} />;
}
