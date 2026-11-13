import { describe, expect, it } from "vitest";
import { envLocalText, parseEnv } from "./write-env-local.mjs";

// The shape `npx supabase status -o env` prints (CLI 2.109.1): every value quoted, more
// keys than the mapping uses. The values are placeholders, not the CLI's.
const STATUS = [
  'ANON_KEY="anon-placeholder"',
  'API_URL="http://127.0.0.1:54321"',
  'DB_URL="postgresql://placeholder"',
  'SERVICE_ROLE_KEY="service-placeholder"',
].join("\n");

const EXAMPLE = [
  "# a comment",
  "NEXT_PUBLIC_SUPABASE_URL=",
  "NEXT_PUBLIC_PMTILES_URL=/gothenburg.pmtiles",
].join("\r\n");

describe("parseEnv", () => {
  it("reads quoted and unquoted values and skips other lines", () => {
    const values = parseEnv(`${STATUS}\n# x\nnot a line\n${EXAMPLE}`);
    expect(values.get("API_URL")).toBe("http://127.0.0.1:54321");
    expect(values.get("NEXT_PUBLIC_PMTILES_URL")).toBe("/gothenburg.pmtiles");
    expect(values.get("NEXT_PUBLIC_SUPABASE_URL")).toBe("");
    expect(values.has("not a line")).toBe(false);
  });

  it("stops an unquoted value at # and trims it, and keeps # inside quotes", () => {
    const values = parseEnv('A= # note\nB=/x.pmtiles  # note\nC="a#b"');
    expect(values.get("A")).toBe("");
    expect(values.get("B")).toBe("/x.pmtiles");
    expect(values.get("C")).toBe("a#b");
  });

  it("reads lines as setup.ts's loadEnvLocal does: spaces, single quotes, quoted then a comment", () => {
    const values = parseEnv(`D = /d.pmtiles\nE='/e.pmtiles'\nF="v" # set "per deploy"`);
    expect(values.get("D")).toBe("/d.pmtiles");
    expect(values.get("E")).toBe("/e.pmtiles");
    expect(values.get("F")).toBe("v");
  });
});

describe("envLocalText", () => {
  it("maps the status and .env.example as README's table does, each value quoted", () => {
    expect(envLocalText(STATUS, EXAMPLE)).toBe(
      [
        'NEXT_PUBLIC_SUPABASE_URL="http://127.0.0.1:54321"',
        'NEXT_PUBLIC_SUPABASE_ANON_KEY="anon-placeholder"',
        'SUPABASE_SERVICE_ROLE_KEY="service-placeholder"',
        'NEXT_PUBLIC_PMTILES_URL="/gothenburg.pmtiles"',
        "",
      ].join("\n"),
    );
  });

  it("writes values holding #, spaces or an apostrophe so they read back whole", () => {
    for (const value of ["http://x/#a", "a b", " pad ", "it's"]) {
      const status = STATUS.replace('"http://127.0.0.1:54321"', JSON.stringify(value));
      expect(parseEnv(envLocalText(status, EXAMPLE)).get("NEXT_PUBLIC_SUPABASE_URL")).toBe(value);
    }
  });

  it.each(["API_URL", "ANON_KEY", "SERVICE_ROLE_KEY"])("throws without the status's %s, naming only it", (key) => {
    const status = STATUS.split("\n").filter((line) => !line.startsWith(`${key}=`)).join("\n");
    expect(() => envLocalText(status, EXAMPLE)).toThrow(new RegExp(`^${key} \\(from supabase status\\) is missing or empty$`));
  });

  it("treats a tiles line with only a comment as empty", () => {
    expect(() => envLocalText(STATUS, "NEXT_PUBLIC_PMTILES_URL= # set per deploy")).toThrow("NEXT_PUBLIC_PMTILES_URL");
  });

  it("throws on an empty status value", () => {
    expect(() => envLocalText(STATUS.replace('"anon-placeholder"', '""'), EXAMPLE)).toThrow("ANON_KEY");
  });

  it("throws on an empty or missing tiles URL in .env.example", () => {
    expect(() => envLocalText(STATUS, "NEXT_PUBLIC_PMTILES_URL=")).toThrow("NEXT_PUBLIC_PMTILES_URL");
    expect(() => envLocalText(STATUS, "# nothing")).toThrow("NEXT_PUBLIC_PMTILES_URL");
  });

  it("refuses a value holding a double quote, which it can't quote", () => {
    const status = STATUS.replace('API_URL="http://127.0.0.1:54321"', 'API_URL=a"b');
    expect(() => envLocalText(status, EXAMPLE)).toThrow(/^API_URL \(from supabase status\) holds a " or a line break$/);
  });

  it("names every missing value at once", () => {
    expect(() => envLocalText("", "")).toThrow(/API_URL.*ANON_KEY.*SERVICE_ROLE_KEY.*NEXT_PUBLIC_PMTILES_URL/);
  });

  it("names a missing value and an unquotable one in one error", () => {
    const status = STATUS.replace('"anon-placeholder"', '""').replace('API_URL="http://127.0.0.1:54321"', 'API_URL=a"b');
    expect(() => envLocalText(status, EXAMPLE)).toThrow(/API_URL .* holds .*; ANON_KEY .* is missing or empty/);
  });
});
