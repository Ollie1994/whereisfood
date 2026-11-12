import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// `createBaseMap`'s catch (IS #246), with MapLibre mocked: the unit project runs in Node,
// where MapLibre can't build a map. `mapError` is what the mocked constructor throws.
const state = vi.hoisted(() => ({ mapError: null as Error | null }));

vi.mock("maplibre-gl", () => {
  class GPUInitializationError extends Error {}
  class Map {
    constructor() {
      if (state.mapError) throw state.mapError;
    }
  }
  return {
    GPUInitializationError,
    Map,
    getVersion: () => "0.0.0",
    setWorkerUrl: () => {},
    addProtocol: () => {},
  };
});

// `PMTILES_URL` is read when the module loads, so each test loads it afresh.
async function load() {
  vi.resetModules();
  vi.stubEnv("NEXT_PUBLIC_PMTILES_URL", "https://tiles.example/gothenburg.pmtiles");
  const maplibregl = await import("maplibre-gl");
  const setup = await import("@/lib/map-setup");
  return { maplibregl, ...setup };
}

describe("createBaseMap", () => {
  beforeEach(() => {
    state.mapError = null;
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns the map when MapLibre builds one", async () => {
    const { createBaseMap, maplibregl } = await load();
    expect(createBaseMap({} as HTMLElement)).toBeInstanceOf(maplibregl.Map);
  });

  it("returns NO_WEBGL2 when MapLibre throws GPUInitializationError", async () => {
    const { createBaseMap, maplibregl, NO_WEBGL2 } = await load();
    state.mapError = new maplibregl.GPUInitializationError({}, null);
    expect(createBaseMap({} as HTMLElement)).toBe(NO_WEBGL2);
  });

  it("throws any other error on", async () => {
    const { createBaseMap } = await load();
    state.mapError = new TypeError("a defect");
    expect(() => createBaseMap({} as HTMLElement)).toThrow("a defect");
  });

  it("returns null with no tiles URL, building no map", async () => {
    vi.resetModules();
    vi.stubEnv("NEXT_PUBLIC_PMTILES_URL", "");
    const { createBaseMap } = await import("@/lib/map-setup");
    state.mapError = new TypeError("not reached");
    expect(createBaseMap({} as HTMLElement)).toBeNull();
  });
});
