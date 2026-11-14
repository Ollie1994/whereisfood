// ci.yml's "Security advisor" step copies two values from supabase/config.toml into its
// --db-url: the [db] port and the [api] schemas, which it passes as pgrst.db_schemas
// (IS #290's PR). A port that drifts fails the step (no database answers); a schema list
// that drifts doesn't: the advisor's API-facing lints then skip the schema left out, and
// the step stays green. This test turns either drift red.
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

function advisorUrl() {
  const urls = [...read(".github/workflows/ci.yml").matchAll(/--db-url "([^"]*)"/g)];
  expect(urls, "ci.yml should hold exactly one --db-url").toHaveLength(1);
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
    const setting = /^-c pgrst\.db_schemas=(\S+)$/.exec(options ?? "");
    expect(setting, `options should be "-c pgrst.db_schemas=…", got ${options}`).not.toBeNull();
    expect(setting[1].split(",")).toEqual(schemas);
  });
});
