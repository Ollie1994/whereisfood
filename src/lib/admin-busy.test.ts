import { describe, expect, it } from "vitest";
import { answered, stillBusy } from "@/lib/admin-busy";

describe("answered", () => {
  it("records the newest read sent on the row whose request answered, and no other", () => {
    const busy = [
      { id: "a", after: null },
      { id: "b", after: null },
    ];
    expect(answered(busy, "a", 4)).toEqual([
      { id: "a", after: 4 },
      { id: "b", after: null },
    ]);
  });

  it("leaves a row that already answered as it was", () => {
    expect(answered([{ id: "a", after: 2 }], "a", 4)).toEqual([{ id: "a", after: 2 }]);
  });
});

describe("stillBusy", () => {
  const busy = [
    { id: "waiting", after: null },
    { id: "a", after: 3 },
    { id: "b", after: 5 },
  ];

  it("keeps a row whose request hasn't answered, whatever read applies", () => {
    expect(stillBusy(busy, 99).map(({ id }) => id)).toEqual(["waiting"]);
  });

  it("keeps a row until a read sent after its answer applies", () => {
    expect(stillBusy(busy, 3).map(({ id }) => id)).toEqual(["waiting", "a", "b"]);
    expect(stillBusy(busy, 4).map(({ id }) => id)).toEqual(["waiting", "b"]);
    expect(stillBusy(busy, 6).map(({ id }) => id)).toEqual(["waiting"]);
  });
});
