import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { SIGN_IN_TIMEOUT, resetTables, sessionUser } from "./helpers";

// SOFT-LAUNCH GATE (Phase 10 plan #5): the gate on the local stack, deleted at the full launch
// (the removal list in src/app/map/page.tsx). `MapPage` runs with real sessions against the
// local Auth and database; only what a page gets from Next is stubbed: the request's cookies
// (`next/headers`), `redirect()` (`next/navigation`), and `MapClient`, which this suite
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
const jars = {} as Record<"admin" | "aal1Admin" | "nonAdmin", Map<string, string>>;

beforeAll(async () => {
  await resetTables();
  jars.admin = (await sessionUser({ isAdmin: true, aal2: true })).jar;
  jars.aal1Admin = (await sessionUser({ isAdmin: true })).jar;
  jars.nonAdmin = (await sessionUser({ aal2: true })).jar;
}, 3 * SIGN_IN_TIMEOUT);

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
