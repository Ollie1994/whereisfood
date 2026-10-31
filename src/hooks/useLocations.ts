import { useEffect, useMemo, useState } from "react";
import { markerFor, type FetchState, type LiveEntry, type MarkerEntry, type TruckId } from "@/lib/live";
import { createLiveLoader } from "@/lib/live-loader";

const POLL_MS = 60_000;
const TICK_MS = 30_000;
// A request still unanswered after this counts as failed, so a hanging connection
// shows the notice instead of leaving the state as it was.
const TIMEOUT_MS = 15_000;

// The map's data from `/api/live` (Phase 6 plan, "Functions and types"): fetched on
// mount, every 60 s while the tab is visible, and at once when it becomes visible again.
// `markers` is re-derived from the last good entries on every 30 s tick, so an entry
// whose `ends_at` passes leaves the map even while polls fail. Both timers stop while
// the tab is hidden; becoming visible fetches. Which requests count, and
// what a failure is: `createLiveLoader`.
export function useLocations(): {
  markers: Map<TruckId, MarkerEntry>;
  now: Date;
  fetchState: FetchState;
} {
  const [entries, setEntries] = useState<LiveEntry[]>([]);
  const [fetchState, setFetchState] = useState<FetchState>("loading");
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const loader = createLiveLoader({
      // The default cache mode. Locally (`next dev`) the browser keeps the route's
      // `stale-while-revalidate=60` and answers a refetch within 60 s from its own
      // cache (probed in Chrome, PR #192); on Vercel the CDN strips `s-maxage` and
      // `stale-while-revalidate` before the browser (Vercel docs, "Vercel CDN Cache",
      // 2026-10-31). `no-store` would send `Cache-Control: no-cache` to the CDN.
      fetch: (url, init) => fetch(url, init),
      timeoutMs: TIMEOUT_MS,
      // Each answer sets `now`, so new data isn't placed with the last tick's clock, and
      // a refocus (below) needs no `now` of its own.
      onEntries(next) {
        setEntries(next);
        setNow(new Date());
        setFetchState("ok");
      },
      onFailure(error) {
        // Plan #16: the last good entries stay; only the state says the data is old.
        console.warn("[live] poll failed:", error);
        setNow(new Date());
        setFetchState("failing");
      },
    });
    let poll: ReturnType<typeof setInterval> | undefined;
    let tick: ReturnType<typeof setInterval> | undefined;

    function startTimers() {
      poll ??= setInterval(() => void loader.load(), POLL_MS);
      tick ??= setInterval(() => setNow(new Date()), TICK_MS);
    }

    function stopTimers() {
      clearInterval(poll);
      clearInterval(tick);
      poll = tick = undefined;
    }

    function onVisibilityChange() {
      if (document.visibilityState === "visible") {
        // Set neither `now` nor `fetchState` here: the map keeps what it showed until
        // this refetch answers. A `now` set here drops entries that ended while hidden
        // before the new data comes, reading as "Inga foodtrucks idag", and `loading`
        // hides open decision 6's notice before a good response (both probed in Chrome,
        // PR #192).
        void loader.load();
        startTimers();
      } else {
        stopTimers();
      }
    }

    void loader.load();
    if (document.visibilityState === "visible") startTimers();
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      stopTimers();
      loader.dispose();
    };
  }, []);

  // `markerFor` applies `todaysEntries` itself, so tomorrow's entries in the response
  // never show (PR #190).
  const markers = useMemo(() => markerFor(entries, now), [entries, now]);

  return { markers, now, fetchState };
}
