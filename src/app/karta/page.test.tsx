import { AuthApiError, AuthRetryableFetchError } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LINK as link, SIGNED_IN, TOTP as totp, unsignedJwt as token } from "../../../tests/jwt";

// SOFT-LAUNCH GATE (Phase 10 plan #5): the gate's unit tests and the no-props test, deleted at
// the full launch (the removal list in `page.tsx`). `MapPage` runs the real `requireAdmin`;
// the request's cookies, the session client's `auth`, the db layer's `users` read, `redirect`
// and `MapClient` are stubbed. The same gate on the local stack:
// `tests/integration/map-gate.test.ts`.

const store = { names: [] as string[] };
vi.mock("next/headers", () => ({
  cookies: async () => ({ getAll: () => store.names.map((name) => ({ name, value: "x" })) }),
}));

// `redirect()` throws in Next; the stub throws too, with the path, so a test sees both that it
// answered and where to.
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

const session = { auth: null as unknown };
vi.mock("@/lib/supabase-session", () => ({
  createSessionClient: () => session,
  readOnlyCookies: (source: unknown) => source,
}));

const getUserById = vi.fn();
vi.mock("@/lib/db/users", () => ({ getUserById: (id: string) => getUserById(id) }));

function MapClientStub() {
  return null;
}
vi.mock("@/components/Map/MapClient", () => ({ default: MapClientStub }));

const { default: MapPage } = await import("@/app/karta/page");

const ID = "00000000-0000-4000-8000-000000000001";
const ADMIN = { id: ID, is_admin: true, truck_id: null, created_at: "" };
const AAL2 = token({ aal: "aal2", amr: [link, totp] });
const HOUR = 60 * 60;

// The session client's `auth`, as `admin-auth.test.ts` stubs it.
function auth({
  access = AAL2,
  userError = null as unknown,
  signOutError = null as unknown,
} = {}) {
  return {
    getSession: vi.fn(async () => ({ data: { session: { access_token: access } }, error: null })),
    getUser: vi.fn(async () => ({ data: { user: userError ? null : { id: ID } }, error: userError })),
    signOut: vi.fn(async () => ({ error: signOutError })),
  };
}

// `MapPage`'s answer: the element it renders, or the path it redirected to.
async function answer(): Promise<{ element: { type: unknown; props: object } } | { redirected: string }> {
  try {
    return { element: (await MapPage()) as { type: unknown; props: object } };
  } catch (err) {
    if (err instanceof Redirected) return { redirected: err.path };
    throw err;
  }
}

beforeEach(() => {
  store.names = ["sb-127-auth-token"];
  session.auth = auth();
  getUserById.mockReset();
  getUserById.mockResolvedValue(ADMIN);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("MapPage, the soft-launch gate", () => {
  it("renders MapClient for the admin at aal2", async () => {
    expect(await answer()).toEqual({ element: expect.objectContaining({ type: MapClientStub }) });
  });

  // The gate hides `/karta`; it protects nothing (plan #5): the check's result, the user's id
  // included, never reaches the client.
  it("passes MapClient no props", async () => {
    const result = await answer();
    if (!("element" in result)) throw new Error(`redirected to ${result.redirected}`);
    expect(result.element.props).toEqual({});
  });

  const refusals: [string, () => void][] = [
    ["no session cookie", () => (store.names = [])],
    ["an aal1 session", () => (session.auth = auth({ access: token({ aal: "aal1", amr: [link] }) }))],
    ["a non-admin", () => getUserById.mockResolvedValue({ ...ADMIN, is_admin: false })],
    ["a user with no users row", () => getUserById.mockResolvedValue(null)],
    [
      "a session past the time-box",
      () => (session.auth = auth({ access: token({ aal: "aal2", amr: [{ ...link, timestamp: SIGNED_IN - 13 * HOUR }, totp] }) })),
    ],
    [
      "a first factor that isn't magiclink",
      () => (session.auth = auth({ access: token({ aal: "aal2", amr: [{ method: "otp", timestamp: SIGNED_IN }, totp] }) })),
    ],
    [
      "a refused session whose sign-out failed",
      () =>
        (session.auth = auth({
          access: token({ aal: "aal2", amr: [{ method: "password", timestamp: SIGNED_IN }, totp] }),
          signOutError: new AuthRetryableFetchError("down", 503),
        })),
    ],
    ["a logged-out session", () => (session.auth = auth({ userError: new AuthApiError("Session not found", 403, "session_not_found") }))],
    ["Auth unavailable", () => (session.auth = auth({ userError: new AuthRetryableFetchError("down", 503) }))],
    ["a users read that fails", () => getUserById.mockRejectedValue(new Error("db down"))],
    ["a session read that throws", () => (session.auth = { getSession: () => Promise.reject(new TypeError("boom")) })],
  ];

  it.each(refusals)("sends %s to /om", async (_, arrange) => {
    arrange();
    expect(await answer()).toEqual({ redirected: "/om" });
  });
});
