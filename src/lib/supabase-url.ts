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
// A value that isn't an `http:` or `https:` URL (a host pasted without its scheme) is refused
// here first, naming the variable, as supabase-js's own `validateSupabaseUrl` would refuse it
// after ("Invalid supabaseUrl: …", `dist/index.cjs`).
const NOT_HTTP =
  "Bad env: NEXT_PUBLIC_SUPABASE_URL is not an http(s) URL; it must be the project URL alone, https://<ref>.supabase.co";

export function supabaseProjectUrl(value: string | undefined): string {
  if (!value) throw new Error("Missing env: NEXT_PUBLIC_SUPABASE_URL");
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(NOT_HTTP);
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error(NOT_HTTP);
  if (url.pathname !== "/") {
    throw new Error(
      `Bad env: NEXT_PUBLIC_SUPABASE_URL has the path "${url.pathname}"; it must be the project URL alone, https://<ref>.supabase.co`,
    );
  }
  return value;
}
