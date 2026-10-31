import { afterEach, describe, expect, it, vi } from "vitest";
import type { LiveEntry } from "@/lib/live";
import { createLiveLoader, type FetchLike } from "@/lib/live-loader";

const TIMEOUT_MS = 15_000;

const ENTRY: LiveEntry = {
  id: "entry-1",
  truck: { id: "truck-1", name: "Tacobilen", instagram_handle: null, cuisine_type: null },
  latitude: 57.6997,
  longitude: 11.9515,
  label: null,
  starts_at: "2026-10-31T10:00:00+00:00",
  ends_at: "2026-10-31T13:00:00+00:00",
  updated_at: "2026-10-31T08:12:00.123456+00:00",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

// A request that settles only when the test says so, or rejects with an AbortError when
// its signal aborts, as `fetch` does.
function pendingRequest() {
  let settle!: (res: Response) => void;
  let signal!: AbortSignal;
  const fetch: FetchLike = (_url, init) =>
    new Promise((resolve, reject) => {
      signal = init.signal;
      settle = resolve;
      init.signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
    });
  return { fetch, settle: (res: Response) => settle(res), signal: () => signal };
}

function setup(fetch: FetchLike) {
  const onEntries = vi.fn();
  const onFailure = vi.fn();
  const loader = createLiveLoader({ fetch, timeoutMs: TIMEOUT_MS, onEntries, onFailure });
  return { loader, onEntries, onFailure };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("createLiveLoader", () => {
  it("requests /api/live and passes a good body's entries on", async () => {
    const fetch = vi.fn<FetchLike>(async () => json({ entries: [ENTRY] }));
    const { loader, onEntries, onFailure } = setup(fetch);

    await loader.load();

    expect(fetch).toHaveBeenCalledWith("/api/live", expect.objectContaining({ signal: expect.any(AbortSignal) }));
    expect(onEntries).toHaveBeenCalledExactlyOnceWith([ENTRY]);
    expect(onFailure).not.toHaveBeenCalled();
  });

  it.each([
    ["a rejected fetch", async () => Promise.reject(new TypeError("network down"))],
    ["the route's 500 { error }", async () => json({ error: "Internal server error" }, 500)],
    ["a non-2xx whose body would pass the guard", async () => json({ entries: [] }, 503)],
    ["a body that isn't JSON", async () => new Response("<html>", { status: 200 })],
    ["a body isLiveResponse rejects", async () => json({ entries: [{ ...ENTRY, latitude: 95 }] })],
  ] as const)("fails on %s, and passes no entries on", async (_name, respond) => {
    const { loader, onEntries, onFailure } = setup(respond);

    await loader.load();

    expect(onFailure).toHaveBeenCalledTimes(1);
    expect(onEntries).not.toHaveBeenCalled();
  });

  it("fails a request with no answer within the timeout, and aborts it", async () => {
    vi.useFakeTimers();
    const hanging = pendingRequest();
    const { loader, onEntries, onFailure } = setup(hanging.fetch);

    const done = loader.load();
    await vi.advanceTimersByTimeAsync(TIMEOUT_MS - 1);
    expect(onFailure).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    await done;

    expect(hanging.signal().aborted).toBe(true);
    expect(onFailure).toHaveBeenCalledTimes(1);
    expect(onEntries).not.toHaveBeenCalled();
  });

  it("doesn't fail a request answered in time once the timeout would have passed", async () => {
    vi.useFakeTimers();
    const { loader, onEntries, onFailure } = setup(async () => json({ entries: [] }));

    await loader.load();
    await vi.advanceTimersByTimeAsync(TIMEOUT_MS * 2);

    expect(onEntries).toHaveBeenCalledExactlyOnceWith([]);
    expect(onFailure).not.toHaveBeenCalled();
  });

  it("aborts a superseded request and applies neither its result nor its failure", async () => {
    const first = pendingRequest();
    let call = 0;
    const fetch: FetchLike = (url, init) =>
      ++call === 1 ? first.fetch(url, init) : Promise.resolve(json({ entries: [ENTRY] }));
    const { loader, onEntries, onFailure } = setup(fetch);

    const firstDone = loader.load();
    await loader.load();
    await firstDone;

    expect(first.signal().aborted).toBe(true);
    expect(onEntries).toHaveBeenCalledExactlyOnceWith([ENTRY]);
    expect(onFailure).not.toHaveBeenCalled();
  });

  it("ignores a superseded request that resolves anyway, after the newer one", async () => {
    // A fetch that ignores its signal, so the older body arrives last.
    let releaseOld!: () => void;
    let call = 0;
    const fetch: FetchLike = () =>
      ++call === 1
        ? new Promise((resolve) => (releaseOld = () => resolve(json({ entries: [] }))))
        : Promise.resolve(json({ entries: [ENTRY] }));
    const { loader, onEntries, onFailure } = setup(fetch);

    const oldDone = loader.load();
    await loader.load();
    releaseOld();
    await oldDone;

    expect(onEntries).toHaveBeenCalledExactlyOnceWith([ENTRY]);
    expect(onFailure).not.toHaveBeenCalled();
  });

  it("after dispose, aborts the request in flight and calls nothing", async () => {
    const pending = pendingRequest();
    const { loader, onEntries, onFailure } = setup(pending.fetch);

    const done = loader.load();
    loader.dispose();
    await done;

    expect(pending.signal().aborted).toBe(true);
    expect(onEntries).not.toHaveBeenCalled();
    expect(onFailure).not.toHaveBeenCalled();
  });
});
