import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { supabaseProjectUrl } from "./supabase-url";

describe("supabaseProjectUrl", () => {
  it("passes the project URL alone, with or without a trailing slash, unchanged", () => {
    expect(supabaseProjectUrl("https://abcdefghijklmnopqrst.supabase.co")).toBe(
      "https://abcdefghijklmnopqrst.supabase.co",
    );
    expect(supabaseProjectUrl("https://abcdefghijklmnopqrst.supabase.co/")).toBe(
      "https://abcdefghijklmnopqrst.supabase.co/",
    );
    expect(supabaseProjectUrl("http://127.0.0.1:54321")).toBe("http://127.0.0.1:54321");
    expect(supabaseProjectUrl("http://localhost:54321")).toBe("http://localhost:54321");
  });

  // Checked on the trimmed value, as supabase-js does, and returned as given. Written from
  // code points, not as the characters (`CLAUDE.md`, "Invisible characters").
  it("reads past what trim() removes at either end, a byte-order mark or a no-break space", () => {
    const bom = String.fromCodePoint(0xfeff);
    const nbsp = String.fromCodePoint(0xa0);
    const withBom = `${bom}https://abcdefghijklmnopqrst.supabase.co`;
    const withNbsp = `https://abcdefghijklmnopqrst.supabase.co/${nbsp}`;
    expect(supabaseProjectUrl(withBom)).toBe(withBom);
    expect(supabaseProjectUrl(withNbsp)).toBe(withNbsp);
  });

  // supabase-js sends the key in an `apikey` header on every request.
  it("refuses http:// for any host but the local stack's", () => {
    expect(() => supabaseProjectUrl("http://abcdefghijklmnopqrst.supabase.co")).toThrow(
      'Bad env: NEXT_PUBLIC_SUPABASE_URL is http:// for "abcdefghijklmnopqrst.supabase.co"',
    );
  });

  // The value production's first build had (IS #463): the Data API page's "API URL".
  it("refuses a URL with a path, naming the variable and the path", () => {
    expect(() => supabaseProjectUrl("https://abcdefghijklmnopqrst.supabase.co/rest/v1/")).toThrow(
      'Bad env: NEXT_PUBLIC_SUPABASE_URL has the path "/rest/v1/"',
    );
    expect(() => supabaseProjectUrl("https://abcdefghijklmnopqrst.supabase.co/rest/v1")).toThrow(
      'has the path "/rest/v1"',
    );
    expect(() => supabaseProjectUrl("http://127.0.0.1:54321/auth/v1")).toThrow(
      'has the path "/auth/v1"',
    );
  });

  it("refuses a value that isn't an http(s) URL, naming the variable", () => {
    // Each of the first three fails the scheme test. A host pasted without its scheme:
    expect(() => supabaseProjectUrl("abcdefghijklmnopqrst.supabase.co")).toThrow(
      "Bad env: NEXT_PUBLIC_SUPABASE_URL is not an http(s) URL",
    );
    // one `new URL` would read as the scheme `localhost:`:
    expect(() => supabaseProjectUrl("localhost:54321")).toThrow("is not an http(s) URL");
    // another scheme, whose empty path the path check alone would read as `""`.
    expect(() => supabaseProjectUrl("foo://abcdefghijklmnopqrst.supabase.co")).toThrow(
      "is not an http(s) URL",
    );
    // The scheme alone: it passes the scheme test, and `new URL` can't parse it.
    expect(() => supabaseProjectUrl("https://")).toThrow("is not an http(s) URL");
    // `//` dropped: `new URL` reads it as `https://<host>/`, supabase-js refuses it.
    expect(() => supabaseProjectUrl("https:abcdefghijklmnopqrst.supabase.co")).toThrow(
      "is not an http(s) URL",
    );
  });

  it("says the variable is missing when it is empty or unset", () => {
    expect(() => supabaseProjectUrl("")).toThrow("Missing env: NEXT_PUBLIC_SUPABASE_URL");
    expect(() => supabaseProjectUrl(undefined)).toThrow("Missing env: NEXT_PUBLIC_SUPABASE_URL");
  });
});

// That each client calls it: a client reading the variable itself again would let a path
// through, as on #463, with the helper's tests still green.
describe("the three Supabase clients", () => {
  const PATH_URL = "https://abcdefghijklmnopqrst.supabase.co/rest/v1/";

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  function stubEnv(url: string) {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", url);
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "a-publishable-key");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "a-secret-key");
  }

  // Read as text, not imported: `CLAUDE.md` ("Supabase") lets only the db layer and the
  // integration tests import `supabaseAdmin`'s module. `next build` with a `/rest/v1/` URL
  // failed at its call (PR for IS #497).
  it("refuse a URL with a path: supabase.ts reads the variable only through the helper", () => {
    const source = readFileSync(new URL("./supabase.ts", import.meta.url), "utf8");
    expect(source).toContain("supabaseProjectUrl(process.env.NEXT_PUBLIC_SUPABASE_URL)");
    expect(source.split("process.env.NEXT_PUBLIC_SUPABASE_URL").length - 1).toBe(1);
  });

  it("refuse a URL with a path: supabase-browser.ts at import", async () => {
    stubEnv(PATH_URL);
    vi.resetModules();
    await expect(import("./supabase-browser")).rejects.toThrow('has the path "/rest/v1/"');
  });

  it("refuse a URL with a path: supabase-session.ts per call", async () => {
    stubEnv(PATH_URL);
    const { createSessionClient } = await import("./supabase-session");
    expect(() => createSessionClient({ getAll: () => [] })).toThrow('has the path "/rest/v1/"');
  });
});
