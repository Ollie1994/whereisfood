import { useEffect, useRef, useState, type RefObject } from "react";
import { createRoot, type Root } from "react-dom/client";
import { flushSync } from "react-dom";
// Namespace import, for the reason `map-setup.ts` gives.
import * as maplibregl from "maplibre-gl";
import TruckPopup from "@/components/Map/TruckPopup";
import {
  changedOffsets,
  diffMarkers,
  fanOffsets,
  statusText,
  type MarkerEntry,
  type PixelOffset,
  type TruckId,
} from "@/lib/live";
import { NO_WEBGL2, createBaseMap } from "@/lib/map-setup";

// Open is filled, later is outlined (plan, open decision 8). The colour and size are
// placeholders until the owner has looked at them on the map.
const MARKER_COLOR = "#16a34a";

type OpenPopup = { truckId: TruckId; popup: maplibregl.Popup; root: Root };

// What the effects and the click handlers share, in one ref. `map` is the map the
// init effect built and hasn't removed. `shown` is the `markers` last applied, and
// `live` holds one `maplibregl.Marker` for each of its trucks. `open` is set exactly
// while a popup is open: its `close` handler clears it, however the popup closed.
// `offsets` is `fanOffsets(shown)`: each live marker's pixel offset, which its popup shares.
type MarkerLayer = {
  map: maplibregl.Map | null;
  live: Map<TruckId, maplibregl.Marker>;
  shown: ReadonlyMap<TruckId, MarkerEntry>;
  offsets: ReadonlyMap<TruckId, PixelOffset>;
  open: OpenPopup | null;
  now: Date;
};

function lngLatOf({ entry }: MarkerEntry): [number, number] {
  return [entry.longitude, entry.latitude];
}

// The look and the accessible name follow the entry: "Burgarbilen, Öppet nu".
function styleMarkerElement(el: HTMLElement, marker: MarkerEntry) {
  const open = marker.status === "open";
  el.style.background = open ? MARKER_COLOR : "#ffffff";
  el.style.border = open ? "2px solid #ffffff" : `3px solid ${MARKER_COLOR}`;
  el.setAttribute("aria-label", `${marker.entry.truck.name}, ${statusText(marker)}`);
}

// A button for keyboards and screen readers: a tab stop, its name from
// `styleMarkerElement`, and Enter or Space opening the popup as a click does (`addMarker`).
// Tab order is the order markers were added, not their place on the map, nor their
// clockwise name order in a fan at a shared spot (`fanOffsets`): a limit, IS #248.
function createMarkerElement(marker: MarkerEntry): HTMLDivElement {
  const el = document.createElement("div");
  el.setAttribute("role", "button");
  el.tabIndex = 0;
  el.style.width = "18px";
  el.style.height = "18px";
  el.style.borderRadius = "50%";
  el.style.boxSizing = "border-box";
  el.style.boxShadow = "0 1px 4px rgba(0, 0, 0, 0.4)";
  el.style.cursor = "pointer";
  styleMarkerElement(el, marker);
  return el;
}

// The only place popup content is rendered: from the open truck's current entry and
// the current `now`, never values captured when the marker was added. `sync` (the click
// handler) renders inside `flushSync`, so the popup measures filled content before
// `addTo`; an effect must not, because `flushSync` inside one logs "flushSync was called
// from inside a lifecycle method" (plan, "Functions and types").
function renderOpenPopup(layer: MarkerLayer, { sync = false } = {}) {
  const open = layer.open;
  const marker = open && layer.shown.get(open.truckId);
  if (!open || !marker) return;

  const popup = <TruckPopup marker={marker} now={layer.now} onClose={() => open.popup.remove()} />;
  if (sync) flushSync(() => open.root.render(popup));
  else open.root.render(popup);
  open.popup.setLngLat(lngLatOf(marker));
}

// `remove()` fires the popup's `close` handler, which clears `layer.open`.
function closeOpenPopup(layer: MarkerLayer) {
  layer.open?.popup.remove();
}

function addMarker(map: maplibregl.Map, layer: MarkerLayer, entry: MarkerEntry, offset: PixelOffset) {
  const truckId = entry.entry.truck.id;
  const el = createMarkerElement(entry);
  const marker = new maplibregl.Marker({ element: el, offset });
  layer.live.set(truckId, marker.setLngLat(lngLatOf(entry)).addTo(map));

  function openPopup() {
    closeOpenPopup(layer);

    const content = document.createElement("div");
    const root = createRoot(content);
    // The marker's offset now, which a sibling joining or leaving may have changed.
    const popup = new maplibregl.Popup({ closeButton: false, closeOnClick: true, offset: marker.getOffset() });
    const open: OpenPopup = { truckId, popup, root };
    popup.on("close", () => {
      if (layer.open === open) layer.open = null;
      // The popup takes focus when it opens (MapLibre's `focusAfterOpen`). `remove()`
      // takes its DOM out before firing `close` (`maplibre-gl-dev.mjs` 6.11.2), so focus
      // that was inside it is on `body` here, and only that goes back to the marker; a
      // tap on the map or a tab elsewhere keeps its focus (probed in Chrome, PR #192).
      if (document.activeElement === document.body && el.isConnected) el.focus({ preventScroll: true });
      // Deferred: a synchronous unmount inside the popup's own React event warns.
      queueMicrotask(() => root.unmount());
    });
    layer.open = open;
    renderOpenPopup(layer, { sync: true });
    popup.setDOMContent(content).addTo(map);
  }

  el.addEventListener("click", (event) => {
    event.stopPropagation(); // keep closeOnClick from closing the new popup
    openPopup();
  });
  // Opened on key-up: the popup moves focus to its "Stäng" button as it opens, so
  // opening on key-down let a held Enter's repeats press that button and close it. Only
  // a key pressed down on this marker counts: Enter on "Stäng" closes the popup and
  // hands focus back here, and that key's key-up must not reopen it. (Both probed in
  // Chrome over CDP, PR #192: each control reproduced its failure.)
  let pressed: string | null = null;
  el.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault(); // Space would scroll the page
    if (!event.repeat) pressed = event.key;
  });
  el.addEventListener("keyup", (event) => {
    if (event.key !== pressed) return;
    pressed = null;
    openPopup();
  });
  el.addEventListener("blur", () => (pressed = null));
}

// Initialises MapLibre + PMTiles on the given container and keeps one marker per entry
// of `markers` on it, changing only the markers `diffMarkers` names and those whose fan
// offset changed at a spot a truck joined or left (CLAUDE.md, UI Rules).
// True when the browser can't draw the map, for `MapClient` to say so.
export function useMapLibre(
  containerRef: RefObject<HTMLDivElement | null>,
  markers: ReadonlyMap<TruckId, MarkerEntry>,
  now: Date,
): boolean {
  // Counts maps built, so the marker effect re-runs after a build whatever order the
  // effects run in. The map itself is only in the ref.
  const [builds, setBuilds] = useState(0);
  const [failed, setFailed] = useState(false);
  const layerRef = useRef<MarkerLayer>({ map: null, live: new Map(), shown: new Map(), offsets: new Map(), open: null, now });

  useEffect(() => {
    const layer = layerRef.current;
    if (!containerRef.current) return;
    const created = createBaseMap(containerRef.current);
    // Each run's own outcome: a dev re-run (StrictMode, Fast Refresh) that builds a map
    // clears an earlier failure.
    setFailed(created === NO_WEBGL2);
    if (!created || created === NO_WEBGL2) return;
    layer.map = created;
    setBuilds((count) => count + 1);

    // Emptying `live` and `shown` makes a rebuilt map (StrictMode's mount → cleanup →
    // mount in dev) diff from empty and get every marker.
    // Markers go before the popup: its `close` handler then finds its marker gone and
    // moves no focus onto it.
    return () => {
      for (const marker of layer.live.values()) marker.remove();
      closeOpenPopup(layer);
      layer.live.clear();
      layer.shown = new Map();
      layer.offsets = new Map();
      layer.map = null;
      created.remove();
    };
  }, [containerRef]);

  // One effect for the markers and the tick, so an open popup renders once per commit,
  // with its truck's new entry and the new `now` together.
  //
  // It draws on `layer.map`, the map the init effect built and hasn't removed, never a
  // map held in state: after a re-init that re-runs both effects, which the Next docs
  // say Fast Refresh does (`node_modules/next/dist/docs/03-architecture/fast-refresh.md`),
  // a render's state could still hold the removed one. Not reproduced here: an applied
  // Fast Refresh edit kept the map (PR #192).
  useEffect(() => {
    const layer = layerRef.current;
    const current = layer.map;
    if (!current) return;
    const nowChanged = layer.now !== now;
    layer.now = now;

    const { add, update, remove } = diffMarkers(layer.shown, markers);
    const prevOffsets = layer.offsets;
    layer.shown = markers;
    // Offsets follow positions and names, which only an add, update or remove changes; a
    // tick alone (a new `markers` map, the same entries) keeps them.
    if (add.length || update.length || remove.length) layer.offsets = fanOffsets(markers);

    // `fanOffsets` keys every truck of `markers`, so each new one has its offset.
    for (const entry of add) addMarker(current, layer, entry, layer.offsets.get(entry.entry.truck.id)!);
    for (const entry of update) {
      const marker = layer.live.get(entry.entry.truck.id);
      marker?.setLngLat(lngLatOf(entry));
      if (marker) styleMarkerElement(marker.getElement(), entry);
    }
    for (const truckId of remove) {
      const marker = layer.live.get(truckId);
      const popup = layer.open?.truckId === truckId ? layer.open.popup : null;
      // Focus on the marker or in its popup would drop to the page when they go, so the
      // map's canvas takes it first (probed in Chrome, PR #192). The marker goes before
      // the popup, so the popup's `close` handler finds it gone and moves no focus onto
      // it, wherever focus was.
      const focused = document.activeElement;
      if (focused && (marker?.getElement().contains(focused) || popup?.getElement()?.contains(focused))) {
        current.getCanvas().focus({ preventScroll: true });
      }
      marker?.remove();
      if (popup) closeOpenPopup(layer);
      layer.live.delete(truckId);
    }

    // A truck joining or leaving a spot moves the others there: only a marker whose offset
    // changed is touched (`changedOffsets`), and an open popup moves with its marker.
    for (const [truckId, offset] of changedOffsets(prevOffsets, layer.offsets)) {
      layer.live.get(truckId)?.setOffset(offset);
      if (layer.open?.truckId === truckId) layer.open.popup.setOffset(offset);
    }

    // The status, hours and freshness text follow the tick (e.g. across Stockholm
    // midnight); an update moves the popup with its marker.
    const openTruck = layer.open?.truckId;
    if (nowChanged || update.some((entry) => entry.entry.truck.id === openTruck)) {
      renderOpenPopup(layer);
    }
  }, [builds, markers, now]);

  return failed;
}
