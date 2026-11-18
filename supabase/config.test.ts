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

  // One factor per user, so a stolen session can't add a second (Phase 9 plan #13, IS
  // #381). `helpers.test.ts` shows Auth refusing the second; this keeps the setting in the
  // file.
  it("keeps one MFA factor per user", () => {
    expect(setting("auth.mfa", "max_enrolled_factors")).toBe("1");
  });

  it("keeps TOTP enroll and verify on", () => {
    expect(setting("auth.mfa.totp", "enroll_enabled")).toBe("true");
    expect(setting("auth.mfa.totp", "verify_enabled")).toBe("true");
  });

  // The integration fixtures wait this long between two links to one user
  // (`tests/integration/helpers.ts`'s `LINK_INTERVAL_MS`, 1.1 s): a longer interval
  // refuses their second link, so a change here changes that constant too (IS #381).
  it("keeps the email link interval at 1 s", () => {
    expect(setting("auth.email", "max_frequency")).toBe('"1s"');
  });

  // The emailed code no one types, which Auth still accepts: 10 digits and 15 minutes, the
  // owner's values, with the odds they give in the plan's open decision 1 (IS #386).
  it("keeps the email OTP at 10 digits and 15 minutes", () => {
    expect(setting("auth.email", "otp_length")).toBe("10");
    expect(setting("auth.email", "otp_expiry")).toBe("900");
  });

  // The admin is told when a factor is added or removed, the swap #13 can only detect.
  it("keeps the factor-enrolled and factor-unenrolled emails on", () => {
    expect(setting("auth.email.notification.mfa_factor_enrolled", "enabled")).toBe("true");
    expect(setting("auth.email.notification.mfa_factor_unenrolled", "enabled")).toBe("true");
  });
});
