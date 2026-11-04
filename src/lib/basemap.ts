import type { ExpressionSpecification, LayerSpecification } from "maplibre-gl";
import { layers, namedFlavor } from "@protomaps/basemaps";

// The one POI kind the style asks for that the sprite lacks: the `pois` layer's 36 kinds
// (@protomaps/basemaps 5.7.2, the newest on npm) against the keys of sprite v4, the newest
// set, 2026-11-04. Nothing re-runs that comparison, and the package is a range. After an
// upgrade, a new kind the sprite lacks warns in the console, a sprite that gains
// `townhall` stays blank with no warning, and a `pois` with no `icon-image` fails the
// whole style (`undefined` in the `match`: validateStyleMin, PR #218 round 2).
//
// An empty `icon-image` requests no image, so MapLibre doesn't warn and the label is
// placed on its own. Don't add a blank image instead: `pois` has no `icon-optional`, so
// any image, transparent too, ties the label to the icon's placement
// (`placeIcon = placeText = placeIcon && placeText`, maplibre-gl-dev.mjs 6.11.2).
const POI_WITHOUT_ICON = "townhall";

export const BASEMAP_SOURCE = "protomaps";
export const SPRITE_URL = "https://protomaps.github.io/basemaps-assets/sprites/v4/light";

// Swedish labels. For Latin-script places (all of Gothenburg) the generated
// `text-field` is `name:sv`, then `pgf:name`, then the local `name`; `name:en`
// is only a fallback for places in other scripts.
export function basemapLayers(): LayerSpecification[] {
  return layers(BASEMAP_SOURCE, namedFlavor("light"), { lang: "sv" }).map((layer) => {
    if (layer.id !== "pois" || layer.type !== "symbol") return layer;
    const iconImage = [
      "match",
      ["get", "kind"],
      POI_WITHOUT_ICON,
      "",
      layer.layout?.["icon-image"],
    ] as ExpressionSpecification;
    return { ...layer, layout: { ...layer.layout, "icon-image": iconImage } };
  });
}
