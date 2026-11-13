// Probe for IS #285: a failing unit test. Never merged.
import { expect, it } from "vitest";

it("probe: a unit test that fails (IS #285)", () => {
  expect(1).toBe(2);
});
