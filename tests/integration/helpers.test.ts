import { afterAll, expect, it } from "vitest";
import { supabaseAdmin } from "@/lib/supabase";
import { resetTables, seedTruck } from "./helpers";

// A stand-in for `seed.sql`'s fixed-UUID dev trucks, which `resetTables()` must never
// touch. Its id is fixed so a crashed run leaves something identifiable rather than a
// random orphan.
const BYSTANDER_ID = "99999999-9999-9999-9999-999999999999";

afterAll(async () => {
  await supabaseAdmin.from("trucks").delete().eq("id", BYSTANDER_ID);
});

it("⚠ resetTables leaves non-fixture rows alone", async () => {
  // THE REGRESSION THIS FILE EXISTS FOR. A first version deleted ALL of `locations`,
  // `posts` and `trucks` — destroying `supabase/seed.sql`'s three fixed-UUID dev trucks,
  // including the deliberately INACTIVE one Phase 2's rejection tests need. Since
  // `npm run test:all` is the documented merge gate, running the gate broke every
  // documented curl flow until someone ran `npx supabase db reset` (PR #106 review).
  await supabaseAdmin
    .from("trucks")
    .upsert({ id: BYSTANDER_ID, name: "Seed-like Truck", is_active: true });

  const fixture = await seedTruck();
  await resetTables();

  const survivor = await supabaseAdmin
    .from("trucks")
    .select("id")
    .eq("id", BYSTANDER_ID)
    .maybeSingle();
  const removed = await supabaseAdmin.from("trucks").select("id").eq("id", fixture).maybeSingle();

  expect(survivor.data?.id).toBe(BYSTANDER_ID);
  expect(removed.data).toBeNull();
}, 20_000);
