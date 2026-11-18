// The security headers (Phase 9 plan step 9, Q11, IS #387): the static ones every path gets
// from `next.config.ts`'s `headers()`, `/admin` included; the static CSP every path but
// `/admin` gets there; and `/admin`'s nonce CSP, which `src/proxy.ts` sets per request, on
// the request (where Next reads the nonce to put it on its scripts, `content-security-policy.md`
// in `node_modules/next/dist/docs`) and on the answer.
//
// The builders are pure: the caller passes the environment, which both callers read through
// `cspEnv()`, so the two CSPs name the same tiles origin. `next.config.ts` calls it at build
// time and the proxy's bundle has its `NEXT_PUBLIC_*` reads inlined at build time, so both
// CSPs name the origins the build was made with.
//
// The sources, from what the pages load (the plan's open decision 9 records the browser
// checks that ran with them):
// - the tiles: `NEXT_PUBLIC_PMTILES_URL`, fetched with range requests (`map-setup.ts`'s
//   `pmtiles://` protocol). Relative locally (`/gothenburg.pmtiles`, so `'self'`), an R2
//   URL on deploys;
// - the basemap's glyphs and sprite, `BASEMAP_ASSETS` (`map-setup.ts`, `basemap.ts`);
// - MapLibre's worker, served from this origin (`maplibre-worker.mjs`). A worker runs under
//   the CSP of its own script's answer, which is the static CSP here (`/maplibre/…` isn't
//   under `/admin`), so the static CSP's `connect-src` covers its fetches on `/admin` too;
// - Auth: the `/admin` pages call `NEXT_PUBLIC_SUPABASE_URL` from the browser (the login's
//   email step and the TOTP steps, `supabase-browser.ts`). No public page does.
//
// No `upgrade-insecure-requests` (Next's guide has it): it would upgrade the local stack's
// `http://127.0.0.1` requests too, and HSTS with the custom domain is Phase 11's (the plan's
// Out of Scope).

export const BASEMAP_ASSETS = "https://protomaps.github.io";

export type CspEnv = {
  // `NEXT_PUBLIC_PMTILES_URL`; a relative or missing one adds no source.
  tilesUrl?: string;
  // `NEXT_PUBLIC_SUPABASE_URL`, read only by the `/admin` CSP.
  supabaseUrl?: string;
  // `next dev`: React's dev build needs `'unsafe-eval'` and Next's dev styles inline ones
  // (Next's guide, "Development vs Production Considerations").
  dev: boolean;
};

// The environment both CSPs are built from (`next.config.ts`, `src/proxy.ts`).
export function cspEnv(): CspEnv {
  return {
    tilesUrl: process.env.NEXT_PUBLIC_PMTILES_URL,
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
    dev: process.env.NODE_ENV === "development",
  };
}

// Every path, `/admin` included. HSTS is Phase 11's (the custom domain). `geolocation=(self)`:
// the place picker asks for the admin's position (`useGeolocation.ts`).
export const STATIC_HEADERS: ReadonlyArray<{ key: string; value: string }> = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), payment=(), usb=(), geolocation=(self)" },
];

export const CSP_HEADER = "Content-Security-Policy";

// Is `pathname` one the nonce CSP is for: `/admin` or `/admin/…`, the paths `next.config.ts`'s
// `NOT_ADMIN` leaves out (`next.config.test.ts` checks the two agree on lower-case paths; on a
// case variant `/Admin/…` they differ under `next start`, where the proxy doesn't run on it,
// and smoke's `/Admin/login` reads one CSP there, the static one). The proxy passes its
// `nextUrl.pathname`. It also runs on forms its matcher adds or decodes, which `NOT_ADMIN` gives
// the static CSP. On `/admin.json` and `/%61dmin/login` (a 404: Next routes the raw path) the
// proxy then sets none, and the 404 renders. On Vercel `/%41dmin/login` did the same (one static
// CSP, IS #414). Next hands the proxy `/admin.rsc` and
// `/_next/data/<id>/admin.json` already turned into `/admin`, so they get its CSP too: under
// `next start` one, the proxy's, and the data form's 404, with a session, has its scripts
// blocked (PR #411, round 3, probed).
//
// Any case. On Vercel the proxy also runs on `/Admin/…`, and `headers()` leaves it out
// (`caseSensitiveRoutes` isn't honoured there): signed in, `/Admin/trucks` rendered the `/admin`
// 404 under the admin layout with no CSP (the preview, IS #414). Under `next start` the proxy
// doesn't run on a case variant, so `headers()`' static CSP is its one there.
export function isAdminPagePath(pathname: string): boolean {
  const path = pathname.toLowerCase();
  return path === "/admin" || path.startsWith("/admin/");
}

// An absolute URL's origin; null for a relative or missing one, which `'self'` covers or
// which the page doesn't load.
function originOf(url: string | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

function policy(directives: Array<[string, Array<string | null>]>): string {
  return directives
    .map(([name, sources]) => [name, ...sources.filter((s): s is string => s !== null)].join(" "))
    .join("; ");
}

// The directives both CSPs share: where the map's data and images come from, and what no
// page here uses (plugins, being framed, a `<base>`, forms to another origin).
function shared(env: CspEnv, connect: Array<string | null>): Array<[string, Array<string | null>]> {
  return [
    ["img-src", ["'self'", "data:", "blob:", BASEMAP_ASSETS]],
    ["font-src", ["'self'"]],
    ["connect-src", ["'self'", ...connect, originOf(env.tilesUrl), BASEMAP_ASSETS]],
    ["worker-src", ["'self'"]],
    ["object-src", ["'none'"]],
    ["form-action", ["'self'"]],
    ["frame-ancestors", ["'none'"]],
  ];
}

// Every path but `/admin`. Static pages carry no nonce, so Next's inline scripts need
// `'unsafe-inline'`; the session cookie's reach on these pages is accepted (plan #6).
export function buildStaticCsp(env: CspEnv): string {
  return policy([
    ["default-src", ["'self'"]],
    ["script-src", ["'self'", "'unsafe-inline'", env.dev ? "'unsafe-eval'" : null]],
    ["style-src", ["'self'", "'unsafe-inline'"]],
    ["base-uri", ["'self'"]],
    ...shared(env, []),
  ]);
}

// `/admin`'s, per request. `'strict-dynamic'` lets the scripts the nonce admits load the
// chunks they need (the place picker's, lazily); `'self'` is ignored where it is understood.
export function buildAdminCsp(nonce: string, env: CspEnv): string {
  return policy([
    ["default-src", ["'self'"]],
    ["script-src", ["'self'", `'nonce-${nonce}'`, "'strict-dynamic'", env.dev ? "'unsafe-eval'" : null]],
    ["style-src", ["'self'", env.dev ? "'unsafe-inline'" : `'nonce-${nonce}'`]],
    ["base-uri", ["'none'"]],
    ...shared(env, [originOf(env.supabaseUrl)]),
  ]);
}
