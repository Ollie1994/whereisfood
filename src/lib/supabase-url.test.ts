import { describe, expect, it } from "vitest";
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

  it("says the variable is missing when it is empty or unset", () => {
    expect(() => supabaseProjectUrl("")).toThrow("Missing env: NEXT_PUBLIC_SUPABASE_URL");
    expect(() => supabaseProjectUrl(undefined)).toThrow("Missing env: NEXT_PUBLIC_SUPABASE_URL");
  });
});
