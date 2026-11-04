import { describe, expect, it } from "vitest";
import { layers, namedFlavor } from "@protomaps/basemaps";
import { basemapLayers } from "@/lib/basemap";

const packaged = () => layers("protomaps", namedFlavor("light"), { lang: "sv" });

describe("basemapLayers", () => {
  it("asks for no icon for a townhall, and the package's own for every other kind", () => {
    const pois = basemapLayers().find((layer) => layer.id === "pois");
    const original = packaged().find((layer) => layer.id === "pois");

    expect(pois?.type).toBe("symbol");
    expect(original?.type).toBe("symbol");
    if (pois?.type !== "symbol" || original?.type !== "symbol") return;
    expect(pois.layout?.["icon-image"]).toEqual([
      "match",
      ["get", "kind"],
      "townhall",
      "",
      original.layout?.["icon-image"],
    ]);
  });

  it("changes nothing else", () => {
    const withoutIcon = (list: ReturnType<typeof packaged>) =>
      list.map((layer) =>
        layer.id === "pois" && layer.type === "symbol"
          ? { ...layer, layout: { ...layer.layout, "icon-image": undefined } }
          : layer,
      );

    expect(withoutIcon(basemapLayers())).toEqual(withoutIcon(packaged()));
  });
});
