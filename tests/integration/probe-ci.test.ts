// Probe for IS #285: a failing integration test. Never merged.
import { expect, it } from "vitest";

it("probe: an integration test that fails (IS #285)", () => {
  expect(1).toBe(2);
});
