import { useEffect, useMemo, useState } from "react";
import { isLiveResponse, markerFor, type LiveEntry, type MarkerEntry } from "@/lib/live";

const POLL_MS = 60_000;
const TICK_MS = 30_000;

export type FetchState = "loading" | "ok" | "failing";

// The map's data from `/api/live` (Phase 6 plan, "Functions and types"): fetched on
// mount, every 60 s while the tab is visible, and at once when it becomes visible again.
// `markers` is re-derived from the last good entries on every 30 s tick, so an entry
// whose `ends_at` passes leaves the map even while polls fail.
export function useLocations(): {
  markers: Map<string, MarkerEntry>;
  now: Date;
  fetchState: FetchState;
} {
  const [entries, setEntries] = useState<LiveEntry[]>([]);
  const [fetchState, setFetchState] = useState<FetchState>("loading");
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    let inFlight: AbortController | null = null;
    let poll: ReturnType<typeof setInterval> | undefined;

    // Starting a fetch aborts the one in flight, so only the newest can apply its result.
    // An abort is neither a result nor a failure: it changes nothing.
    async function load() {
      inFlight?.abort();
      const request = new AbortController();
      inFlight = request;
      try {
        const res = await fetch("/api/live", { signal: request.signal });
        // A 500 is the route's `{ error }`, never an empty list (CLAUDE.md, "/api/live").
        if (!res.ok) throw new Error(`/api/live answered ${res.status}`);
        const body: unknown = await res.json();
        if (!isLiveResponse(body)) throw new Error("/api/live's body fails isLiveResponse");
        if (request.signal.aborted) return;
        setEntries(body.entries);
        setFetchState("ok");
      } catch (error) {
        if (request.signal.aborted) return;
        // Plan #16: the last good entries stay; only the state says the data is old.
        console.warn("[live] poll failed:", error);
        setFetchState("failing");
      }
    }

    function startPolling() {
      if (poll === undefined) poll = setInterval(load, POLL_MS);
    }

    function stopPolling() {
      clearInterval(poll);
      poll = undefined;
    }

    function onVisibilityChange() {
      if (document.visibilityState === "visible") {
        setNow(new Date());
        load();
        startPolling();
      } else {
        stopPolling();
      }
    }

    load();
    if (document.visibilityState === "visible") startPolling();
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      stopPolling();
      inFlight?.abort();
    };
  }, []);

  useEffect(() => {
    const tick = setInterval(() => setNow(new Date()), TICK_MS);
    return () => clearInterval(tick);
  }, []);

  // `markerFor` applies `todaysEntries` itself, so tomorrow's entries in the response
  // never show (PR #190).
  const markers = useMemo(() => markerFor(entries, now), [entries, now]);

  return { markers, now, fetchState };
}
