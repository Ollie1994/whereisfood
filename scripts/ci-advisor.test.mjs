// ci.yml's "Security advisor" step copies two values from supabase/config.toml into its
// --db-url: the [db] port and the [api] schemas, which it passes as pgrst.db_schemas
// (IS #290's PR). A port with no database on it fails the step: port 54399 gave
// LegacyDbConnectError, exit 1 (round 2 on PR #322). A schema list that drifts doesn't:
// the advisor's API-facing lints then skip the schema left out, and the step stays green.
// This test turns either drift red. It checks that copy only, not the step's other flags
// (`--type security`, `--level info`, `--fail-on warn`) or its `if:`.
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

// The step's `run` as YAML gives it to the shell (js-yaml, so a folded `>-` block is
// joined and a `#` line inside it is part of the command, as it is for the runner). The
// URL must be its one double-quoted word, with no `#` outside it, which the shell would
// read as a comment, and no other --db-url.
function advisorUrl() {
  const workflow = yaml.load(read(".github/workflows/ci.yml"));
  const steps = Object.values(workflow.jobs)
    .flatMap((job) => job.steps ?? [])
    .filter((step) => step.name === "Security advisor");
  expect(steps, 'ci.yml should hold exactly one "Security advisor" step').toHaveLength(1);
  const run = steps[0].run;
  const match = /^([^"#]*)--db-url "([^"]*)"([^"#]*)$/.exec(run);
  expect(match, `the step's run should pass one quoted --db-url, no #: ${run}`).not.toBeNull();
  expect(match[1] + match[3]).not.toContain("--db-url");
  return new URL(match[2]);
}

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
});
