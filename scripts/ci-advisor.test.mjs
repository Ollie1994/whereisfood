// ci.yml's "Security advisor" step copies two values from supabase/config.toml into its
// --db-url: the [db] port and the [api] schemas, which it passes as pgrst.db_schemas
// (IS #290's PR). A port with no database on it fails the step: port 54399 gave
// LegacyDbConnectError, exit 1 (round 2 on PR #322). A schema list that drifts doesn't:
// the advisor's API-facing lints then skip the schema left out, and the step stays green.
// This test turns either drift red. It checks that copy only, not the step's other flags
// (`--fail-on warn`, `--type security`) or its `if:`.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

// One table of config.toml: from its header to the next table header of any kind
// ([db.pooler] included), as complete.test.ts reads [api].
function table(config, name) {
  const escaped = name.replace(/[.[\]]/g, "\\$&");
  const match = new RegExp(`^\\[${escaped}\\]\\s*$([\\s\\S]*?)(?=^\\[)`, "m").exec(config);
  expect(match, `config.toml has no [${name}] table`).not.toBeNull();
  return match[1];
}

// The --db-url in the "Security advisor" step's own lines: from its `- name:` line to the
// next line indented no deeper (the next step or job), comment lines skipped. So another
// job's --db-url, a comment quoting the flag, or the step's `run:` on one line don't
// change what's read.
function advisorUrl() {
  const lines = read(".github/workflows/ci.yml").split(/\r?\n/);
  const starts = lines.flatMap((line, i) => (/^\s*- name: Security advisor\s*$/.test(line) ? [i] : []));
  expect(starts, 'ci.yml should hold exactly one "Security advisor" step').toHaveLength(1);
  const indent = lines[starts[0]].search(/\S/);
  const step = [];
  for (const line of lines.slice(starts[0] + 1)) {
    if (line.trim() !== "" && line.search(/\S/) <= indent) break;
    if (!line.trim().startsWith("#")) step.push(line);
  }
  const urls = [...step.join("\n").matchAll(/--db-url "([^"]*)"/g)];
  expect(urls, "the step should hold exactly one --db-url").toHaveLength(1);
  return new URL(urls[0][1]);
}

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

    const options = advisorUrl().searchParams.get("options");
    // Other `-c` settings may sit beside it.
    const setting = /(?:^|\s)-c pgrst\.db_schemas=(\S+)/.exec(options ?? "");
    expect(setting, `options should set "-c pgrst.db_schemas=…", got ${options}`).not.toBeNull();
    expect(setting[1].split(",")).toEqual(schemas);
  });
});
