"use client";

// `/map`'s error page: an error thrown while the page renders or starts its map, other than a
// browser without WebGL2 (`createBaseMap`'s `NO_WEBGL2`, a notice on the map instead). Next's
// `error.js` convention (node_modules/next/dist/docs, `error.md`, 16.4): a Client Component
// wrapping the segment's page; `retry` re-fetches and re-renders it. Same look as the map's
// status notice (`MapClient`).
export default function MapError({ retry }: { retry: () => void }) {
  return (
    <div className="flex h-screen w-full items-start justify-center px-4 pt-4">
      <div role="alert" className="rounded-md bg-white px-3 py-2 text-center text-sm text-gray-900 shadow">
        <p>Något gick fel, och kartan kan inte visas just nu.</p>
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
