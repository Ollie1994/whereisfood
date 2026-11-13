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
});

describe("envLocalText", () => {
  it("maps the status and .env.example as README's table does", () => {
    expect(envLocalText(STATUS, EXAMPLE)).toBe(
      [
        "NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321",
        "NEXT_PUBLIC_SUPABASE_ANON_KEY=anon-placeholder",
        "SUPABASE_SERVICE_ROLE_KEY=service-placeholder",
        "NEXT_PUBLIC_PMTILES_URL=/gothenburg.pmtiles",
        "",
      ].join("\n"),
    );
  });

  it.each(["API_URL", "ANON_KEY", "SERVICE_ROLE_KEY"])("throws without the status's %s, naming only it", (key) => {
    const status = STATUS.split("\n").filter((line) => !line.startsWith(`${key}=`)).join("\n");
    expect(() => envLocalText(status, EXAMPLE)).toThrow(`missing or empty: ${key} (from supabase status)`);
    let message = "";
    try {
      envLocalText(status, EXAMPLE);
    } catch (err) {
      message = err.message;
    }
    expect(message.split(", ")).toHaveLength(1);
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

  it("names every missing value at once", () => {
    expect(() => envLocalText("", "")).toThrow(/API_URL.*ANON_KEY.*SERVICE_ROLE_KEY.*NEXT_PUBLIC_PMTILES_URL/);
  });
});
