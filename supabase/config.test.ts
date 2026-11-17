import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Auth settings that guard the admin account, which the repo holds only in this folder's
// `config.toml`, so a test keeps them on locally (the preview's and production's are set in
// each project's dashboard and checked by the hosted-settings checklist).
//
// No TOML parser. A table is read as `scripts/ci-advisor.test.mjs` reads one: the lines
// after its `[name]` header, up to the next line that starts with `[` or the end of the
// file, the header found by comparing names, with no RegExp built from one (CodeQL alert
// #4, IS #328). A setting is the first `key = value` line of the table, the value up to
// whitespace or a TOML inline comment (`key = true  # why`). Lines split on `\r?\n`, so a
// CRLF working copy reads the same.
const config = readFileSync(new URL("./config.toml", import.meta.url), "utf8");

const HEADER = /^\[([^\]]+)\]\s*$/;
const TABLE_START = /^\[/;
const SETTING = /^([A-Za-z0-9_]+)\s*=\s*([^\s#]+)/;

function table(name: string): string[] {
  const lines = config.split(/\r?\n/);
  const start = lines.findIndex((line) => HEADER.exec(line)?.[1] === name);
  if (start === -1) throw new Error(`config.toml has no [${name}] table`);
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => TABLE_START.test(line));
  return end === -1 ? rest : rest.slice(0, end);
}

function setting(name: string, key: string): string | undefined {
  for (const line of table(name)) {
    const match = SETTING.exec(line);
    if (match?.[1] === key) return match[2];
  }
  return undefined;
}

describe("supabase/config.toml's Auth guards", () => {
  // A stolen session over 24 hours old can't set a password (CLAUDE.md, "Supabase").
  it("keeps secure_password_change on", () => {
    expect(setting("auth.email", "secure_password_change")).toBe("true");
  });

  // The admin is told when a password is set (CLAUDE.md, "Supabase").
  it("keeps the password-changed email on", () => {
    expect(setting("auth.email.notification.password_changed", "enabled")).toBe("true");
  });
});
