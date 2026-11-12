"use client";

import { MAP_NOTICE } from "@/components/Map/styles";

// `/map`'s error page: an error thrown while `/map` renders or in its effects (the map's
// start, a marker update), other than a browser without WebGL2 (`createBaseMap`'s
// `NO_WEBGL2`, a notice on the map instead). Not one inside the popup, which renders in its
// own React root (`useMapLibre`'s `createRoot`). Next's `error.js` convention
// (node_modules/next/dist/docs, `error.md`, 16.4): a Client Component wrapping the
// segment's page; `retry` re-fetches and re-renders it.
//
// A limit: MapLibre cleans up only a throw from its `_setupPainter` (maplibre-gl-dev.mjs
// 6.11.2, 24552–24557). A throw later in its constructor leaves that half-built map, which
// `createBaseMap` never gets to remove, and each "Försök igen" that throws again leaves one
// more.
export default function MapError({ retry }: { retry: () => void }) {
  return (
    <div className="flex h-screen w-full items-start justify-center px-4 pt-4">
      <div className={`${MAP_NOTICE} border border-gray-300`}>
        <p role="alert">Något gick fel, och kartan kan inte visas just nu.</p>
        <button
          type="button"
          onClick={() => retry()}
          className="mt-2 rounded-md border border-gray-300 px-3 py-1 font-medium hover:bg-gray-100"
        >
          Försök igen
        </button>
      </div>
    </div>
  );
}
