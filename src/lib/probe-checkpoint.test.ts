// Probe for IS #298 (unit): a unit test that fails. Never merged.
import { expect, it } from "vitest";

it("probe: a unit test that fails (IS #298)", () => {
  expect(1).toBe(2);
});
