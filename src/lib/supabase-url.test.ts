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
    // A host pasted without its scheme: `new URL` can't parse it.
    expect(() => supabaseProjectUrl("abcdefghijklmnopqrst.supabase.co")).toThrow(
      "Bad env: NEXT_PUBLIC_SUPABASE_URL is not an http(s) URL",
    );
    // Parsed, as the scheme `localhost:`, and refused for it.
    expect(() => supabaseProjectUrl("localhost:54321")).toThrow("is not an http(s) URL");
    // Another scheme, whose empty path the path check alone would read as `""`.
    expect(() => supabaseProjectUrl("foo://abcdefghijklmnopqrst.supabase.co")).toThrow(
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

  it("refuse a URL with a path: supabase.ts at import", async () => {
    stubEnv(PATH_URL);
    vi.resetModules();
    await expect(import("./supabase")).rejects.toThrow('has the path "/rest/v1/"');
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
