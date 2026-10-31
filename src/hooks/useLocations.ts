import { useEffect, useMemo, useState } from "react";
import { isLiveResponse, markerFor, type FetchState, type LiveEntry, type MarkerEntry } from "@/lib/live";

const POLL_MS = 60_000;
const TICK_MS = 30_000;
// A request still unanswered after this counts as failed, so a hanging connection
// shows the notice instead of leaving the state as it was.
const TIMEOUT_MS = 15_000;

// The map's data from `/api/live` (Phase 6 plan, "Functions and types"): fetched on
// mount, every 60 s while the tab is visible, and at once when it becomes visible again.
// `markers` is re-derived from the last good entries on every 30 s tick, so an entry
// whose `ends_at` passes leaves the map even while polls fail. Both timers stop while
// the tab is hidden; becoming visible sets `now` and fetches.
export function useLocations(): {
  markers: Map<string, MarkerEntry>;
  now: Date;
  fetchState: FetchState;
} {
  const [entries, setEntries] = useState<LiveEntry[]>([]);
  const [fetchState, setFetchState] = useState<FetchState>("loading");
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    let mounted = true;
    let inFlight: AbortController | null = null;
    let poll: ReturnType<typeof setInterval> | undefined;
    let tick: ReturnType<typeof setInterval> | undefined;

    // Starting a fetch aborts the one in flight, and only the newest may apply its
    // result: a superseded or unmounted request is neither a result nor a failure. A
    // timeout aborts too, but its request is still the newest, so it counts as failed.
    async function load() {
      inFlight?.abort();
      const request = new AbortController();
      inFlight = request;
      const isCurrent = () => mounted && inFlight === request;
      const timeout = setTimeout(() => request.abort(), TIMEOUT_MS);
      try {
        // The default cache mode. Locally (`next dev`) the browser keeps the route's
        // `stale-while-revalidate=60` and answers a refetch within 60 s from its own
        // cache (probed in Chrome, PR #192); on Vercel the CDN strips `s-maxage` and
        // `stale-while-revalidate` before the browser (Vercel docs, "Vercel CDN Cache",
        // 2026-10-31). `no-store` would send `Cache-Control: no-cache` to the CDN.
        const res = await fetch("/api/live", { signal: request.signal });
        // A 500 is the route's `{ error }`, never an empty list (CLAUDE.md, "/api/live").
        if (!res.ok) throw new Error(`/api/live answered ${res.status}`);
        const body: unknown = await res.json();
        if (!isLiveResponse(body)) throw new Error("/api/live's body fails isLiveResponse");
        if (!isCurrent()) return;
        setEntries(body.entries);
        setFetchState("ok");
      } catch (error) {
        if (!isCurrent()) return;
        // Plan #16: the last good entries stay; only the state says the data is old.
        console.warn("[live] poll failed:", error);
        setFetchState("failing");
      } finally {
        clearTimeout(timeout);
      }
    }

    function startTimers() {
      poll ??= setInterval(load, POLL_MS);
      tick ??= setInterval(() => setNow(new Date()), TICK_MS);
    }

    function stopTimers() {
      clearInterval(poll);
      clearInterval(tick);
      poll = tick = undefined;
    }

    function onVisibilityChange() {
      if (document.visibilityState === "visible") {
        setNow(new Date());
        load();
        startTimers();
      } else {
        stopTimers();
      }
    }

    load();
    if (document.visibilityState === "visible") startTimers();
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      mounted = false;
      document.removeEventListener("visibilitychange", onVisibilityChange);
      stopTimers();
      inFlight?.abort();
    };
  }, []);

  // `markerFor` applies `todaysEntries` itself, so tomorrow's entries in the response
  // never show (PR #190).
  const markers = useMemo(() => markerFor(entries, now), [entries, now]);

  return { markers, now, fetchState };
}
