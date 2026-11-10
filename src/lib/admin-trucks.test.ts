import { describe, expect, it } from "vitest";
import { emptyTruckForm, truckCreateRequest, truckEditRequest, truckFormFrom } from "@/lib/admin-trucks";
import type { Truck } from "@/lib/types";
import { TRUCK_ERRORS } from "@/lib/validators/truck";

const TRUCK: Truck = {
  id: "11111111-1111-1111-1111-111111111111",
  name: "Burgarbilen",
  instagram_handle: "burgarbilen_gbg",
  cuisine_type: "Burgare",
  description: null,
  is_active: true,
  created_at: "2026-01-01T00:00:00+00:00",
};

describe("truckCreateRequest", () => {
  it("sends the fields as typed; the route stores the handle in its one form", () => {
    const values = { name: "Tacobilen", instagram: "@TacoBilen", cuisine: "Tacos", description: "" };
    expect(truckCreateRequest(values)).toEqual({
      ok: true,
      body: { name: "Tacobilen", instagram_handle: "@TacoBilen", cuisine_type: "Tacos", description: "" },
    });
  });

  it.each([
    ["no name", { ...emptyTruckForm() }, TRUCK_ERRORS.name],
    ["a handle with a space", { ...emptyTruckForm(), name: "X", instagram: "foo bar" }, TRUCK_ERRORS.handle],
  ])("refuses %s before any request", (_, values, error) => {
    expect(truckCreateRequest(values)).toEqual({ ok: false, error });
  });
});

describe("truckFormFrom and truckEditRequest", () => {
  it("shows a truck's fields, none as empty", () => {
    expect(truckFormFrom(TRUCK)).toEqual({
      name: "Burgarbilen",
      instagram: "burgarbilen_gbg",
      cuisine: "Burgare",
      description: "",
    });
  });

  it("sends only what changed", () => {
    expect(truckEditRequest({ ...truckFormFrom(TRUCK), description: "Smash" }, TRUCK)).toEqual({
      ok: true,
      body: { description: "Smash" },
    });
    expect(truckEditRequest({ ...truckFormFrom(TRUCK), instagram: "" }, TRUCK)).toEqual({
      ok: true,
      body: { instagram_handle: "" },
    });
  });

  it("sends an empty patch for an unchanged form; the route answers it", () => {
    expect(truckEditRequest(truckFormFrom(TRUCK), TRUCK)).toEqual({ ok: true, body: {} });
  });

  it("refuses a changed field the route would refuse", () => {
    expect(truckEditRequest({ ...truckFormFrom(TRUCK), name: "  " }, TRUCK)).toEqual({ ok: false, error: TRUCK_ERRORS.name });
  });
});
