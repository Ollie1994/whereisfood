import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { getUserById } from "@/lib/db/users";
import { createFixtureAuthUser, createFixtureUser, keysOf, resetTables } from "./helpers";

// The keys `getUserById`'s row must have, WRITTEN OUT rather than derived from a type.
// `tsc` catches a column missing from the select; only this catches an extra one (or a `*`).
const USER_KEYS = ["created_at", "id", "is_admin", "truck_id"];

beforeEach(async () => {
  await resetTables();
});

describe("getUserById", () => {
  it("returns the users row with exactly the selected keys", async () => {
    const id = await createFixtureUser();

    const user = await getUserById(id);

    expect(user).toMatchObject({ id, is_admin: false, truck_id: null });
    expect(keysOf(user!)).toEqual(USER_KEYS);
  });

  it("returns null for an auth user with no users row", async () => {
    expect(await getUserById(await createFixtureAuthUser())).toBeNull();
  });

  it("returns null for an unknown id", async () => {
    expect(await getUserById(randomUUID())).toBeNull();
  });
});
