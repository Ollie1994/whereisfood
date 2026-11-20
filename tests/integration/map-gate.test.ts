import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { proxy } from "@/proxy";
import { SESSION_COOKIE, SIGN_IN_TIMEOUT, cookieHeader, localSql, resetTables, sessionUser } from "./helpers";

// SOFT-LAUNCH GATE (Phase 10 plan #5): the gate on the local stack, deleted at the full launch
// (the removal list in src/app/map/page.tsx). `MapPage` runs with real sessions against the
// local Auth and database. Stubbed: what a page gets from Next, the request's cookies
// (`next/headers`) and `redirect()` (`next/navigation`), and `MapClient`, which this suite
// doesn't render. The refusal reasons one by one: `src/app/map/page.test.tsx`.

const request = { jar: new Map<string, string>() };
vi.mock("next/headers", () => ({
  cookies: async () => ({ getAll: () => [...request.jar].map(([name, value]) => ({ name, value })) }),
}));

class Redirected extends Error {
  constructor(readonly path: string) {
    super(`redirect to ${path}`);
  }
}
vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw new Redirected(path);
  },
}));

function MapClientStub() {
  return null;
}
vi.mock("@/components/Map/MapClient", () => ({ default: MapClientStub }));

const { default: MapPage } = await import("@/app/map/page");

// `MapPage`'s answer on `jar`'s cookies: what it rendered, or where it redirected.
async function answer(jar: Map<string, string>): Promise<{ rendered: unknown } | { redirected: string }> {
  request.jar = jar;
  try {
    return { rendered: ((await MapPage()) as { type: unknown }).type };
  } catch (err) {
    if (err instanceof Redirected) return { redirected: err.path };
    throw err;
  }
}

// One sign-in per user, in `beforeAll` (`helpers.ts`, `signInByLink`).
const jars = {} as Record<"admin" | "expiring" | "aal1Admin" | "nonAdmin", Map<string, string>>;

beforeAll(async () => {
  await resetTables();
  jars.admin = (await sessionUser({ isAdmin: true, aal2: true })).jar;
  jars.expiring = (await sessionUser({ isAdmin: true, aal2: true })).jar;
  jars.aal1Admin = (await sessionUser({ isAdmin: true })).jar;
  jars.nonAdmin = (await sessionUser({ aal2: true })).jar;
}, 4 * SIGN_IN_TIMEOUT);

afterAll(resetTables);

describe("MapPage on the local stack", () => {
  it("renders MapClient for the admin at aal2", async () => {
    expect(await answer(jars.admin)).toEqual({ rendered: MapClientStub });
  });

  it.each([
    ["no session", () => new Map<string, string>()],
    ["an admin at aal1", () => jars.aal1Admin],
    ["a non-admin at aal2", () => jars.nonAdmin],
  ])("sends %s to /about", async (_, jar) => {
    expect(await answer(jar())).toEqual({ redirected: "/about" });
  });
});

// The session `@supabase/ssr` keeps in `jar`, from its one cookie or its chunks (`.0`, `.1`, …,
// joined in order), as `base64-` and the session's JSON, base64url.
function sessionOf(jar: Map<string, string>): { refresh_token: string; expires_at: number } {
  const names = [...jar.keys()].filter((name) => SESSION_COOKIE.test(name));
  const whole = names.find((name) => !/\.\d+$/.test(name));
  const order = (name: string) => Number(/\.(\d+)$/.exec(name)?.[1]);
  const value = whole ? jar.get(whole)! : names.sort((a, b) => order(a) - order(b)).map((name) => jar.get(name)).join("");
  return JSON.parse(Buffer.from(value.slice("base64-".length), "base64url").toString("utf8"));
}

// A copy of `jar` with its session's `expires_at` set to `seconds`, as one unchunked cookie,
// which `@supabase/ssr` reads before any chunk (`combineChunks`, `utils/chunker.js`). An aal2
// session's cookie came chunked here, which `helpers.ts`'s `editSessionCookie` refuses.
function withExpiresAt(jar: Map<string, string>, seconds: number): Map<string, string> {
  const session = sessionOf(jar);
  session.expires_at = seconds;
  const names = [...jar.keys()].filter((name) => SESSION_COOKIE.test(name));
  const key = names[0].replace(/\.\d+$/, "");
  const copy = new Map([...jar].filter(([name]) => !SESSION_COOKIE.test(name)));
  return copy.set(key, `base64-${Buffer.from(JSON.stringify(session)).toString("base64url")}`);
}

// Plan A's risk (plan #6): with no proxy before it, `MapPage` refreshes an expiring session
// through `readOnlyCookies`, which can't store the result, so the browser presents the used
// refresh token again. IS #448's probe, on the local stack: the cookie's `expires_at` moved into
// the past (auth-js refreshes within 90 s of it), the JWT itself still valid.
describe("an expiring admin session on the gated /map, with no proxy before it", () => {
  it(
    "is admitted on a refresh it can't store, again past refresh_token_reuse_interval, and the proxy then stores one",
    async () => {
      let jar = withExpiresAt(jars.expiring, Math.floor(Date.now() / 1000) - 60);
      const used = sessionOf(jar).refresh_token;
      // Whether Auth holds `used` revoked: rotated by a refresh.
      const revoked = () => localSql(`select revoked from auth.refresh_tokens where token = '${used}'`);
      expect(revoked()).toBe("f");
      expect(await answer(jar)).toEqual({ rendered: MapClientStub });
      // The load refreshed, and the rotated tokens were lost: the jar still holds `used`.
      expect(revoked()).toBe("t");
      expect(sessionOf(jar).refresh_token).toBe(used);

      // Past `config.toml`'s `refresh_token_reuse_interval = 10`.
      await new Promise((resolve) => setTimeout(resolve, 11_000));
      expect(await answer(jar)).toEqual({ rendered: MapClientStub });

      // An admin page through the proxy, which presents the same used token and writes back.
      const response = await proxy(
        new NextRequest("http://127.0.0.1:3000/admin", { headers: { host: "127.0.0.1:3000", cookie: cookieHeader(jar) } }),
      );
      jar = new Map(jar);
      for (const { name, value } of response.cookies.getAll()) {
        if (value === "") jar.delete(name);
        else jar.set(name, value);
      }
      expect(sessionOf(jar).refresh_token).not.toBe(used);
      expect(await answer(jar)).toEqual({ rendered: MapClientStub });
    },
    30_000,
  );
});
