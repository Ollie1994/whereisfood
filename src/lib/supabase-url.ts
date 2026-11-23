// `NEXT_PUBLIC_SUPABASE_URL`, checked before a client is made from it. The three clients
// (`supabase.ts`, `supabase-browser.ts`, `supabase-session.ts`) call it.
//
// The URL must be the project URL alone, `https://<ref>.supabase.co` (a trailing `/` is
// harmless). supabase-js 2.106.2 builds its endpoints relative to it, `new URL("rest/v1",
// baseUrl)` and `"auth/v1"` (`dist/index.cjs`), so a path in it is kept in front of theirs.
// Production's first build (IS #463, PR #494) had `/rest/v1/` copied in from the Data API
// page's "API URL": the build passed and `/api/live` answered 500, Vercel's log reading
// `PGRST125`, "Invalid path specified in request URL". `supabase.ts` calls this at import,
// which `next build` runs while collecting page data, so such a URL now fails the build
// (IS #497's PR has the build's output).
//
// A URL `new URL` can't parse throws its own `TypeError` here; supabase-js refuses one too.
export function supabaseProjectUrl(value: string | undefined): string {
  if (!value) throw new Error("Missing env: NEXT_PUBLIC_SUPABASE_URL");
  const { pathname } = new URL(value);
  if (pathname !== "/") {
    throw new Error(
      `Bad env: NEXT_PUBLIC_SUPABASE_URL has the path "${pathname}"; it must be the project URL alone, https://<ref>.supabase.co`,
    );
  }
  return value;
}
