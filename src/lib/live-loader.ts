import { isLiveResponse, type LiveEntry } from "@/lib/live";

export type FetchLike = (url: string, init: { signal: AbortSignal }) => Promise<Response>;

export type LiveLoader = {
  // Starts a request to `/api/live`, aborting the one in flight. Resolves when this
  // request has applied its outcome or been superseded.
  load(): Promise<void>;
  // Aborts the request in flight; no callback runs after this.
  dispose(): void;
};

// The fetch side of `useLocations`, without React, so its rules are unit-tested
// (`live-loader.test.ts`):
// - Only the newest request may apply its outcome. A superseded or disposed request is
//   neither a result nor a failure, whatever it resolves or rejects with.
// - A failure is a rejected `fetch`, a non-2xx status (the route's 500 `{ error }` is
//   never an empty list, CLAUDE.md "/api/live"), a body `res.json()` can't parse, one
//   `isLiveResponse` rejects, or no answer within `timeoutMs`.
export function createLiveLoader({
  fetch,
  timeoutMs,
  onEntries,
  onFailure,
}: {
  fetch: FetchLike;
  timeoutMs: number;
  onEntries: (entries: LiveEntry[]) => void;
  onFailure: (error: unknown) => void;
}): LiveLoader {
  let disposed = false;
  let inFlight: AbortController | null = null;

  async function load() {
    inFlight?.abort();
    const request = new AbortController();
    inFlight = request;
    const isCurrent = () => !disposed && inFlight === request;
    // A timeout aborts the request too, but it is still the newest, so it fails.
    const timeout = setTimeout(() => request.abort(), timeoutMs);
    try {
      const res = await fetch("/api/live", { signal: request.signal });
      if (!res.ok) throw new Error(`/api/live answered ${res.status}`);
      const body: unknown = await res.json();
      if (!isLiveResponse(body)) throw new Error("/api/live's body fails isLiveResponse");
      if (isCurrent()) onEntries(body.entries);
    } catch (error) {
      if (isCurrent()) onFailure(error);
    } finally {
      clearTimeout(timeout);
    }
  }

  return {
    load,
    dispose() {
      disposed = true;
      inFlight?.abort();
    },
  };
}
