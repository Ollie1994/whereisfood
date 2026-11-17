import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Auth settings that guard the admin account and live only in `supabase/config.toml`, so a
// test keeps them on locally (the preview's and production's are the hosted-settings
// checklist's). No TOML parser: one table's body is read from its header to the next
// header, as `src/lib/db/complete.test.ts` reads `[api]`. Line endings are normalised first,
// since the working copy may hold CRLF.
const config = readFileSync(new URL("../../supabase/config.toml", import.meta.url), "utf8").replace(/\r\n/g, "\n");

function table(name: string): string {
  const escaped = name.replace(/[.[\]]/g, "\\$&");
  const match = new RegExp(`^\\[${escaped}\\][ \\t]*$([\\s\\S]*?)(?=^\\[|(?![\\s\\S]))`, "m").exec(config);
  if (!match) throw new Error(`config.toml has no [${name}] table`);
  return match[1];
}

function setting(name: string, key: string): string | undefined {
  return new RegExp(`^${key}\\s*=\\s*(\\S+)\\s*$`, "m").exec(table(name))?.[1];
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
