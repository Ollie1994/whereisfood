import type { Truck } from "@/lib/types";

// The admin screen's requests to its own API routes (`CLAUDE.md`, "Supabase": the browser
// reads and writes only through them). Same origin, so the session cookies go along, and
// a write carries the `Origin` header `withAdmin` checks (Phase 7 plan, #16).

// A refusal carries the route's status, so a caller can tell "gone" (404) from the rest;
// a failed request or an unreadable 2xx has none.
export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: string; status?: number };

export const API_ERRORS = {
  network: "Det gick inte att nå servern. Försök igen.",
  unknown: "Något gick fel. Försök igen.",
} as const;

// Whether a write's answer may have left the screen's list behind, so it is read again (IS
// #272, #275): after any answer but a session refusal (401, 403), whose reads would be
// refused the same way. A 404 or 409 is about a row the screen may not show; a 400 can come
// from a row another tab changed (an edit's times out of order, an entry ended, a truck set
// inactive); an answer with no status (a failed request, or a 2xx this couldn't read) or a
// 5xx may follow a write that committed. The entries form, the trucks form and a checklist ✓
// read by it.
export function mayHaveChanged(result: { ok: true } | { ok: false; status?: number }): boolean {
  return result.ok || (result.status !== 401 && result.status !== 403);
}

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
  return { ok: false, error: typeof error === "string" ? error : API_ERRORS.unknown, status: response.status };
}

// A list under `key` in a route's answer, checked to be an array: `adminFetch` types its
// data but can't check it. A plain async function, so a hook's effect only starts it and
// sets state in its callback, not in the effect's body (`react-hooks/set-state-in-effect`).
export async function adminList<T>(path: string, key: string): Promise<ApiResult<T[]>> {
  const result = await adminFetch<Record<string, unknown>>(path);
  if (!result.ok) return result;
  const list = result.data[key];
  return Array.isArray(list) ? { ok: true, data: list as T[] } : { ok: false, error: API_ERRORS.unknown };
}

// Every truck, inactive ones included: the entries screen's form and the trucks screen.
export const fetchTrucks = () => adminList<Truck>("/api/admin/trucks", "trucks");
