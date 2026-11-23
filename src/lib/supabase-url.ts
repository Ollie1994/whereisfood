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
// Also refused here, naming the variable:
// - a value that isn't an `http://` or `https://` URL (a host pasted without its scheme), by
//   supabase-js's own `validateSupabaseUrl` test, `/^https?:\/\//i` on the trimmed value,
//   which it would refuse after with "Invalid supabaseUrl: …" (`dist/index.cjs`). The checks
//   read the trimmed value, as supabase-js does;
// - `http://` for any host but the local stack's (`LOCAL_HOSTS`): supabase-js sends the key in an `apikey`
//   header on every request (`dist/index.cjs`), so a hosted project's secret key would go
//   out unencrypted.
//
// A limit: a URL holding a user or password passes, and every request then fails at run time
// (`new Request` refuses such a URL, "Request cannot be constructed from a URL that includes
// credentials", Node 26, PR for IS #497). No dashboard shows one.
const NOT_HTTP =
  "Bad env: NEXT_PUBLIC_SUPABASE_URL is not an http(s) URL; it must be the project URL alone, https://<ref>.supabase.co";

// The local hosts `tests/integration/setup.ts` admits.
const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]"]);

export function supabaseProjectUrl(value: string | undefined): string {
  if (!value) throw new Error("Missing env: NEXT_PUBLIC_SUPABASE_URL");
  const trimmed = value.trim();
  // `https:host` (no `//`), which `new URL` reads as `https://host/`, fails this test too.
  if (!/^https?:\/\//i.test(trimmed)) throw new Error(NOT_HTTP);
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new Error(NOT_HTTP);
  }
  if (url.protocol === "http:" && !LOCAL_HOSTS.has(url.hostname)) {
    throw new Error(
      `Bad env: NEXT_PUBLIC_SUPABASE_URL is http:// for "${url.hostname}"; only the local stack's may be, a hosted project's is https://<ref>.supabase.co`,
    );
  }
  if (url.pathname !== "/") {
    throw new Error(
      `Bad env: NEXT_PUBLIC_SUPABASE_URL has the path "${url.pathname}"; it must be the project URL alone, https://<ref>.supabase.co`,
    );
  }
  return value;
}
