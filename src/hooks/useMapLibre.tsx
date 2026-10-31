import { useEffect, useRef, type RefObject } from "react";
import { createRoot, type Root } from "react-dom/client";
import { flushSync } from "react-dom";
// Namespace import: MapLibre 6 is ESM-only and has no default export.
import * as maplibregl from "maplibre-gl";
import { Protocol } from "pmtiles";
import { layers, namedFlavor } from "@protomaps/basemaps";
import TruckPopup from "@/components/Map/TruckPopup";
import { diffMarkers, type MarkerEntry } from "@/lib/live";
import { workerUrl } from "@/lib/maplibre-worker.mjs";

const GOTHENBURG: [number, number] = [11.9746, 57.7089];
const PMTILES_URL = process.env.NEXT_PUBLIC_PMTILES_URL;

// Open is filled, later is outlined (plan, open decision 8). The colour and size are
// placeholders until the owner has looked at them on the map.
const MARKER_COLOR = "#16a34a";

// Registered once on the client, lazily inside the effect (never on the server):
// the `pmtiles://` protocol, and MapLibre 6's worker URL.
//
// The worker is a separate file in v6, and it imports a shared chunk. Both are served
// from `public/maplibre/<version>/`, copied from node_modules by
// `scripts/copy-maplibre-worker.mjs`. Where, why versioned, and why MapLibre's
// documented Turbopack form does NOT work here: `src/lib/maplibre-worker.mjs`.
let mapLibreInitialised = false;

type TruckId = string;

type LiveMarker = { marker: maplibregl.Marker; entry: MarkerEntry };

type OpenPopup = { truckId: TruckId; popup: maplibregl.Popup; root: Root };

// What the effects and the click handlers share, in one ref. `open` is set exactly while
// a popup is open: its `close` handler clears it, however the popup closed.
type MarkerLayer = {
  map: maplibregl.Map | null;
  live: Map<TruckId, LiveMarker>;
  open: OpenPopup | null;
  now: Date;
};

function lngLatOf({ entry }: MarkerEntry): [number, number] {
  return [entry.longitude, entry.latitude];
}

function styleMarkerElement(el: HTMLElement, status: MarkerEntry["status"]) {
  el.style.background = status === "open" ? MARKER_COLOR : "#ffffff";
  el.style.border = status === "open" ? "2px solid #ffffff" : `3px solid ${MARKER_COLOR}`;
}

export function createMarkerElement(status: MarkerEntry["status"]): HTMLDivElement {
  const el = document.createElement("div");
  el.style.width = "18px";
  el.style.height = "18px";
  el.style.borderRadius = "50%";
  el.style.boxSizing = "border-box";
  el.style.boxShadow = "0 1px 4px rgba(0, 0, 0, 0.4)";
  el.style.cursor = "pointer";
  styleMarkerElement(el, status);
  return el;
}

// The only place popup content is rendered: from the open truck's current entry and
// the current `now`, never values captured when the marker was added. `sync` (the click
// handler) renders inside `flushSync`, so the popup measures filled content before
// `addTo`; an effect must not, because `flushSync` inside one logs "flushSync was called
// from inside a lifecycle method" (plan, "Functions and types").
function renderOpenPopup(layer: MarkerLayer, { sync = false } = {}) {
  const open = layer.open;
  const live = open && layer.live.get(open.truckId);
  if (!open || !live) return;

  const popup = (
    <TruckPopup marker={live.entry} now={layer.now} onClose={() => open.popup.remove()} />
  );
  if (sync) flushSync(() => open.root.render(popup));
  else open.root.render(popup);
  open.popup.setLngLat(lngLatOf(live.entry));
}

// `remove()` fires the popup's `close` handler, which clears `layer.open`.
function closeOpenPopup(layer: MarkerLayer) {
  layer.open?.popup.remove();
}

function addMarker(map: maplibregl.Map, layer: MarkerLayer, entry: MarkerEntry) {
  const truckId = entry.entry.truck.id;
  const el = createMarkerElement(entry.status);
  const marker = new maplibregl.Marker({ element: el }).setLngLat(lngLatOf(entry)).addTo(map);
  layer.live.set(truckId, { marker, entry });

  el.addEventListener("click", (event) => {
    event.stopPropagation(); // keep closeOnClick from closing the new popup
    closeOpenPopup(layer);

    const content = document.createElement("div");
    const root = createRoot(content);
    const popup = new maplibregl.Popup({ closeButton: false, closeOnClick: true });
    const open: OpenPopup = { truckId, popup, root };
    popup.on("close", () => {
      if (layer.open === open) layer.open = null;
      // Deferred: a synchronous unmount inside the popup's own React event warns.
      queueMicrotask(() => root.unmount());
    });
    layer.open = open;
    renderOpenPopup(layer, { sync: true });
    popup.setDOMContent(content).addTo(map);
  });
}

// Initialises MapLibre + PMTiles on the given container and keeps one marker per entry
// of `markers` on it, changing only the markers `diffMarkers` names (CLAUDE.md, UI Rules).
export function useMapLibre(
  containerRef: RefObject<HTMLDivElement | null>,
  markers: ReadonlyMap<TruckId, MarkerEntry>,
  now: Date,
) {
  const layerRef = useRef<MarkerLayer>({ map: null, live: new Map(), open: null, now });

  // Declared first: React runs a component's effects in declaration order, so in any
  // commit that (re)builds the map, the marker effect below already sees it. The map
  // lives in the ref, so that effect reads the current map, never one a render captured
  // before a cleanup removed it.
  useEffect(() => {
    const layer = layerRef.current;
    if (!containerRef.current || !PMTILES_URL) return;

    if (!mapLibreInitialised) {
      maplibregl.setWorkerUrl(workerUrl(maplibregl.getVersion()));
      maplibregl.addProtocol("pmtiles", new Protocol().tile);
      mapLibreInitialised = true;
    }

    layer.map = new maplibregl.Map({
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

    // Emptying `live` makes a rebuilt map (StrictMode's mount → cleanup → mount in dev)
    // diff from empty and get every marker.
    return () => {
      closeOpenPopup(layer);
      for (const { marker } of layer.live.values()) marker.remove();
      layer.live.clear();
      layer.map?.remove();
      layer.map = null;
    };
  }, [containerRef]);

  useEffect(() => {
    const layer = layerRef.current;
    const map = layer.map;
    if (!map) return;

    const shown = new Map([...layer.live].map(([truckId, live]) => [truckId, live.entry]));
    const { add, update, remove } = diffMarkers(shown, markers);

    for (const entry of add) addMarker(map, layer, entry);
    for (const entry of update) {
      const live = layer.live.get(entry.entry.truck.id);
      if (!live) continue;
      live.entry = entry;
      live.marker.setLngLat(lngLatOf(entry));
      styleMarkerElement(live.marker.getElement(), entry.status);
    }
    for (const truckId of remove) {
      if (layer.open?.truckId === truckId) closeOpenPopup(layer);
      layer.live.get(truckId)?.marker.remove();
      layer.live.delete(truckId);
    }

    // In the same pass as the update, so the popup moves and re-renders with its marker.
    const openTruck = layer.open?.truckId;
    if (update.some((entry) => entry.entry.truck.id === openTruck)) renderOpenPopup(layer);
  }, [markers]);

  // The open popup's status, hours and freshness text follow the tick (e.g. across
  // Stockholm midnight). `diffMarkers` doesn't take `now`.
  useEffect(() => {
    const layer = layerRef.current;
    layer.now = now;
    renderOpenPopup(layer);
  }, [now]);
}
