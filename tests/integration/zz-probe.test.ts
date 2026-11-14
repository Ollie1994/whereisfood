// Probe for IS #290, never merged: a red integration test beside a red advisor lint.
import { expect, it } from "vitest";

it("fails on purpose", () => {
  expect(1).toBe(2);
});
