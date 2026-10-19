import { useEffect, type RefObject } from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
// Namespace import: MapLibre 6 is ESM-only and has no default export.
import * as maplibregl from "maplibre-gl";
import { Protocol } from "pmtiles";
import { layers, namedFlavor } from "@protomaps/basemaps";
import TruckPopup from "@/components/Map/TruckPopup";
import { FAKE_TRUCKS, FAKE_LOCATIONS } from "@/lib/fake-data";
import { workerUrl } from "@/lib/maplibre-worker.mjs";
import type { MapLocation, MapTruck, MarkerColor, MarkerState } from "@/lib/map-types";

const GOTHENBURG: [number, number] = [11.9746, 57.7089];
const PMTILES_URL = process.env.NEXT_PUBLIC_PMTILES_URL;

// Display threshold — sub-0.45 locations count as "no update" (grey). Old-design
// behaviour kept for the fake-data map; Phase 6 removes confidence from the UI.
const DISPLAY_THRESHOLD = 0.45;

const MARKER_COLORS: Record<MarkerColor, string> = {
  green: "#22c55e",
  yellow: "#eab308",
  grey: "#6b7280",
};

// Registered once on the client, lazily inside the effect (never on the server):
// the `pmtiles://` protocol, and MapLibre 6's worker URL.
//
// The worker is a separate file in v6, and it imports a shared chunk. Both are served
// from `public/maplibre/<version>/`, copied from node_modules by
// `scripts/copy-maplibre-worker.mjs`. Where, why versioned, and why MapLibre's
// documented Turbopack form does NOT work here: `src/lib/maplibre-worker.mjs`.
let mapLibreInitialised = false;

function deriveColor(location: MapLocation | null): MarkerColor {
  if (!location) return "grey";
  return location.confidence >= 0.9 ? "green" : "yellow";
}

// Merge trucks + locations into one MarkerState per truck (the Phase 6 `useLocations`
// hook's job once the map reads `/api/live`).
function buildMarkerStates(trucks: MapTruck[], locations: MapLocation[]): MarkerState[] {
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

// Initialises MapLibre + PMTiles on the given container and renders fake-data markers.
export function useMapLibre(containerRef: RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    if (!containerRef.current || !PMTILES_URL) return;

    if (!mapLibreInitialised) {
      maplibregl.setWorkerUrl(workerUrl(maplibregl.getVersion()));
      maplibregl.addProtocol("pmtiles", new Protocol().tile);
      mapLibreInitialised = true;
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
        // Swedish labels. For Latin-script places (all of Gothenburg) the generated
        // `text-field` is `name:sv`, then `pgf:name`, then the local `name`; `name:en`
        // is only a fallback for places in other scripts.
        layers: layers("protomaps", namedFlavor("light"), { lang: "sv" }),
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
        }).setLngLat(lngLat);

        // flushSync so the popup measures populated content, not an empty div.
        flushSync(() =>
          root.render(
            <TruckPopup marker={markerState} onClose={() => popup.remove()} />,
          ),
        );
        popup.setDOMContent(content).addTo(map);

        // Defer unmount — synchronous unmount inside the popup's own React event warns.
        popup.on("close", () => queueMicrotask(() => root.unmount()));
        activePopup = popup;
      });

      markers.push(marker);
    }

    return () => {
      closeActive();
      markers.forEach((marker) => marker.remove());
      map.remove();
    };
  }, [containerRef]);
}
