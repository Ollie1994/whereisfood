// Text both maps show, the public map (`live.ts`'s `noticeText`) and the admin's place
// picker (`admin-place.ts`), in a module of its own: `map-setup.ts` loads MapLibre, and the
// admin screen doesn't load `live.ts` (IS #229).

// When the browser gives MapLibre no WebGL2 context (`createBaseMap`'s `NO_WEBGL2`).
export const MAP_UNSUPPORTED = "Kartan kan inte visas i den här webbläsaren.";
