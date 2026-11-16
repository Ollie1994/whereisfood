// Probe for IS #298 (integration): an integration test that fails. Never merged.
import { expect, it } from "vitest";

it("probe: an integration test that fails (IS #298)", () => {
  expect(1).toBe(2);
});
