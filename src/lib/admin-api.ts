// The admin screen's requests to its own API routes (`CLAUDE.md`, "Supabase": the browser
// reads and writes only through them). Same origin, so the session cookies go along, and
// a write carries the `Origin` header `withAdmin` checks (Phase 7 plan, #16).

export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: string };

export const API_ERRORS = {
  network: "Det gick inte att nå servern. Försök igen.",
  unknown: "Något gick fel. Försök igen.",
} as const;

export async function adminFetch<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<ApiResult<T>> {
  let response: Response;
  try {
    response = await fetch(path, {
      method: init.method ?? "GET",
      headers: init.body === undefined ? undefined : { "Content-Type": "application/json" },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      cache: "no-store",
    });
  } catch {
    return { ok: false, error: API_ERRORS.network };
  }

  // Every route answers JSON, `{ error }` on a refusal (`CLAUDE.md`, "API responses"). A
  // 2xx whose body didn't parse (a connection cut mid-body, a proxy's page) is an error
  // too, so no caller reads `data` from a null. The callers check the shape they need.
  const json: unknown = await response.json().catch(() => null);
  if (response.ok) {
    return json === null ? { ok: false, error: API_ERRORS.unknown } : { ok: true, data: json as T };
  }
  const error = (json as { error?: unknown } | null)?.error;
  return { ok: false, error: typeof error === "string" ? error : API_ERRORS.unknown };
}

export type Read<T> = { ok: true; data: T } | { ok: false; error: string };

// A list under `key` in a route's answer, checked to be an array: `adminFetch` types its
// data but can't check it. A plain async function, so a hook's effect only starts it and
// sets state in its callback, not in the effect's body (`react-hooks/set-state-in-effect`).
export async function adminList<T>(path: string, key: string): Promise<Read<T[]>> {
  const result = await adminFetch<Record<string, unknown>>(path);
  if (!result.ok) return result;
  const list = result.data[key];
  return Array.isArray(list) ? { ok: true, data: list as T[] } : { ok: false, error: API_ERRORS.unknown };
}
