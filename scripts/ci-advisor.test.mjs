// ci.yml's `integration` job holds the security advisor's database URL in ADVISOR_DB_URL,
// for its self-test and its run (IS #325). The URL copies two values from
// supabase/config.toml: the [db] port and the [api] schemas, which it passes as
// pgrst.db_schemas (IS #290's PR). A port with no database on it fails the step: port 54399
// gave LegacyDbConnectError, exit 1 (round 2 on PR #322). A schema list that drifts
// doesn't: the advisor's API-facing lints then skip the schema left out, and the step
// stays green. This test turns either drift red, and checks that every advisor line in the
// workflow is one command (ADVISOR), so the self-test tests what the run does. It doesn't
// check the steps' `if:` or what the self-test does with the result.
import { readFileSync } from "node:fs";
import yaml from "js-yaml";
import { describe, expect, it } from "vitest";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

// One table of config.toml: the lines after its `[name]` header, up to the next line that
// starts with `[` (a table of any kind, [db.pooler] and [[x]] included) or the end of the
// file. The header is the form complete.test.ts reads [api] in: `[name]` in column 0 with
// nothing after it but spaces; an indented, commented or quoted header isn't found, and
// the test fails with "has no [name] table". It is found by comparing names, with no
// RegExp built from one (CodeQL alert #4, js/incomplete-sanitization, IS #328).
const HEADER = /^\[([^\]]+)\]\s*$/;
const TABLE_START = /^\[/;
function table(config, name) {
  const lines = config.split(/\r?\n/);
  const start = lines.findIndex((line) => HEADER.exec(line)?.[1] === name);
  expect(start, `config.toml has no [${name}] table`).not.toBe(-1);
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => TABLE_START.test(line));
  return (end === -1 ? rest : rest.slice(0, end)).join("\n");
}

const ADVISOR =
  'npx supabase db advisors --type security --level info --fail-on warn --db-url "$ADVISOR_DB_URL"';

const workflow = () => yaml.load(read(".github/workflows/ci.yml"));

function advisorUrl() {
  const url = workflow().jobs.integration.env?.ADVISOR_DB_URL;
  expect(typeof url, "integration's env should set ADVISOR_DB_URL").toBe("string");
  return new URL(url);
}

// Every line of every step's `run` (as YAML gives it to the shell, so a folded block is one
// line) that runs the advisor.
const advisorLines = () =>
  Object.values(workflow().jobs)
    .flatMap((job) => job.steps ?? [])
    .flatMap((step) => (step.run ?? "").split("\n"))
    .filter((line) => line.includes("supabase db advisors"));

// The settings in libpq's `options`, split as the server splits them: on whitespace, each
// `-c name=value`, `-cname=value` or `--name=value`, a dash in a name read as an
// underscore; a setting given twice takes the last value; `\ ` keeps a space inside a
// value, so `-c application_name=x\ -c\ pgrst.db_schemas=g` set no pgrst.db_schemas
// (each probed with PGOPTIONS and `show` on the local database, round 4 on PR #322).
// A backslash or any other word fails the test rather than being guessed at.
function settings(options) {
  expect(options, "options should hold no backslash").not.toMatch(/\\/);
  const words = options.split(/\s+/).filter(Boolean);
  const found = [];
  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    const setting = word === "-c" ? words[++i] : word.startsWith("-c") ? word.slice(2) : word.startsWith("--") ? word.slice(2) : undefined;
    const pair = /^([^=]+)=(.*)$/.exec(setting ?? "");
    expect(pair, `options: can't read "${word}" as a setting`).not.toBeNull();
    found.push([pair[1].replaceAll("-", "_"), pair[2]]);
  }
  return found;
}

describe("table()", () => {
  const CONFIG = [
    "[db]",
    "port = 1",
    "[db.pooler]",
    "port = 2",
    "[api]",
    "nested = [",
    '  ["x"],',
    "]",
    "port = 3",
    "[aXb]",
    "port = 4",
    "[[arr]]",
    "port = 5",
    "  [late]",
    "[last]",
    "port = 6",
  ].join("\n");

  it("stops at the next table, a dotted or array one included", () => {
    expect(table(CONFIG, "db")).toBe("port = 1");
    expect(table(CONFIG, "db.pooler")).toBe("port = 2");
    expect(table(CONFIG, "aXb")).toBe("port = 4");
  });

  it("doesn't stop at an indented line that starts with [", () => {
    expect(table(CONFIG, "api")).toBe('nested = [\n  ["x"],\n]\nport = 3');
  });

  it("reads the last table to the end of the file", () => {
    expect(table(CONFIG, "last")).toBe("port = 6");
  });

  it("finds only an exact `[name]` header in column 0", () => {
    for (const name of ["a.b", "db.pool", "pooler", "arr", "[arr", "late"]) {
      expect(() => table(CONFIG, name), name).toThrow(`config.toml has no [${name}] table`);
    }
  });
});

describe("ci.yml's security advisor URL", () => {
  it("uses config.toml's [db] port", () => {
    const port = /^port\s*=\s*(\d+)\s*$/m.exec(table(read("supabase/config.toml"), "db"));
    expect(port).not.toBeNull();
    expect(advisorUrl().port).toBe(port[1]);
  });

  it("sets pgrst.db_schemas to config.toml's [api] schemas", () => {
    const line = /^schemas\s*=\s*\[([^\]]*)\]\s*$/m.exec(table(read("supabase/config.toml"), "api"));
    expect(line).not.toBeNull();
    const schemas = [...line[1].matchAll(/"([^"]*)"/g)].map((m) => m[1]);
    expect(schemas.length).toBeGreaterThan(0);

    // Other settings may sit beside it; it must be set exactly once.
    const set = settings(advisorUrl().searchParams.get("options") ?? "").filter(([name]) => name === "pgrst.db_schemas");
    expect(set, "options should set pgrst.db_schemas exactly once").toHaveLength(1);
    expect(set[0][1].split(",")).toEqual(schemas);
  });

  it("is one advisor command, in the self-test and the run, with no `#` before it", () => {
    const lines = advisorLines();
    expect(lines, "the self-test's line and the run's").toHaveLength(2);
    for (const line of lines) {
      expect(line).toContain(ADVISOR);
      expect(line.slice(0, line.indexOf(ADVISOR)), line).not.toContain("#");
    }
  });
});
