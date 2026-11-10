// Namespace import: MapLibre 6 is ESM-only and has no default export.
import * as maplibregl from "maplibre-gl";
import { Protocol } from "pmtiles";
import { BASEMAP_SOURCE, SPRITE_URL, basemapLayers } from "@/lib/basemap";
import { workerUrl } from "@/lib/maplibre-worker.mjs";

// The basemap's setup, shared by the public map (`useMapLibre`) and the admin's place picker
// (`usePickerMap`), apart from either, so the picker's lazily loaded chunk doesn't carry the
// public map's code. Browser-only: it registers MapLibre's worker and protocol.

const GOTHENBURG: [number, number] = [11.9746, 57.7089];
const PMTILES_URL = process.env.NEXT_PUBLIC_PMTILES_URL;

// Registered once on the client, lazily in the first `createBaseMap` (never on the server):
// the `pmtiles://` protocol, and MapLibre 6's worker URL.
//
// The worker is a separate file in v6, and it imports a shared chunk. Both are served
// from `public/maplibre/<version>/`, copied from node_modules by
// `scripts/copy-maplibre-worker.mjs`. Where, why versioned, and why MapLibre's
// documented Turbopack form does NOT work here: `src/lib/maplibre-worker.mjs`.
let mapLibreInitialised = false;

// The basemap on `container`, opening on `view` (Gothenburg at zoom 13 by default), or null
// with no tiles URL. Call it from an effect: the registration above is client-only.
export function createBaseMap(
  container: HTMLElement,
  view: { center: [number, number]; zoom: number } = { center: GOTHENBURG, zoom: 13 },
): maplibregl.Map | null {
  if (!PMTILES_URL) return null;

  if (!mapLibreInitialised) {
    maplibregl.setWorkerUrl(workerUrl(maplibregl.getVersion()));
    maplibregl.addProtocol("pmtiles", new Protocol().tile);
    mapLibreInitialised = true;
  }

  return new maplibregl.Map({
    container,
    center: view.center,
    zoom: view.zoom,
    style: {
      version: 8,
      glyphs:
        "https://protomaps.github.io/basemaps-assets/fonts/{fontstack}/{range}.pbf",
      sprite: SPRITE_URL,
      sources: {
        [BASEMAP_SOURCE]: {
          type: "vector",
          url: `pmtiles://${PMTILES_URL}`,
          attribution:
            '<a href="https://protomaps.com">Protomaps</a> © <a href="https://openstreetmap.org">OpenStreetMap</a>',
        },
      },
      layers: basemapLayers(),
    },
  });
}
