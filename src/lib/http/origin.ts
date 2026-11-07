// The origin the browser used, for same-origin checks and for redirects (Phase 7 plan,
// #16). Read from the headers, never `request.url`: under `next dev`, a POST to
// `http://127.0.0.1:3917` read `http://localhost:3917` from `request.url` and
// `request.nextUrl.origin`, while `Host`, `x-forwarded-host` and `Origin` held
// `127.0.0.1:3917` (probed 2026-11-05 with a throwaway route).
//
// A header may hold a list (`a, b`) when proxies chain; the first entry is the client's.
//
// A limit: the `x-forwarded-*` values are used as the request carries them, so a client
// that sets its own names any host. A browser form can't set either header, so a forged
// cross-site form can't use it. Whether Vercel replaces a client's own values wasn't
// checked.

type HeaderSource = { headers: Headers };

function firstValue(value: string | null): string | null {
  const first = value?.split(",")[0]?.trim();
  return first ? first : null;
}

export function requestOrigin(request: HeaderSource): string {
  const host = firstValue(request.headers.get("x-forwarded-host")) ?? firstValue(request.headers.get("host"));
  if (!host) throw new Error("requestOrigin: the request has no Host header");

  const proto = firstValue(request.headers.get("x-forwarded-proto")) ?? "http";
  return `${proto}://${host}`;
}

// True only when the `Origin` header names the origin the request reached. A missing
// `Origin`, or the literal `null` an opaque origin sends, is false (plan #16).
export function isSameOrigin(request: HeaderSource): boolean {
  const origin = request.headers.get("origin");
  if (!origin || origin === "null") return false;
  return origin === requestOrigin(request);
}
